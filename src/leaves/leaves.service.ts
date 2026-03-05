import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Inject,
} from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import { randomBytes } from 'crypto';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import {
  calculateTotalHours,
  calculateHoursForRange,
  findInternalOverlap,
  rangesOverlap,
} from '../utils/leave-hours.util';

export interface Leave {
  id: number;
  unique_id: string;
  staff_id: number;
  leave_type_id: number;
  reason: string;
  handover_note: string;
  total_hours: number;
  status: 'Pending' | 'Reviewed' | 'Approved' | 'Rejected';
  created_by: string;
  created_at: Date;
  durations?: LeaveDuration[];
}

export interface LeaveDuration {
  id: number;
  leave_id: number;
  start_date: string;
  end_date: string;
  hours: number;
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
export class LeavesService {
  constructor(@Inject('MYSQL_POOL') private readonly pool: mysql.Pool) {}

  // POST /leaves
  async create(dto: CreateLeaveDto, createdBy: string): Promise<Leave> {
    const conn = await this.pool.getConnection();
    try {
      // Validate no internal overlaps within the submitted ranges
      const internalOverlap = findInternalOverlap(dto.leaveDuration);
      if (internalOverlap) {
        throw new BadRequestException(
          `Date ranges at index ${internalOverlap.a} and ${internalOverlap.b} overlap each other`,
        );
      }

      // Validate all endDates are >= startDates
      for (const [i, d] of dto.leaveDuration.entries()) {
        if (d.endDate < d.startDate) {
          throw new BadRequestException(
            `Range at index ${i}: endDate cannot be before startDate`,
          );
        }
      }

      // Check for overlap against existing approved/pending leaves for same staff
      const [existingDurations] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT ld.start_date, ld.end_date
         FROM leave_durations ld
         INNER JOIN leaves l ON l.id = ld.leave_id
         WHERE l.staff_id = ? AND l.status IN ('Pending', 'Reviewed', 'Approved')`,
        [dto.staffId],
      );

      for (const existing of existingDurations) {
        for (const [i, d] of dto.leaveDuration.entries()) {
          if (
            rangesOverlap(
              d.startDate,
              d.endDate,
              existing.start_date as string,
              existing.end_date as string,
            )
          ) {
            throw new ConflictException(
              `Range at index ${i} overlaps with an existing leave request`,
            );
          }
        }
      }

      // Calculate hours per range and total
      const totalHours = calculateTotalHours(dto.leaveDuration);
      if (totalHours === 0) {
        throw new BadRequestException(
          'Leave duration contains no working hours (check dates fall on working days)',
        );
      }

      // Check leave balance
      const [balanceRows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT id, remaining_hours FROM leave_balances
         WHERE staff_id = ? AND leave_type_id = ?`,
        [dto.staffId, dto.leaveTypeId],
      );
      if (!balanceRows.length) {
        throw new BadRequestException(
          'No leave balance found for this staff and leave type',
        );
      }
      const balance = balanceRows[0];
      if ((balance.remaining_hours as number) < totalHours) {
        throw new BadRequestException(
          `Insufficient leave balance. Required: ${totalHours}hrs, Available: ${balance.remaining_hours}hrs`,
        );
      }

      // Insert leave record
      await conn.beginTransaction();

      const unique_id = randomBytes(16).toString('hex');

      const [result] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO leaves (unique_id, staff_id, leave_type_id, reason, handover_note, total_hours, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?)`,
        [
          unique_id,
          dto.staffId,
          dto.leaveTypeId,
          dto.reason,
          dto.handoverNote,
          totalHours,
          createdBy,
        ],
      );
      const leaveId = result.insertId;

      // 7. Insert each duration row
      for (const d of dto.leaveDuration) {
        const hours = calculateHoursForRange(d.startDate, d.endDate);
        await conn.query(
          `INSERT INTO leave_durations (leave_id, start_date, end_date, hours)
           VALUES (?, ?, ?, ?)`,
          [leaveId, d.startDate, d.endDate, hours],
        );
      }

      await conn.commit();
      return this.findOne(leaveId);
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

  // GET /leaves
  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<Leave>> {
    const conn = await this.pool.getConnection();
    try {
      const page = query.page ?? 1;
      const limit = query.limit ?? 10;
      const offset = (page - 1) * limit;

      const conditions: string[] = [];
      const params: (string | number)[] = [];

      if (query.status) {
        conditions.push('l.status = ?');
        params.push(query.status);
      }
      if (query.staffId) {
        conditions.push('l.staff_id = ?');
        params.push(query.staffId);
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const [[countRow]] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM leaves l ${whereClause}`,
        params,
      );
      const total = countRow['total'] as number;

      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `
        SELECT l.*, 
  CONCAT(s.first_name, ' ', s.last_name) AS supervisor_name, 
  o.name AS location_name, 
  p.name AS program_name, 
  d.name AS department_name, 
  CONCAT(e.first_name, ' ', e.last_name) AS employee_name, 
  e.designation AS employee_designation 
FROM leaves l
LEFT JOIN departments d ON d.unique_id = l.department_id 
LEFT JOIN employee e ON e.staff_id = l.staff_id
LEFT JOIN programs p ON p.unique_id = l.program 
LEFT JOIN locations o ON o.unique_id = l.location 
LEFT JOIN employee s ON s.staff_id = l.supervisor 
${whereClause}
ORDER BY l.created_at DESC
LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );

      return {
        data: rows as Leave[],
        meta: { total, page, limit, last_page: Math.ceil(total / limit) },
      };
    } catch (err) {
      console.error('Error fetching leaves:', err);
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // GET /leaves/:id
  async findOne(id: number): Promise<Leave> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM leaves WHERE id = ?',
        [id],
      );
      if (!rows.length)
        throw new NotFoundException(`Leave with id ${id} not found`);

      const leave = rows[0] as Leave;

      const [durations] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM leave_durations WHERE leave_id = ? ORDER BY start_date ASC',
        [id],
      );
      leave.durations = durations as LeaveDuration[];

      return leave;
    } catch (err) {
      console.log(`Error fetching leave with id ${id}:`, err);
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // PATCH /leaves/:id/review  (HR)
  async review(id: number): Promise<Leave> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id, status FROM leaves WHERE id = ?',
        [id],
      );
      if (!rows.length)
        throw new NotFoundException(`Leave with id ${id} not found`);

      if (rows[0].status !== 'Pending') {
        throw new BadRequestException(
          `Only Pending leaves can be reviewed. Current status: ${rows[0].status}`,
        );
      }

      await conn.query(`UPDATE leaves SET status = 'Reviewed' WHERE id = ?`, [
        id,
      ]);

      return this.findOne(id);
    } catch (err) {
      console.log(`Error reviewing leave with id ${id}:`, err);
      if (
        err instanceof NotFoundException ||
        err instanceof BadRequestException
      )
        throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // PATCH /leaves/:id/approve  (Supervisor)
  async approve(id: number, approvedBy: string): Promise<Leave> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM leaves WHERE id = ?',
        [id],
      );
      if (!rows.length)
        throw new NotFoundException(`Leave with id ${id} not found`);

      const leave = rows[0] as Leave;

      if (leave.status !== 'Reviewed') {
        throw new BadRequestException(
          `Only Reviewed leaves can be approved. Current status: ${leave.status}`,
        );
      }

      // Re-check balance at time of approval
      const [balanceRows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT id, remaining_hours FROM leave_balances
         WHERE staff_id = ? AND leave_type_id = ?`,
        [leave.staff_id, leave.leave_type_id],
      );
      if (!balanceRows.length)
        throw new BadRequestException('Leave balance record not found');

