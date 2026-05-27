import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
import { RequestUser } from 'src/common/interfaces/request-user.interface';
import { MailService } from 'src/mail/mail.service';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface Leave {
  id: number;
  unique_id: string;
  staff_id: number;
  leave_type_id: string;
  leave_type_name?: string;
  reason: string;
  handover_note: string;
  total_hours: number;
  status: 'Pending' | 'Reviewed' | 'Approved' | 'Rejected' | 'Cancelled';
  created_by: string;
  created_at: Date;
  reviewed_by?: string;
  date_reviewed?: Date;
  approved_by?: string;
  date_approved?: Date;
  rejected_by?: string;
  date_rejected?: Date;
  cancelled_by?: string;
  date_cancelled?: Date;
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

// ─── Notification message builders ───────────────────────────────────────────
// Each function returns a plain-text message string that is passed into the
// existing MailService.sendCaseNotification() / sendToMany() as `message`.
// The template ('notification') renders it as message_full in the email body.

function msgCreated(
  staffName: string,
  leaveTypeName: string,
  totalHours: number,
  startDate: string,
  endDate: string,
  reason?: string,
): string {
  return (
    `${staffName} has submitted a leave request.\n\n` +
    `Leave type : ${leaveTypeName}\n` +
    `Duration   : ${startDate} → ${endDate}\n` +
    `Total hours: ${totalHours} hrs\n` +
    (reason ? `Reason     : ${reason}\n` : '') +
    `\nThe request is now Pending HR review.`
  );
}

function msgReviewed(
  staffName: string,
  leaveTypeName: string,
  totalHours: number,
  startDate: string,
  endDate: string,
  reviewedBy: string,
): string {
  return (
    `The leave request for ${staffName} has been reviewed by HR.\n\n` +
    `Leave type : ${leaveTypeName}\n` +
    `Duration   : ${startDate} → ${endDate}\n` +
    `Total hours: ${totalHours} hrs\n` +
    `Reviewed by: ${reviewedBy}\n` +
    `\nThe request is now awaiting supervisor approval.`
  );
}

function msgApproved(
  staffName: string,
  leaveTypeName: string,
  totalHours: number,
  startDate: string,
  endDate: string,
  approvedBy: string,
): string {
  return (
    `The leave request for ${staffName} has been approved.\n\n` +
    `Leave type : ${leaveTypeName}\n` +
    `Duration   : ${startDate} → ${endDate}\n` +
    `Total hours: ${totalHours} hrs\n` +
    `Approved by: ${approvedBy}\n` +
    `\nPlease ensure your handover is complete before your leave begins.`
  );
}

function msgRejected(
  staffName: string,
  leaveTypeName: string,
  totalHours: number,
  startDate: string,
  endDate: string,
  rejectedBy: string,
): string {
  return (
    `The leave request for ${staffName} has been rejected.\n\n` +
    `Leave type : ${leaveTypeName}\n` +
    `Duration   : ${startDate} → ${endDate}\n` +
    `Total hours: ${totalHours} hrs\n` +
    `Rejected by: ${rejectedBy}\n` +
    `\nPlease contact HR for further details.`
  );
}

function msgCancelled(
  staffName: string,
  leaveTypeName: string,
  totalHours: number,
  startDate: string,
  endDate: string,
  cancelledBy: string,
  reason?: string,
): string {
  return (
    `${staffName} has cancelled a leave request.\n\n` +
    `Leave type  : ${leaveTypeName}\n` +
    `Duration    : ${startDate} → ${endDate}\n` +
    `Total hours : ${totalHours} hrs\n` +
    `Cancelled by: ${cancelledBy}\n` +
    (reason ? `Reason      : ${reason}\n` : '') +
    `\nNo further action is required.`
  );
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class LeavesService {
  constructor(
    @Inject('MYSQL_POOL') private readonly pool: mysql.Pool,
    private readonly mailService: MailService,
  ) {}

  // ---------------------------------------------------------------------------
  // PRIVATE HELPER — resolve all email recipients for a given staff member.
  // ---------------------------------------------------------------------------
  private async resolveEmailRecipients(
    conn: mysql.PoolConnection,
    staffId: number,
  ): Promise<{
    staffEmail: string;
    supervisorEmail: string | null;
    hrEmails: string[];
  }> {
    const [staffRows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT e.email      AS staff_email,
              s.email      AS supervisor_email
       FROM   employee e
       LEFT JOIN employee s ON s.staff_id = e.supervisor
       WHERE  e.staff_id = ?`,
      [staffId],
    );

    const staffEmail = (staffRows[0]?.staff_email as string) ?? '';
    const supervisorEmail = (staffRows[0]?.supervisor_email as string) ?? null;

    const [hrRows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT email FROM users WHERE role = 'hr' AND is_active = 1`,
    );
    const hrEmails = hrRows.map((r) => r.email as string);

    return { staffEmail, supervisorEmail, hrEmails };
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPER — resolve staff full name and leave type name from DB.
  // ---------------------------------------------------------------------------
  private async resolveDisplayNames(
    conn: mysql.PoolConnection,
    staffId: number,
    leaveTypeId: string,
  ): Promise<{ staffName: string; leaveTypeName: string }> {
    const [[empRow]] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT CONCAT(first_name, ' ', last_name) AS full_name
       FROM   employee WHERE staff_id = ?`,
      [staffId],
    );
    const [[ltRow]] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT name FROM leave_types WHERE unique_id = ?`,
      [leaveTypeId],
    );
    return {
      staffName: (empRow?.full_name as string) ?? String(staffId),
      leaveTypeName: (ltRow?.name as string) ?? leaveTypeId,
    };
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPER — earliest start / latest end across all duration rows.
  // ---------------------------------------------------------------------------
  private summariseDurations(durations: LeaveDuration[]): {
    startDate: string;
    endDate: string;
  } {
    const sorted = [...durations].sort((a, b) =>
      a.start_date.localeCompare(b.start_date),
    );
    return {
      startDate: sorted[0]?.start_date ?? '',
      endDate: sorted[sorted.length - 1]?.end_date ?? '',
    };
  }

  // ---------------------------------------------------------------------------
  // PRIVATE — validate available balance before create() and approve().
  //
  // CONCURRENCY NOTE: when called from approve() the surrounding transaction
  // has already locked the balance row with SELECT ... FOR UPDATE, so this
  // read sees the post-lock value — no double-spend possible.
  // ---------------------------------------------------------------------------
  private async validateAndComputeBalance(
    conn: mysql.PoolConnection,
    staffId: number,
    leaveTypeId: string,
    totalHours: number,
    currentYear: number,
    currentMonth: number,
  ): Promise<void> {
    const [staffRows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT country FROM employee WHERE staff_id = ?`,
      [staffId],
    );
    if (!staffRows.length) {
      throw new BadRequestException('Staff record not found');
    }
    const country = staffRows[0].country as string;

    const [configRows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT annual_hours, monthly_accrual_hours
       FROM   leave_type_country_config
       WHERE  leave_type_id = ? AND country = ?`,
      [leaveTypeId, country],
    );
    if (!configRows.length) {
      throw new BadRequestException(
        `No leave policy configured for this leave type in ${country}`,
      );
    }
    const config = configRows[0];
    const isAccrual = config.monthly_accrual_hours != null;

    const [usedRows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT COALESCE(SUM(total_hours), 0) AS used_hours
       FROM   leaves
       WHERE  staff_id         = ?
         AND  leave_type_id    = ?
         AND  status           IN ('Pending', 'Reviewed', 'Approved')
         AND  YEAR(created_at) = ?`,
      [staffId, leaveTypeId, currentYear],
    );
    const usedHours = Number(usedRows[0].used_hours);

    let availableHours: number;

    if (isAccrual) {
      const [balanceRows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT remaining_hours
         FROM   leave_balances
         WHERE  staff_id = ? AND leave_type_id = ? AND year = ?`,
        [staffId, leaveTypeId, currentYear],
      );
      const carryover = balanceRows.length
        ? Number(balanceRows[0].remaining_hours)
        : 0;
      const accruedHours = currentMonth * Number(config.monthly_accrual_hours);
      availableHours = carryover + accruedHours - usedHours;
    } else {
      availableHours = Number(config.annual_hours) - usedHours;
    }

    if (availableHours < totalHours) {
      throw new BadRequestException(
        `Insufficient leave balance. Required: ${totalHours} hrs, ` +
          `Available: ${availableHours.toFixed(2)} hrs`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // POST /leaves
  // ---------------------------------------------------------------------------
  async create(dto: CreateLeaveDto, user: RequestUser): Promise<Leave> {
    const conn = await this.pool.getConnection();
    try {
      // 1. Internal overlap check
      const internalOverlap = findInternalOverlap(dto.leaveDuration);
      if (internalOverlap) {
        throw new BadRequestException(
          `Date ranges at index ${internalOverlap.a} and ${internalOverlap.b} ` +
            `overlap each other`,
        );
      }

      // 2. endDate >= startDate per range
      for (const [i, d] of dto.leaveDuration.entries()) {
        if (d.endDate < d.startDate) {
          throw new BadRequestException(
            `Range at index ${i}: endDate cannot be before startDate`,
          );
        }
      }

      // 3. No overlap with existing active leaves
      const [existingDurations] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT ld.start_date, ld.end_date
         FROM   leave_durations ld
         INNER JOIN leaves l ON l.id = ld.leave_id
         WHERE  l.staff_id = ?
           AND  l.status   IN ('Pending', 'Reviewed', 'Approved')`,
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
          'Leave duration contains no working hours ' +
            '(check that dates fall on working days)',
        );
      }

      // 5. Advisory balance check
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
           (unique_id, staff_id, leave_type_id, reason, handover_note,
            total_hours, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?)`,
        [
          unique_id,
          dto.staffId,
          dto.leaveTypeId,
          dto.reason,
          dto.handoverNote,
          totalHours,
          user.email,
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

      const leave = await this.findOne(leaveId);

      // 7. Notifications — non-fatal
      try {
        const { staffEmail, supervisorEmail, hrEmails } =
          await this.resolveEmailRecipients(conn, dto.staffId);
        const { staffName, leaveTypeName } = await this.resolveDisplayNames(
          conn,
          dto.staffId,
          dto.leaveTypeId,
        );
        const { startDate, endDate } = this.summariseDurations(
          leave.durations ?? [],
        );

        const message = msgCreated(
          staffName,
          leaveTypeName,
          totalHours,
          startDate,
          endDate,
          dto.reason,
        );
        const mailOpts = {
          message,
          subject: 'Mercy Corps Leave Management',
          subjectFull: 'Leave Request Submitted',
          siteName: 'Mercy Corps Nigeria',
        };

        if (staffEmail) {
          await this.mailService.sendCaseNotification({
            ...mailOpts,
            to: staffEmail,
          });
        }
        if (supervisorEmail) {
          await this.mailService.sendCaseNotification({
            ...mailOpts,
            to: supervisorEmail,
          });
        }
        if (hrEmails.length) {
          await this.mailService.sendToMany(hrEmails, mailOpts);
        }
      } catch {
        /* non-fatal — leave is already committed */
      }

      return leave;
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

      const whereClause = conditions.length
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

      const [[countRow]] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM leaves l ${whereClause}`,
        params,
      );
      const total = countRow['total'] as number;

      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT
           l.*,
           lt.name                                 AS leave_type_name,
           CONCAT(e.first_name, ' ', e.last_name)  AS employee_name,
           e.designation                           AS employee_designation,
           CONCAT(s.first_name, ' ', s.last_name)  AS supervisor_name,
           o.name                                  AS location_name,
           p.name                                  AS program_name,
           d.name                                  AS department_name
         FROM leaves l
         LEFT JOIN employee e     ON e.staff_id   = l.staff_id
         LEFT JOIN employee s     ON s.staff_id   = e.supervisor
         LEFT JOIN leave_types lt ON lt.unique_id = l.leave_type_id
         LEFT JOIN locations o    ON o.unique_id  = e.location
         LEFT JOIN programs p     ON p.unique_id  = e.program
         LEFT JOIN departments d  ON d.unique_id  = e.department
         LEFT JOIN countries c    ON c.unique_id  = e.country
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
        `SELECT l.*, lt.name AS leave_type_name
         FROM   leaves l
         LEFT JOIN leave_types lt ON lt.unique_id = l.leave_type_id
         WHERE  l.id = ?`,
        [id],
      );
      if (!rows.length) {
        throw new NotFoundException(`Leave with id ${id} not found`);
      }

      const leave = rows[0] as Leave;

      const [durations] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT * FROM leave_durations
         WHERE  leave_id = ?
         ORDER BY start_date ASC`,
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
  async review(id: number, reviewedBy: string): Promise<Leave> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM leaves WHERE id = ?',
        [id],
      );
      if (!rows.length)
        throw new NotFoundException(`Leave with id ${id} not found`);

      const leave = rows[0] as Leave;

      if (leave.status !== 'Pending') {
        throw new BadRequestException(
          `Only Pending leaves can be reviewed. Current status: ${leave.status}`,
        );
      }

      await conn.query(
        `UPDATE leaves
         SET status = 'Reviewed', reviewed_by = ?, date_reviewed = NOW()
         WHERE id = ?`,
        [reviewedBy, id],
      );

      const updated = await this.findOne(id);

      try {
        const { staffEmail, supervisorEmail } =
          await this.resolveEmailRecipients(conn, leave.staff_id);
        const { staffName, leaveTypeName } = await this.resolveDisplayNames(
          conn,
          leave.staff_id,
          leave.leave_type_id,
        );
        const { startDate, endDate } = this.summariseDurations(
          updated.durations ?? [],
        );

        const message = msgReviewed(
          staffName,
          leaveTypeName,
          leave.total_hours,
          startDate,
          endDate,
          reviewedBy,
        );
        const mailOpts = {
          message,
          subject: 'Mercy Corps Leave Management',
          subjectFull: 'Leave Request Reviewed',
          siteName: 'Mercy Corps Nigeria',
        };

        // Staff: their request moved forward
        if (staffEmail) {
          await this.mailService.sendCaseNotification({
            ...mailOpts,
            to: staffEmail,
          });
        }
        // Supervisor: action now required from them
        if (supervisorEmail) {
          await this.mailService.sendCaseNotification({
            ...mailOpts,
            to: supervisorEmail,
          });
        }
      } catch {
        /* non-fatal */
      }

      return updated;
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
  //
  // CONCURRENCY FIX — SELECT ... FOR UPDATE
  // The balance row is locked inside the transaction BEFORE the balance check
  // runs, preventing two simultaneous approvals from double-spending the same
  // remaining_hours.
  // ---------------------------------------------------------------------------
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

      // Use the year the leave was SUBMITTED (guards Dec → Jan cross-year edge case)
      const leaveYear = new Date(leave.created_at).getFullYear();
      const now = new Date();

      // Open transaction BEFORE the balance check so the FOR UPDATE lock
      // is held for the entire validation + mutation sequence
      await conn.beginTransaction();

      // Lock the balance row — concurrent approval for the same staff member
      // blocks here until this transaction commits or rolls back
      const [balanceRows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT id, remaining_hours
         FROM   leave_balances
         WHERE  staff_id      = ?
           AND  leave_type_id = ?
           AND  year          = ?
         FOR UPDATE`,
        [leave.staff_id, leave.leave_type_id, leaveYear],
      );

      if (!balanceRows.length) {
        throw new BadRequestException(
          'Leave balance record not found for the leave year. ' +
            'HR must seed a balance before approvals can proceed.',
        );
      }

      const balanceId = balanceRows[0].id as number;
      const remainingHours = Number(balanceRows[0].remaining_hours);

      // Check directly against the freshly locked remaining_hours
      if (remainingHours < leave.total_hours) {
        throw new BadRequestException(
          `Insufficient leave balance. Required: ${leave.total_hours} hrs, ` +
            `Available: ${remainingHours.toFixed(2)} hrs`,
        );
      }

      // Full policy validation (accrual cap, fixed entitlement, etc.)
      await this.validateAndComputeBalance(
        conn,
        leave.staff_id,
        leave.leave_type_id,
        leave.total_hours,
        leaveYear,
        now.getMonth() + 1,
      );

      // Mutations
      await conn.query(
        `UPDATE leaves
         SET status = 'Approved', approved_by = ?, date_approved = NOW()
         WHERE id = ?`,
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
           (unique_id, balance_id, staff_id, leave_type_id, leave_id,
            type, hours, note, created_by)
         VALUES (?, ?, ?, ?, ?, 'debit', ?, ?, ?)`,
        [
          randomBytes(16).toString('hex'),
          balanceId,
          leave.staff_id,
          leave.leave_type_id,
          id,
          leave.total_hours,
          `Leave approved — deducted ${leave.total_hours} hrs`,
          approvedBy,
        ],
      );

      await conn.commit();

      const updated = await this.findOne(id);

      try {
        const { staffEmail, hrEmails } = await this.resolveEmailRecipients(
          conn,
          leave.staff_id,
        );
        const { staffName, leaveTypeName } = await this.resolveDisplayNames(
          conn,
          leave.staff_id,
          leave.leave_type_id,
        );
        const { startDate, endDate } = this.summariseDurations(
          updated.durations ?? [],
        );

        const message = msgApproved(
          staffName,
          leaveTypeName,
          leave.total_hours,
          startDate,
          endDate,
          approvedBy,
        );
        const mailOpts = {
          message,
          subject: 'Mercy Corps Leave Management',
          subjectFull: 'Leave Request Approved',
          siteName: 'Mercy Corps Nigeria',
        };

        if (staffEmail) {
          await this.mailService.sendCaseNotification({
            ...mailOpts,
            to: staffEmail,
          });
        }
        if (hrEmails.length) {
          await this.mailService.sendToMany(hrEmails, mailOpts);
        }
      } catch {
        /* non-fatal */
      }

      return updated;
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
  // PATCH /leaves/:id/reject  (HR or Supervisor)
  // Pending / Reviewed / Approved → Rejected.
  // If previously Approved, hours are restored to the balance.
  // ---------------------------------------------------------------------------
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

      if (!['Pending', 'Reviewed', 'Approved'].includes(leave.status)) {
        throw new BadRequestException(
          `Only Pending, Reviewed, or Approved leaves can be rejected. ` +
            `Current status: ${leave.status}`,
        );
      }

      await conn.beginTransaction();

      await conn.query(
        `UPDATE leaves
         SET status = 'Rejected', rejected_by = ?, date_rejected = NOW()
         WHERE id = ?`,
        [rejectedBy, id],
      );

      // Restore balance only if hours were actually deducted (status was Approved)
      if (leave.status === 'Approved') {
        const leaveYear = new Date(leave.created_at).getFullYear();

        const [balanceRows] = await conn.query<mysql.RowDataPacket[]>(
          `SELECT id FROM leave_balances
           WHERE  staff_id = ? AND leave_type_id = ? AND year = ?
           FOR UPDATE`,
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
               (unique_id, balance_id, staff_id, leave_type_id, leave_id,
                type, hours, note, created_by)
             VALUES (?, ?, ?, ?, ?, 'reversal', ?, ?, ?)`,
            [
              randomBytes(16).toString('hex'),
              balanceId,
              leave.staff_id,
              leave.leave_type_id,
              id,
              leave.total_hours,
              `Leave rejected — restored ${leave.total_hours} hrs`,
              rejectedBy,
            ],
          );
        }
      }

      await conn.commit();

      const updated = await this.findOne(id);

      try {
        const { staffEmail, hrEmails } = await this.resolveEmailRecipients(
          conn,
          leave.staff_id,
        );
        const { staffName, leaveTypeName } = await this.resolveDisplayNames(
          conn,
          leave.staff_id,
          leave.leave_type_id,
        );
        const { startDate, endDate } = this.summariseDurations(
          updated.durations ?? [],
        );

        const message = msgRejected(
          staffName,
          leaveTypeName,
          leave.total_hours,
          startDate,
          endDate,
          rejectedBy,
        );
        const mailOpts = {
          message,
          subject: 'Mercy Corps Leave Management',
          subjectFull: 'Leave Request Rejected',
          siteName: 'Mercy Corps Nigeria',
        };

        if (staffEmail) {
          await this.mailService.sendCaseNotification({
            ...mailOpts,
            to: staffEmail,
          });
        }
        if (hrEmails.length) {
          await this.mailService.sendToMany(hrEmails, mailOpts);
        }
      } catch {
        /* non-fatal */
      }

      return updated;
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
  // PATCH /leaves/:id/cancel  (Staff self-service)
  //
  // Staff can cancel Pending or Reviewed leaves directly.
  // Approved leaves require a supervisor/HR rejection (which handles the
  // balance reversal). No balance change is needed here because hours are
  // only deducted at approval time.
  // ---------------------------------------------------------------------------
  async cancel(
    id: number,
    cancelledBy: string,
    reason?: string,
  ): Promise<Leave> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM leaves WHERE id = ?',
        [id],
      );
      if (!rows.length)
        throw new NotFoundException(`Leave with id ${id} not found`);

      const leave = rows[0] as Leave;

      if (!['Pending', 'Reviewed'].includes(leave.status)) {
        if (leave.status === 'Approved') {
          throw new ForbiddenException(
            'Approved leaves cannot be self-cancelled. ' +
              'Please ask your supervisor or HR to reject the leave instead.',
          );
        }
        throw new BadRequestException(
          `Only Pending or Reviewed leaves can be cancelled. ` +
            `Current status: ${leave.status}`,
        );
      }

      await conn.beginTransaction();

      await conn.query(
        `UPDATE leaves
         SET status         = 'Cancelled',
             cancelled_by   = ?,
             date_cancelled = NOW()
         WHERE id = ?`,
        [cancelledBy, id],
      );

      // Permanent audit record
      await conn.query(
        `INSERT INTO leave_cancellations
           (unique_id, leave_id, staff_id, reason, cancelled_by)
         VALUES (?, ?, ?, ?, ?)`,
        [
          randomBytes(16).toString('hex'),
          id,
          leave.staff_id,
          reason ?? null,
          cancelledBy,
        ],
      );

      await conn.commit();

      const updated = await this.findOne(id);

      try {
        const { staffEmail, supervisorEmail, hrEmails } =
          await this.resolveEmailRecipients(conn, leave.staff_id);
        const { staffName, leaveTypeName } = await this.resolveDisplayNames(
          conn,
          leave.staff_id,
          leave.leave_type_id,
        );
        const { startDate, endDate } = this.summariseDurations(
          updated.durations ?? [],
        );

        const message = msgCancelled(
          staffName,
          leaveTypeName,
          leave.total_hours,
          startDate,
          endDate,
          cancelledBy,
          reason,
        );
        const mailOpts = {
          message,
          subject: 'Mercy Corps Leave Management',
          subjectFull: 'Leave Request Cancelled',
          siteName: 'Mercy Corps Nigeria',
        };

        // Staff: confirmation they cancelled it
        if (staffEmail) {
          await this.mailService.sendCaseNotification({
            ...mailOpts,
            to: staffEmail,
          });
        }
        // Supervisor: so they are not caught off-guard
        if (supervisorEmail) {
          await this.mailService.sendCaseNotification({
            ...mailOpts,
            to: supervisorEmail,
          });
        }
        // HR: so they can update resource planning
        if (hrEmails.length) {
          await this.mailService.sendToMany(hrEmails, mailOpts);
        }
      } catch {
        /* non-fatal */
      }

      return updated;
    } catch (err) {
      await conn.rollback();
      if (
        err instanceof NotFoundException ||
        err instanceof BadRequestException ||
        err instanceof ForbiddenException
      )
        throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // ---------------------------------------------------------------------------
  // GET /leaves/:id/cancellation  — retrieve the cancellation audit record
  // ---------------------------------------------------------------------------
  async findCancellation(leaveId: number): Promise<mysql.RowDataPacket> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT lc.*,
                CONCAT(e.first_name, ' ', e.last_name) AS staff_name
         FROM   leave_cancellations lc
         LEFT JOIN employee e ON e.staff_id = lc.staff_id
         WHERE  lc.leave_id = ?`,
        [leaveId],
      );
      if (!rows.length) {
        throw new NotFoundException(
          `No cancellation record found for leave id ${leaveId}`,
        );
      }
      return rows[0];
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }
}
