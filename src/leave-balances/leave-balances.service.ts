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

// Max hours that can be carried over from one year to the next
const MAX_CARRYOVER_HOURS = 80;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class LeaveBalancesService {
  constructor(@Inject('MYSQL_POOL') private readonly pool: mysql.Pool) {}

  // ---------------------------------------------------------------------------
  // POST /leave-balances/bulk-upload
  // HR seeds initial balances for the current year.
  // Skips if a record already exists for staff + leave_type + year.
  // ---------------------------------------------------------------------------
  async bulkUpload(
    dto: BulkUploadLeaveBalanceDto,
    user: RequestUser,
  ): Promise<{ created: number; skipped: number }> {
    const conn = await this.pool.getConnection();
    const currentYear = new Date().getFullYear();

    try {
      await conn.beginTransaction();

      let created = 0;
      let skipped = 0;

      for (const b of dto.balances) {
        // Validate totalHours is positive before touching the DB
        if (b.totalHours <= 0) {
          throw new BadRequestException(
            `totalHours must be positive for staffId ${b.staffId}`,
          );
        }

        // Year-scoped uniqueness check
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
            b.totalHours,
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
      return { created, skipped };
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
  //
  // FIX: transaction now wraps the entire operation including the accrual_log
  // insert so the guard and the mutations are atomic.
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
          'This leave type has no accrual configuration. Only annual leave types should be accrued.',
        );
      }

      // ── Idempotency gate: one accrual per (leave_type, year, month) ────────
      // INSERT IGNORE silently skips on duplicate key — we then check if the
      // row was actually inserted (affectedRows === 1) or already existed (0).
      const [logInsert] = await conn.query<mysql.ResultSetHeader>(
        `INSERT IGNORE INTO accrual_log
           (leave_type_id, year, month, accrued_count, skipped_count, run_by)
         VALUES (?, ?, ?, 0, 0, ?)`,
        [leaveTypeId, currentYear, currentMonth, createdBy],
      );

      if (logInsert.affectedRows === 0) {
        // Row already existed — this month has already been accrued
        await conn.rollback();
        throw new ConflictException(
          `Accrual for leave type ${leaveTypeId} has already run for ${currentYear}-${String(currentMonth).padStart(2, '0')}. ` +
            `Run it again next month or delete the accrual_log row to force a re-run.`,
        );
      }

      const logId = logInsert.insertId;

      // ── Fetch all active balances for this leave type in the current year ──
      // Join to employee so we can resolve each staff member's country-specific
      // accrual rate from leave_type_country_config.
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
        // Update log with zero counts and commit so the guard row persists
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

        // Skip if no rate resolved (staff country not configured)
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

      // Persist final counts to the log row
      await conn.query(
        `UPDATE accrual_log
         SET accrued_count = ?, skipped_count = ?
         WHERE id = ?`,
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
      // Fetch all closing-year balances for annual leave
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
        // Idempotent re-run guard
        const [existing] = await conn.query<mysql.RowDataPacket[]>(
          `SELECT id FROM leave_balances
           WHERE staff_id = ? AND leave_type_id = ? AND year = ?`,
          [closing.staff_id, annualLeaveTypeId, newYear],
        );
        if (existing.length > 0) {
          skipped++;
          continue;
        }

        // Guard against negative remaining_hours then cap at MAX_CARRYOVER_HOURS
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
  // Paginated transaction history (credits, debits, reversals) for a staff member.
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
  // Returns the full accrual history so ops can verify idempotency status.
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
