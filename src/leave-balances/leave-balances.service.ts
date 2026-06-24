import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import { BulkUploadLeaveBalanceDto } from './dto/bulk-upload-leave-balance.dto';
import { randomBytes } from 'crypto';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface LeaveBalance {
  id: number;
  unique_id: string;
  staff_id: number;
  leave_type_id: string;
  year: number;
  total_hours: number;
  used_hours: number;
  remaining_hours: number;
  created_by: string;
  created_at: Date;
  // joined fields
  leave_type_name?: string;
  first_name?: string;
  last_name?: string;
  location_name?: string;
  department_name?: string;
  program_name?: string;
}

export interface LeaveBalanceTransaction {
  id: number;
  unique_id: string;
  balance_id: number;
  staff_id: number;
  leave_type_id: string;
  leave_id: number | null;
  type: 'credit' | 'debit' | 'reversal';
  hours: number;
  note: string;
  created_by: string;
  created_at: Date;
  // joined fields
  leave_type_name?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    last_page: number;
  };
}

export interface StaffBalanceSummary {
  staff_id: string;
  full_name: string;
  designation: string | null;
  department_name: string | null;
  location_name: string | null;
  program_name: string | null;
  balances: {
    leave_type_id: string;
    leave_type_name: string;
    total_hours: number;
    used_hours: number;
    remaining_hours: number;
  }[];
}

