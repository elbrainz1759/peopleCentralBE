import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import { BulkUploadLeaveBalanceDto } from './dto/bulk-upload-leave-balance.dto';
import { randomBytes } from 'crypto';

export interface LeaveBalance {
  id: number;
  unique_id: string;
  staff_id: number;
  leave_type_id: number;
  year: number;
  total_hours: number;
  used_hours: number;
  remaining_hours: number;
  created_by: string;
  created_at: Date;
}

export interface LeaveBalanceTransaction {
  id: number;
  unique_id: string;
  balance_id: number;
  staff_id: number;
  leave_type_id: number;
  leave_id: number | null;
  type: 'credit' | 'debit' | 'reversal';
  hours: number;
  note: string;
  created_by: string;
  created_at: Date;
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
  ): Promise<{ created: number; skipped: number }> {
    const conn = await this.pool.getConnection();
    const currentYear = new Date().getFullYear();

    try {
      await conn.beginTransaction();

      let created = 0;
      let skipped = 0;

      for (const b of dto.balances) {
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
        const created_by = 'HR Bulk Upload';

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
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // ---------------------------------------------------------------------------
  // POST /leave-balances/accrue
  // Runs monthly (via cron/PM2 scheduled task).
  // Accrues hours for ALL annual-leave staff, using each staff member's
  // country-specific monthly rate from leave_type_country_config.
  // Non-accrual leave types are skipped automatically.
  // ---------------------------------------------------------------------------
  async monthlyAccrue(
    leaveTypeId: number,
    createdBy: string,
  ): Promise<{ accrued: number; skipped: number }> {
    const conn = await this.pool.getConnection();
    const currentYear = new Date().getFullYear();

    try {
      // Verify this leave type actually has accrual configured somewhere.
      const [typeCheck] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT COUNT(*) AS cnt FROM leave_type_country_config
         WHERE leave_type_id = ? AND monthly_accrual_hours IS NOT NULL`,
        [leaveTypeId],
      );
      if (Number(typeCheck[0].cnt) === 0) {
        throw new BadRequestException(
          'This leave type has no accrual configuration. Only annual leave should be accrued.',
        );
      }

      // Fetch all balances for this leave type in the current year,
      // joined to employee so we can resolve their country's accrual rate.
      const [balances] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT
           lb.id            AS balance_id,
           lb.staff_id,
           ltcc.monthly_accrual_hours
         FROM leave_balances lb
         INNER JOIN employee e ON e.staff_id = lb.staff_id
         INNER JOIN leave_type_country_config ltcc
           ON ltcc.leave_type_id = lb.leave_type_id
           AND ltcc.country = e.country
         WHERE lb.leave_type_id = ? AND lb.year = ?`,
        [leaveTypeId, currentYear],
      );

      if (!balances.length) return { accrued: 0, skipped: 0 };

      await conn.beginTransaction();

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
           VALUES (?, ?, ?, ?, NULL, 'credit', ?, 'Monthly accrual', ?)`,
          [
            randomBytes(16).toString('hex'),
            balance.balance_id,
            balance.staff_id,
            leaveTypeId,
            hoursToAccrue,
            createdBy,
          ],
        );

        accrued++;
      }

      await conn.commit();
      return { accrued, skipped };
    } catch (err) {
      await conn.rollback();
      if (err instanceof BadRequestException) throw err;
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
  //   - seeds a new leave_balances row for the new year with that as the opening balance
  // ---------------------------------------------------------------------------
  async rolloverYear(
    annualLeaveTypeId: number,
    createdBy: string,
  ): Promise<{ rolled: number; skipped: number }> {
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

      if (!closingBalances.length) return { rolled: 0, skipped: 0 };

      await conn.beginTransaction();

      let rolled = 0;
      let skipped = 0;

      for (const closing of closingBalances) {
        // Skip if new-year balance already seeded (idempotent re-runs)
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
          Number(closing.remaining_hours),
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
            `Year rollover from ${closingYear} (capped at ${MAX_CARRYOVER_HOURS}hrs)`,
            createdBy,
          ],
        );

        rolled++;
      }

      await conn.commit();
      return { rolled, skipped };
    } catch (err) {
      await conn.rollback();
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // ---------------------------------------------------------------------------
  // GET /leave-balances/staff/:staffId
  // ---------------------------------------------------------------------------
  async findByStaff(staffId: number): Promise<LeaveBalance[]> {
    const conn = await this.pool.getConnection();
    const currentYear = new Date().getFullYear();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT
           lb.*,
           lt.name          AS leave_type_name,
           e.first_name,
           e.last_name,
           e.supervisor,
           e.designation,
           e.location,
           e.program,
           e.department,
           l.name           AS location_name,
           d.name           AS department_name,
           p.name           AS program_name
         FROM leave_balances lb
         LEFT JOIN leave_types lt    ON lt.id = lb.leave_type_id
         LEFT JOIN employee e        ON e.staff_id = lb.staff_id
         LEFT JOIN locations l       ON l.unique_id = e.location
         LEFT JOIN departments d     ON d.unique_id = e.department
         LEFT JOIN programs p        ON p.unique_id = e.program
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
        `SELECT * FROM leave_balance_transactions
         WHERE staff_id = ?
         ORDER BY created_at DESC
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
}
