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

  // ---------------------------------------------------------------------------
  // Shared balance validation used by both create() and approve().
  // For annual leave (monthly_accrual_hours IS NOT NULL):
  //   available = carryover_from_leave_balances + months_elapsed × monthly_rate − used_this_year
  // For all other leave types:
  //   available = country_annual_entitlement − used_this_year
  // ---------------------------------------------------------------------------
  private async validateAndComputeBalance(
    conn: mysql.PoolConnection,
    staffId: number,
    leaveTypeId: number,
    totalHours: number,
    currentYear: number,
    currentMonth: number, // 1–12
  ): Promise<void> {
    // 1. Resolve staff country directly from employee record
    const [staffRows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT country FROM employee WHERE staff_id = ?`,
      [staffId],
    );
    if (!staffRows.length) {
      throw new BadRequestException('Staff record not found');
    }
    const country = staffRows[0].country as string;

    // 2. Get country-specific policy for this leave type
    const [configRows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT annual_hours, monthly_accrual_hours
       FROM leave_type_country_config
       WHERE leave_type_id = ? AND country = ?`,
      [leaveTypeId, country],
    );
    if (!configRows.length) {
      throw new BadRequestException(
        `No leave policy configured for this leave type in ${country}`,
      );
    }
    const config = configRows[0];
    const isAccrual = config.monthly_accrual_hours != null;

    // 3. Hours already consumed this year across pending/reviewed/approved leaves
    const [usedRows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT COALESCE(SUM(total_hours), 0) AS used_hours
       FROM leaves
       WHERE staff_id = ?
         AND leave_type_id = ?
         AND status IN ('Pending', 'Reviewed', 'Approved')
         AND YEAR(created_at) = ?`,
      [staffId, leaveTypeId, currentYear],
    );
    const usedHours = Number(usedRows[0].used_hours);

    let availableHours: number;

    if (isAccrual) {
      // Annual leave: carryover balance seeded at year start + accrued so far
      const [balanceRows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT remaining_hours FROM leave_balances
         WHERE staff_id = ? AND leave_type_id = ? AND year = ?`,
        [staffId, leaveTypeId, currentYear],
      );
      // If no balance row yet (new staff mid-year), carryover defaults to 0
      const carryover = balanceRows.length
        ? Number(balanceRows[0].remaining_hours)
        : 0;

      // Full month credited on the 1st of each month.
      // Change to (currentMonth - 1) if rule is: earn after completing the month.
      const accruedHours = currentMonth * Number(config.monthly_accrual_hours);
      availableHours = carryover + accruedHours - usedHours;
    } else {
      // Fixed entitlement: flat country cap minus what's used this year
      availableHours = Number(config.annual_hours) - usedHours;
    }

    if (availableHours < totalHours) {
      throw new BadRequestException(
        `Insufficient leave balance. Required: ${totalHours}hrs, Available: ${availableHours.toFixed(2)}hrs`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // POST /leaves
  // ---------------------------------------------------------------------------
  async create(dto: CreateLeaveDto, createdBy: string): Promise<Leave> {
    const conn = await this.pool.getConnection();
    try {
      // 1. No internal overlaps within submitted ranges
      const internalOverlap = findInternalOverlap(dto.leaveDuration);
      if (internalOverlap) {
        throw new BadRequestException(
          `Date ranges at index ${internalOverlap.a} and ${internalOverlap.b} overlap each other`,
        );
      }

      // 2. All endDates must be >= startDates
      for (const [i, d] of dto.leaveDuration.entries()) {
        if (d.endDate < d.startDate) {
          throw new BadRequestException(
            `Range at index ${i}: endDate cannot be before startDate`,
          );
        }
      }

      // 3. No overlap against existing pending/reviewed/approved leaves
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

      // 4. Calculate total working hours
      const totalHours = calculateTotalHours(dto.leaveDuration);
      if (totalHours === 0) {
        throw new BadRequestException(
          'Leave duration contains no working hours (check dates fall on working days)',
        );
      }

      // 5. Validate balance — accrual-aware, country-specific (read-only, before transaction)
      const now = new Date();
      await this.validateAndComputeBalance(
        conn,
        dto.staffId,
        dto.leaveTypeId,
        totalHours,
        now.getFullYear(),
        now.getMonth() + 1,
      );

      // 6. Persist
      await conn.beginTransaction();

      const unique_id = randomBytes(16).toString('hex');

      const [result] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO leaves
           (unique_id, staff_id, leave_type_id, reason, handover_note, total_hours, status, created_by)
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

  // ---------------------------------------------------------------------------
  // GET /leaves
  // ---------------------------------------------------------------------------
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
        `SELECT
           l.*,
           CONCAT(s.first_name, ' ', s.last_name) AS supervisor_name,
           o.name                                  AS location_name,
           p.name                                  AS program_name,
           d.name                                  AS department_name,
           CONCAT(e.first_name, ' ', e.last_name)  AS employee_name,
           e.designation                           AS employee_designation
         FROM leaves l
         LEFT JOIN employee e    ON e.staff_id = l.staff_id
         LEFT JOIN departments d ON d.unique_id = e.department
         LEFT JOIN programs p    ON p.unique_id = e.program
         LEFT JOIN locations o   ON o.unique_id = e.location
         LEFT JOIN employee s    ON s.staff_id = e.supervisor
         LEFT JOIN countries c   ON c.unique_id = e.country
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
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // ---------------------------------------------------------------------------
  // GET /leaves/:id
  // ---------------------------------------------------------------------------
  async findOne(id: number): Promise<Leave> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM leaves WHERE id = ?',
        [id],
      );
      if (!rows.length) {
        throw new NotFoundException(`Leave with id ${id} not found`);
      }

      const leave = rows[0] as Leave;

      const [durations] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM leave_durations WHERE leave_id = ? ORDER BY start_date ASC',
        [id],
      );
      leave.durations = durations as LeaveDuration[];

      return leave;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // ---------------------------------------------------------------------------
  // PATCH /leaves/:id/review  (HR)
  // ---------------------------------------------------------------------------
  async review(id: number): Promise<Leave> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id, status FROM leaves WHERE id = ?',
        [id],
      );
      if (!rows.length) {
        throw new NotFoundException(`Leave with id ${id} not found`);
      }
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

  // ---------------------------------------------------------------------------
  // PATCH /leaves/:id/approve  (Supervisor)
  // Re-validates balance at approval time using the same accrual-aware logic.
  // Deduction hits the year-scoped leave_balances row.
  // ---------------------------------------------------------------------------
  async approve(id: number, approvedBy: string): Promise<Leave> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM leaves WHERE id = ?',
        [id],
      );
      if (!rows.length) {
        throw new NotFoundException(`Leave with id ${id} not found`);
      }

      const leave = rows[0] as Leave;

      if (leave.status !== 'Reviewed') {
        throw new BadRequestException(
          `Only Reviewed leaves can be approved. Current status: ${leave.status}`,
        );
      }

      // Re-validate balance at time of approval (accrual-aware, read-only)
      const now = new Date();
      await this.validateAndComputeBalance(
        conn,
        leave.staff_id,
        leave.leave_type_id,
        leave.total_hours,
        now.getFullYear(),
        now.getMonth() + 1,
      );

      // Resolve the correct year-scoped balance row for deduction
      const [balanceRows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT id FROM leave_balances
         WHERE staff_id = ? AND leave_type_id = ? AND year = ?`,
        [leave.staff_id, leave.leave_type_id, now.getFullYear()],
      );
      if (!balanceRows.length) {
        throw new BadRequestException(
          'Leave balance record not found for current year',
        );
      }
      const balanceId = balanceRows[0].id as number;

      await conn.beginTransaction();

      await conn.query(
        `UPDATE leaves SET status = 'Approved', approved_by = ? WHERE id = ?`,
        [approvedBy, id],
      );

      await conn.query(
        `UPDATE leave_balances
         SET used_hours      = used_hours + ?,
             remaining_hours = remaining_hours - ?
         WHERE id = ?`,
        [leave.total_hours, leave.total_hours, balanceId],
      );

      await conn.query(
        `INSERT INTO leave_balance_transactions
           (unique_id, balance_id, staff_id, leave_type_id, leave_id, type, hours, note, created_by)
         VALUES (?, ?, ?, ?, ?, 'debit', ?, ?, ?)`,
        [
          randomBytes(16).toString('hex'),
          balanceId,
          leave.staff_id,
          leave.leave_type_id,
          id,
          leave.total_hours,
          `Leave approved — deducted ${leave.total_hours}hrs`,
          approvedBy,
        ],
      );

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

  // ---------------------------------------------------------------------------
  // PATCH /leaves/:id/reject
  // If rejecting an already-Approved leave, restores hours to the year-scoped row.
  // ---------------------------------------------------------------------------
  async reject(id: number, rejectedBy: string): Promise<Leave> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM leaves WHERE id = ?',
        [id],
      );
      if (!rows.length) {
        throw new NotFoundException(`Leave with id ${id} not found`);
      }

      const leave = rows[0] as Leave;

      if (!['Pending', 'Reviewed', 'Approved'].includes(leave.status)) {
        throw new BadRequestException(
          `Only Pending, Reviewed, or Approved leaves can be rejected. Current status: ${leave.status}`,
        );
      }

      await conn.beginTransaction();

      await conn.query(`UPDATE leaves SET status = 'Rejected' WHERE id = ?`, [
        id,
      ]);

      // Only restore balance if hours were actually deducted (i.e. was Approved)
      if (leave.status === 'Approved') {
        const leaveYear = new Date(leave.created_at).getFullYear();

        const [balanceRows] = await conn.query<mysql.RowDataPacket[]>(
          `SELECT id FROM leave_balances
           WHERE staff_id = ? AND leave_type_id = ? AND year = ?`,
          [leave.staff_id, leave.leave_type_id, leaveYear],
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

          await conn.query(
            `INSERT INTO leave_balance_transactions
               (unique_id, balance_id, staff_id, leave_type_id, leave_id, type, hours, note, created_by)
             VALUES (?, ?, ?, ?, ?, 'reversal', ?, ?, ?)`,
            [
              randomBytes(16).toString('hex'),
              balanceId,
              leave.staff_id,
              leave.leave_type_id,
              id,
              leave.total_hours,
              `Leave rejected — restored ${leave.total_hours}hrs`,
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
