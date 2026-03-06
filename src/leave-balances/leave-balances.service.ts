import {
  Injectable,
  InternalServerErrorException,
  Inject,
} from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import { BulkUploadLeaveBalanceDto } from './dto/bulk-upload-leave-balance.dto';
import { MonthlyAccrualDto } from './dto/monthly-accrual.dto';
import { randomBytes } from 'crypto';

export interface LeaveBalance {
  id: number;
  unique_id: string;
  staff_id: number;
  leave_type_id: number;
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

@Injectable()
export class LeaveBalancesService {
  constructor(@Inject('MYSQL_POOL') private readonly pool: mysql.Pool) {}

  // POST /leave-balances/bulk-upload  (HR uploads all staff balances)
  async bulkUpload(
    dto: BulkUploadLeaveBalanceDto,
  ): Promise<{ created: number; skipped: number }> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      let created = 0;
      let skipped = 0;

      for (const b of dto.balances) {
        // Check if balance already exists for this staff + leave type
        const [existing] = await conn.query<mysql.RowDataPacket[]>(
          'SELECT id FROM leave_balances WHERE staff_id = ? AND leave_type_id = ?',
          [b.staffId, b.leaveTypeId],
        );

        if (existing.length > 0) {
          skipped++;
          continue;
        }

        const unique_id = randomBytes(16).toString('hex');

        const created_by: string = 'HR Bulk Upload';

        const [result] = await conn.query<mysql.ResultSetHeader>(
          `INSERT INTO leave_balances (unique_id, staff_id, leave_type_id, total_hours, used_hours, remaining_hours, created_by)
           VALUES (?, ?, ?, ?, 0, ?, ?)`,
          [
            unique_id,
            b.staffId,
            b.leaveTypeId,
            b.totalHours,
            b.totalHours,
            created_by,
          ],
        );

        // Log credit transaction
        await conn.query(
          `INSERT INTO leave_balance_transactions
             (unique_id, balance_id, staff_id, leave_type_id, leave_id, type, hours, note, created_by)
           VALUES (?, ?, ?, ?, NULL, 'credit', ?, 'HR bulk upload', ?)`,
          [
            unique_id,
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

  // POST /leave-balances/accrue  (Monthly accrual for annual leave type)
  async monthlyAccrue(dto: MonthlyAccrualDto): Promise<{ accrued: number }> {
    const conn = await this.pool.getConnection();
    try {
      // Get all balances for the given leave type (annual leave)
      const [balances] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id, staff_id FROM leave_balances WHERE leave_type_id = ?',
        [dto.leave_type_id],
      );

      if (!balances.length) return { accrued: 0 };

      await conn.beginTransaction();

      for (const balance of balances) {
        await conn.query(
          `UPDATE leave_balances
           SET total_hours     = total_hours + ?,
               remaining_hours = remaining_hours + ?
           WHERE id = ?`,
          [dto.hours_to_accrue, dto.hours_to_accrue, balance.id],
        );
        const unique_id = randomBytes(16).toString('hex');

        await conn.query(
          `INSERT INTO leave_balance_transactions
             (unique_id, balance_id, staff_id, leave_type_id, leave_id, type, hours, note, created_by)
           VALUES (?, ?, ?, ?, NULL, 'credit', ?, 'Monthly accrual', ?)`,
          [
            unique_id,
            balance.id,
            balance.staff_id,
            dto.leave_type_id,
            dto.hours_to_accrue,
            dto.created_by,
          ],
        );
      }

      await conn.commit();
      return { accrued: balances.length };
    } catch (err) {
      await conn.rollback();
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // GET /leave-balances/staff/:staffId
  async findByStaff(staffId: number): Promise<LeaveBalance[]> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT lb.*, lt.name AS leave_type_name, e.first_name, e.last_name, e.designation, e.location, e.program, e.department, l.name AS location_name, d.name AS department_name, p.name AS program_name
         FROM leave_balances lb
         LEFT JOIN leave_types lt ON lt.id = lb.leave_type_id
          LEFT JOIN employee e ON e.staff_id = lb.staff_id
          LEFT JOIN locations l ON l.unique_id = e.location
          LEFT JOIN departments d ON d.unique_id = e.department
          LEFT JOIN programs p ON p.unique_id = e.program
         WHERE lb.staff_id = ?
         ORDER BY lt.name ASC`,
        [staffId],
      );
      return rows as LeaveBalance[];
    } catch (err) {
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // GET /leave-balances/staff/:staffId/transactions
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