// Max hours that can be carried over from one year to the next
const MAX_CARRYOVER_HOURS = 80;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class LeaveBalancesService {
  constructor(@Inject('MYSQL_POOL') private readonly pool: mysql.Pool) {}

  // ---------------------------------------------------------------------------
  // POST /leave-balances/bulk-upload
  //
  // HR seeds initial balances for the current year.
  //
  // DECISIONS:
  //   1. totalHours === 0 → skip silently (zero-balance staff have nothing to
  //      seed; they get a row when HR manually allocates or at rollover).
  //      We do NOT throw — the caller sees { created, skipped } and can audit.
  //   2. totalHours < 0 → throw BadRequestException immediately (data error).
  //   3. Already-existing row for (staff, leaveType, year) → skip (idempotent).
  //   4. All inserts run inside ONE transaction; any DB error rolls back the
  //      entire batch so the caller can fix and retry cleanly.
  // ---------------------------------------------------------------------------
  async bulkUpload(
    dto: BulkUploadLeaveBalanceDto,
    user: RequestUser,
  ): Promise<{ created: number; skipped: number; zeroed: number }> {
    const conn = await this.pool.getConnection();
    const currentYear = new Date().getFullYear();

    // ── Pre-flight validation (outside transaction — fail fast) ──────────────
    const negatives = dto.balances.filter((b) => b.totalHours < 0);
    if (negatives.length) {
      conn.release();
      throw new BadRequestException(
        `${negatives.length} record(s) have negative totalHours. ` +
          `First offender: staffId=${negatives[0].staffId}, hours=${negatives[0].totalHours}`,
      );
    }

    try {
      await conn.beginTransaction();

      let created = 0;
      let skipped = 0;
      let zeroed = 0;

      for (const b of dto.balances) {
        // Zero balance — record the count but do not insert a row.
        // There is nothing meaningful to seed; the approval guard will still
        // block correctly because no balance row means zero available.
        if (b.totalHours === 0) {
          zeroed++;
          continue;
        }

        // Year-scoped uniqueness check — skip duplicates (idempotent re-runs)
        const [existing] = await conn.query<mysql.RowDataPacket[]>(
          `SELECT id FROM leave_balances
           WHERE staff_id = ? AND leave_type_id = ? AND year = ?`,
          [b.staffId, b.leaveTypeId, currentYear],
        );

        if (existing.length > 0) {
          skipped++;
          continue;
        }

        const unique_id = randomBytes(16).toString('hex');
        const created_by = user.email || 'System';

        const [result] = await conn.query<mysql.ResultSetHeader>(
          `INSERT INTO leave_balances
             (unique_id, staff_id, leave_type_id, year, total_hours, used_hours, remaining_hours, created_by)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
          [
            unique_id,
            b.staffId,
            b.leaveTypeId,
            currentYear,
            b.totalHours,
            b.totalHours, // remaining = total at creation
            created_by,
          ],
        );

        await conn.query(
          `INSERT INTO leave_balance_transactions
             (unique_id, balance_id, staff_id, leave_type_id, leave_id, type, hours, note, created_by)
           VALUES (?, ?, ?, ?, NULL, 'credit', ?, 'HR bulk upload', ?)`,
          [
            randomBytes(16).toString('hex'),
            result.insertId,
            b.staffId,
            b.leaveTypeId,
            b.totalHours,
            created_by,
          ],
        );

        created++;
      }

      await conn.commit();
      return { created, skipped, zeroed };
    } catch (err) {
      await conn.rollback();
      if (err instanceof BadRequestException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // ---------------------------------------------------------------------------
  // POST /leave-balances/accrue
  // Runs monthly (via cron / PM2 scheduled task).
  //
  // IDEMPOTENCY: Before doing any work, we attempt to INSERT a row into
  // accrual_log for (leave_type_id, year, month). The table has a UNIQUE
  // constraint on those three columns. If the row already exists this INSERT
  // throws a duplicate-key error which we catch and convert to a
  // ConflictException — telling the caller the month was already accrued.
  // This means running the job twice in the same calendar month is completely
  // safe: the second run exits cleanly with no mutations.
  // ---------------------------------------------------------------------------
  async monthlyAccrue(
    leaveTypeId: string,
    createdBy: string,
  ): Promise<{
    accrued: number;
    skipped: number;
    month: number;
    year: number;
  }> {
    const conn = await this.pool.getConnection();
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12

    try {
      await conn.beginTransaction();

      // ── Guard: verify this leave type actually has accrual config ──────────
      const [typeCheck] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT COUNT(*) AS cnt
         FROM leave_type_country_config
         WHERE leave_type_id = ? AND monthly_accrual_hours IS NOT NULL`,
        [leaveTypeId],
      );
      if (Number(typeCheck[0].cnt) === 0) {
        await conn.rollback();
        throw new BadRequestException(
          'This leave type has no accrual configuration. Only accrual leave types should be accrued.',
        );
      }

      // ── Idempotency gate ───────────────────────────────────────────────────
      const [logInsert] = await conn.query<mysql.ResultSetHeader>(
        `INSERT IGNORE INTO accrual_log
           (leave_type_id, year, month, accrued_count, skipped_count, run_by)
         VALUES (?, ?, ?, 0, 0, ?)`,
        [leaveTypeId, currentYear, currentMonth, createdBy],
      );

      if (logInsert.affectedRows === 0) {
        await conn.rollback();
        throw new ConflictException(
          `Accrual for leave type ${leaveTypeId} has already run for ` +
            `${currentYear}-${String(currentMonth).padStart(2, '0')}. ` +
            `Run it again next month or delete the accrual_log row to force a re-run.`,
        );
      }

      const logId = logInsert.insertId;

      // ── Fetch all active balances for this leave type ──────────────────────
      const [balances] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT
           lb.id                       AS balance_id,
           lb.staff_id,
           ltcc.monthly_accrual_hours
         FROM leave_balances lb
         INNER JOIN employee e
           ON e.staff_id = lb.staff_id
         INNER JOIN leave_type_country_config ltcc
           ON ltcc.leave_type_id = lb.leave_type_id
           AND ltcc.country      = e.country
         WHERE lb.leave_type_id = ?
           AND lb.year          = ?`,
        [leaveTypeId, currentYear],
      );

      if (!balances.length) {
        await conn.query(
          `UPDATE accrual_log SET accrued_count = 0, skipped_count = 0 WHERE id = ?`,
          [logId],
        );
        await conn.commit();
        return {
          accrued: 0,
          skipped: 0,
          month: currentMonth,
          year: currentYear,
        };
      }

      let accrued = 0;
      let skipped = 0;

      for (const balance of balances) {
        const hoursToAccrue = Number(balance.monthly_accrual_hours);

        if (!hoursToAccrue || hoursToAccrue <= 0) {
          skipped++;
          continue;
        }

        await conn.query(
          `UPDATE leave_balances
           SET total_hours     = total_hours + ?,
               remaining_hours = remaining_hours + ?
           WHERE id = ?`,
          [hoursToAccrue, hoursToAccrue, balance.balance_id],
        );

        await conn.query(
          `INSERT INTO leave_balance_transactions
             (unique_id, balance_id, staff_id, leave_type_id, leave_id, type, hours, note, created_by)
           VALUES (?, ?, ?, ?, NULL, 'credit', ?, ?, ?)`,
          [
            randomBytes(16).toString('hex'),
            balance.balance_id,
            balance.staff_id,
            leaveTypeId,
            hoursToAccrue,
            `Monthly accrual — ${currentYear}-${String(currentMonth).padStart(2, '0')}`,
            createdBy,
          ],
        );

        accrued++;
      }

      await conn.query(
        `UPDATE accrual_log SET accrued_count = ?, skipped_count = ? WHERE id = ?`,
        [accrued, skipped, logId],
      );

      await conn.commit();
      return { accrued, skipped, month: currentMonth, year: currentYear };
    } catch (err) {
      await conn.rollback();
      if (
        err instanceof BadRequestException ||
        err instanceof ConflictException
      )
        throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // ---------------------------------------------------------------------------
  // POST /leave-balances/rollover
  // Runs once on Jan 1 each year (PM2 cron).
  // For each staff member's annual leave balance from the closing year:
  //   - caps unused hours at MAX_CARRYOVER_HOURS (80)
  //   - guards against negative remaining_hours (over-approved edge case)
  //   - seeds a new leave_balances row for the new year
  // Idempotent: skips staff who already have a new-year row.
  // ---------------------------------------------------------------------------
  async rolloverYear(
    annualLeaveTypeId: string,
    createdBy: string,
  ): Promise<{
    rolled: number;
    skipped: number;
    closingYear: number;
    newYear: number;
  }> {
    const conn = await this.pool.getConnection();
    const closingYear = new Date().getFullYear() - 1;
    const newYear = closingYear + 1;

    try {
      const [closingBalances] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT id, staff_id, remaining_hours
         FROM leave_balances
         WHERE leave_type_id = ? AND year = ?`,
        [annualLeaveTypeId, closingYear],
      );

      if (!closingBalances.length) {
        return { rolled: 0, skipped: 0, closingYear, newYear };
      }

      await conn.beginTransaction();

      let rolled = 0;
      let skipped = 0;

      for (const closing of closingBalances) {
        const [existing] = await conn.query<mysql.RowDataPacket[]>(
          `SELECT id FROM leave_balances
           WHERE staff_id = ? AND leave_type_id = ? AND year = ?`,
          [closing.staff_id, annualLeaveTypeId, newYear],
        );
        if (existing.length > 0) {
          skipped++;
          continue;
        }

        const carryover = Math.min(
          Math.max(0, Number(closing.remaining_hours)),
          MAX_CARRYOVER_HOURS,
        );

        const unique_id = randomBytes(16).toString('hex');

        const [result] = await conn.query<mysql.ResultSetHeader>(
          `INSERT INTO leave_balances
             (unique_id, staff_id, leave_type_id, year, total_hours, used_hours, remaining_hours, created_by)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
          [
            unique_id,
            closing.staff_id,
            annualLeaveTypeId,
            newYear,
            carryover,
            carryover,
            createdBy,
          ],
        );

        await conn.query(
          `INSERT INTO leave_balance_transactions
             (unique_id, balance_id, staff_id, leave_type_id, leave_id, type, hours, note, created_by)
           VALUES (?, ?, ?, ?, NULL, 'credit', ?, ?, ?)`,
          [
            randomBytes(16).toString('hex'),
            result.insertId,
            closing.staff_id,
            annualLeaveTypeId,
            carryover,
            `Year rollover from ${closingYear} (capped at ${MAX_CARRYOVER_HOURS} hrs)`,
            createdBy,
          ],
        );

        rolled++;
      }

      await conn.commit();
      return { rolled, skipped, closingYear, newYear };
    } catch (err) {
      await conn.rollback();
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // ---------------------------------------------------------------------------
  // GET /leave-balances
  // All staff balances for the current (or requested) year, paginated.
  // Each staff entry includes a nested `balances` array — one entry per leave
  // type — so the frontend can render a balance matrix without a second call.
  //
  // Optional query params:
  //   year   — defaults to current year
  //   search — partial match on first_name, last_name, or staff_id
  //   page / limit
  // ---------------------------------------------------------------------------
  async findAll(
    page: number = 1,
    limit: number = 20,
    year?: number,
    search?: string,
  ): Promise<PaginatedResult<StaffBalanceSummary>> {
    const conn = await this.pool.getConnection();
    const targetYear = year ?? new Date().getFullYear();

    try {
      const conditions: string[] = ['lb2.year = ?'];
      const params: (string | number)[] = [targetYear];

      if (search) {
        conditions.push(
          `(e2.first_name LIKE ? OR e2.last_name LIKE ? OR lb2.staff_id LIKE ?)`,
        );
        const term = `%${search}%`;
        params.push(term, term, term);
      }

      const where = `WHERE ${conditions.join(' AND ')}`;

      // Count query uses lb/e aliases (not lb2/e2 which are subquery-scoped)
      const countConditions: string[] = ['lb.year = ?'];
      const countParams: (string | number)[] = [targetYear];

      if (search) {
        countConditions.push(
          `(e.first_name LIKE ? OR e.last_name LIKE ? OR lb.staff_id LIKE ?)`,
        );
        const term = `%${search}%`;
        countParams.push(term, term, term);
      }

      const countWhere = `WHERE ${countConditions.join(' AND ')}`;

      // Count distinct staff members who have at least one balance row
      const [[countRow]] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT COUNT(DISTINCT lb.staff_id) AS total
         FROM leave_balances lb
         LEFT JOIN employee e ON e.staff_id = lb.staff_id
         ${countWhere}`,
        countParams,
      );
      const total = Number(countRow.total);

      const offset = (page - 1) * limit;

      // Fetch all balance rows for the page of staff members in one query.
      // We first identify the paged staff_ids via a subquery, then join all
      // their balance rows — avoiding N+1 queries.
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT
           lb.staff_id,
           CONCAT(e.first_name, ' ', e.last_name) AS full_name,
           e.designation,
           lb.leave_type_id,
           lt.name   AS leave_type_name,
           lb.total_hours,
           lb.used_hours,
           lb.remaining_hours,
           d.name    AS department_name,
           l.name    AS location_name,
           p.name    AS program_name
         FROM leave_balances lb
         LEFT JOIN employee e     ON e.staff_id   = lb.staff_id
         LEFT JOIN leave_types lt  ON lt.unique_id = lb.leave_type_id
         LEFT JOIN departments d   ON d.unique_id  = e.department
         LEFT JOIN locations l     ON l.unique_id  = e.location
         LEFT JOIN programs p      ON p.unique_id  = e.program
         INNER JOIN (
           SELECT DISTINCT lb2.staff_id
           FROM leave_balances lb2
           LEFT JOIN employee e2 ON e2.staff_id = lb2.staff_id
           ${where}
           ORDER BY lb2.staff_id ASC
           LIMIT ? OFFSET ?
         ) paged ON paged.staff_id = lb.staff_id
         AND lb.year = ?
         ORDER BY lb.staff_id ASC, lt.name ASC`,
        [...params, limit, offset, targetYear],
      );

      // Group flat rows into per-staff summaries
      const summaryMap = new Map<string, StaffBalanceSummary>();
      for (const r of rows) {
        const key = String(r.staff_id);
        if (!summaryMap.has(key)) {
          summaryMap.set(key, {
            staff_id: key,
            full_name: (r.full_name as string) ?? key,
            designation: (r.designation as string) ?? null,
            department_name: (r.department_name as string) ?? null,
            location_name: (r.location_name as string) ?? null,
            program_name: (r.program_name as string) ?? null,
            balances: [],
          });
        }
        summaryMap.get(key)!.balances.push({
          leave_type_id: r.leave_type_id as string,
          leave_type_name: (r.leave_type_name as string) ?? r.leave_type_id,
          total_hours: Number(r.total_hours),
          used_hours: Number(r.used_hours),
          remaining_hours: Number(r.remaining_hours),
        });
      }

      return {
        data: [...summaryMap.values()],
        meta: { total, page, limit, last_page: Math.ceil(total / limit) },
      };
    } catch (err) {
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // ---------------------------------------------------------------------------
  // GET /leave-balances/staff/:staffId
  // Returns current-year balances for all leave types for a given staff member.
  // ---------------------------------------------------------------------------
  async findByStaff(staffId: number): Promise<LeaveBalance[]> {
    const conn = await this.pool.getConnection();
    const currentYear = new Date().getFullYear();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT
           lb.*,
           lt.name  AS leave_type_name,
           e.first_name,
           e.last_name,
           e.supervisor,
           e.designation,
           e.location,
           e.program,
           e.department,
           l.name   AS location_name,
           d.name   AS department_name,
           p.name   AS program_name
         FROM leave_balances lb
         LEFT JOIN leave_types lt  ON lt.unique_id  = lb.leave_type_id
         LEFT JOIN employee e      ON e.staff_id     = lb.staff_id
         LEFT JOIN locations l     ON l.unique_id    = e.location
         LEFT JOIN departments d   ON d.unique_id    = e.department
         LEFT JOIN programs p      ON p.unique_id    = e.program
         WHERE lb.staff_id = ? AND lb.year = ?
         ORDER BY lt.name ASC`,
        [staffId, currentYear],
      );
      return rows as LeaveBalance[];
    } catch (err) {
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // ---------------------------------------------------------------------------
  // GET /leave-balances/staff/:staffId/transactions
  // Paginated transaction history for a staff member.
  // ---------------------------------------------------------------------------
  async findTransactionsByStaff(
    staffId: number,
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedResult<LeaveBalanceTransaction>> {
    const conn = await this.pool.getConnection();
    try {
      const offset = (page - 1) * limit;

      const [[countRow]] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT COUNT(*) AS total FROM leave_balance_transactions WHERE staff_id = ?',
        [staffId],
      );
      const total = countRow['total'] as number;

      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT lbt.*, lt.name AS leave_type_name
         FROM leave_balance_transactions lbt
         LEFT JOIN leave_types lt ON lt.unique_id = lbt.leave_type_id
         WHERE lbt.staff_id = ?
         ORDER BY lbt.created_at DESC
         LIMIT ? OFFSET ?`,
        [staffId, limit, offset],
      );

      return {
        data: rows as LeaveBalanceTransaction[],
        meta: { total, page, limit, last_page: Math.ceil(total / limit) },
      };
    } catch (err) {
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // ---------------------------------------------------------------------------
  // GET /leave-balances/accrual-log
  // ---------------------------------------------------------------------------
  async findAccrualLog(
    leaveTypeId?: string,
    year?: number,
  ): Promise<mysql.RowDataPacket[]> {
    const conn = await this.pool.getConnection();
    try {
      const conditions: string[] = [];
      const params: (string | number)[] = [];

      if (leaveTypeId) {
        conditions.push('al.leave_type_id = ?');
        params.push(leaveTypeId);
      }
      if (year) {
        conditions.push('al.year = ?');
        params.push(year);
      }

      const where = conditions.length
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT al.*, lt.name AS leave_type_name
         FROM accrual_log al
         LEFT JOIN leave_types lt ON lt.unique_id = al.leave_type_id
         ${where}
         ORDER BY al.year DESC, al.month DESC`,
        params,
      );
      return rows;
    } catch (err) {
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }
}