      const balance = balanceRows[0];
      if ((balance.remaining_hours as number) < leave.total_hours) {
        throw new BadRequestException(
          `Insufficient balance at time of approval. Required: ${leave.total_hours}hrs, Available: ${balance.remaining_hours}hrs`,
        );
      }

      await conn.beginTransaction();

      // Update leave status
      await conn.query(`UPDATE leaves SET status = 'Approved' WHERE id = ?`, [
        id,
      ]);

      // Deduct balance
      await conn.query(
        `UPDATE leave_balances
         SET used_hours      = used_hours + ?,
             remaining_hours = remaining_hours - ?
         WHERE id = ?`,
        [leave.total_hours, leave.total_hours, balance.id],
      );
      const unique_id = randomBytes(16).toString('hex');

      // Log transaction
      await conn.query(
        `INSERT INTO leave_balance_transactions
           (unique_id, balance_id, staff_id, leave_type_id, leave_id, type, hours, note, created_by)
         VALUES (?, ?, ?, ?, ?, 'debit', ?, ?, ?)`,
        [
          unique_id,
          balance.id,
          leave.staff_id,
          leave.leave_type_id,
          id,
          leave.total_hours,
          `Leave approved - deducted ${leave.total_hours}hrs`,
          approvedBy,
        ],
      );

      await conn.commit();
      return this.findOne(id);
    } catch (err) {
      console.log(`Error approving leave with id ${id}:`, err);
      await conn.rollback();
      if (
        err instanceof NotFoundException ||
        err instanceof BadRequestException
      )
        throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // PATCH /leaves/:id/reject
  async reject(id: number, rejectedBy: string): Promise<Leave> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM leaves WHERE id = ?',
        [id],
      );
      if (!rows.length)
        throw new NotFoundException(`Leave with id ${id} not found`);

      const leave = rows[0] as Leave;

      if (!['Reviewed', 'Approved'].includes(leave.status)) {
        throw new BadRequestException(
          `Only Reviewed or Approved leaves can be rejected. Current status: ${leave.status}`,
        );
      }

      await conn.beginTransaction();

      await conn.query(`UPDATE leaves SET status = 'Rejected' WHERE id = ?`, [
        id,
      ]);

      // If was Approved, restore balance
      if (leave.status === 'Approved') {
        const [balanceRows] = await conn.query<mysql.RowDataPacket[]>(
          `SELECT id FROM leave_balances WHERE staff_id = ? AND leave_type_id = ?`,
          [leave.staff_id, leave.leave_type_id],
        );
        if (balanceRows.length) {
          const balanceId = balanceRows[0].id as number;

          await conn.query(
            `UPDATE leave_balances
             SET used_hours      = used_hours - ?,
                 remaining_hours = remaining_hours + ?
             WHERE id = ?`,
            [leave.total_hours, leave.total_hours, balanceId],
          );

          const unique_id = randomBytes(16).toString('hex');

          await conn.query(
            `INSERT INTO leave_balance_transactions
               (unique_id, balance_id, staff_id, leave_type_id, leave_id, type, hours, note, created_by)
             VALUES (?, ?, ?, ?, ?, 'reversal', ?, ?, ?)`,
            [
              unique_id,
              balanceId,
              leave.staff_id,
              leave.leave_type_id,
              id,
              leave.total_hours,
              `Leave rejected - restored ${leave.total_hours}hrs`,
              rejectedBy,
            ],
          );
        }
      }

      await conn.commit();
      return this.findOne(id);
    } catch (err) {
      await conn.rollback();
      if (
        err instanceof NotFoundException ||
        err instanceof BadRequestException
      )
        throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }
}
