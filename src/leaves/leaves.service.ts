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
  leave_type_id: string; // now lives here
  leave_type_name?: string; // joined
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

function fmtLeaveTypeBreakdown(
  grouped: Map<string, { name: string; hours: number }>,
): string {
  return [...grouped.values()]
    .map((g) => `  • ${g.name}: ${g.hours} hrs`)
    .join('\n');
}

function msgCreated(
  staffName: string,
  breakdown: Map<string, { name: string; hours: number }>,
  totalHours: number,
  startDate: string,
  endDate: string,
  reason?: string,
): string {
  return (
    `${staffName} has submitted a leave request.\n\n` +
    `Duration   : ${startDate} → ${endDate}\n` +
    `Total hours: ${totalHours} hrs\n` +
    `Leave types:\n${fmtLeaveTypeBreakdown(breakdown)}\n` +
    (reason ? `Reason     : ${reason}\n` : '') +
    `\nThe request is now Pending HR review.`
  );
}

function msgReviewed(
  staffName: string,
  breakdown: Map<string, { name: string; hours: number }>,
  totalHours: number,
  startDate: string,
  endDate: string,
  reviewedBy: string,
): string {
  return (
    `The leave request for ${staffName} has been reviewed by HR.\n\n` +
    `Duration   : ${startDate} → ${endDate}\n` +
    `Total hours: ${totalHours} hrs\n` +
    `Leave types:\n${fmtLeaveTypeBreakdown(breakdown)}\n` +
    `Reviewed by: ${reviewedBy}\n` +
    `\nThe request is now awaiting supervisor approval.`
  );
}

function msgApproved(
  staffName: string,
  breakdown: Map<string, { name: string; hours: number }>,
  totalHours: number,
  startDate: string,
  endDate: string,
  approvedBy: string,
): string {
  return (
    `The leave request for ${staffName} has been approved.\n\n` +
    `Duration   : ${startDate} → ${endDate}\n` +
    `Total hours: ${totalHours} hrs\n` +
    `Leave types:\n${fmtLeaveTypeBreakdown(breakdown)}\n` +
    `Approved by: ${approvedBy}\n` +
    `\nPlease ensure your handover is complete before your leave begins.`
  );
}

function msgRejected(
  staffName: string,
  breakdown: Map<string, { name: string; hours: number }>,
  totalHours: number,
  startDate: string,
  endDate: string,
  rejectedBy: string,
): string {
  return (
    `The leave request for ${staffName} has been rejected.\n\n` +
    `Duration   : ${startDate} → ${endDate}\n` +
    `Total hours: ${totalHours} hrs\n` +
    `Leave types:\n${fmtLeaveTypeBreakdown(breakdown)}\n` +
    `Rejected by: ${rejectedBy}\n` +
    `\nPlease contact HR for further details.`
  );
}

function msgCancelled(
  staffName: string,
  breakdown: Map<string, { name: string; hours: number }>,
  totalHours: number,
  startDate: string,
  endDate: string,
  cancelledBy: string,
  reason?: string,
): string {
  return (
    `${staffName} has cancelled a leave request.\n\n` +
    `Duration    : ${startDate} → ${endDate}\n` +
    `Total hours : ${totalHours} hrs\n` +
    `Leave types:\n${fmtLeaveTypeBreakdown(breakdown)}\n` +
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
  // PRIVATE — resolve email recipients
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
  // PRIVATE — resolve staff full name
  // ---------------------------------------------------------------------------
  private async resolveStaffName(
    conn: mysql.PoolConnection,
    staffId: number,
  ): Promise<string> {
    const [[empRow]] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT CONCAT(first_name, ' ', last_name) AS full_name
       FROM   employee WHERE staff_id = ?`,
      [staffId],
    );
    return (empRow?.full_name as string) ?? String(staffId);
  }

  // ---------------------------------------------------------------------------
  // PRIVATE — build a leave-type breakdown map from duration rows.
  // Returns Map<leaveTypeId, { name, hours }> for notifications and logic.
  // ---------------------------------------------------------------------------
  private buildBreakdown(
    durations: LeaveDuration[],
  ): Map<string, { name: string; hours: number }> {
    const map = new Map<string, { name: string; hours: number }>();
    for (const d of durations) {
      const existing = map.get(d.leave_type_id);
      if (existing) {
        existing.hours += d.hours;
      } else {
        map.set(d.leave_type_id, {
          name: d.leave_type_name ?? d.leave_type_id,
          hours: d.hours,
        });
      }
    }
    return map;
  }

  // ---------------------------------------------------------------------------
  // PRIVATE — earliest start / latest end across durations
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
  // PRIVATE — validate balance for ONE leave type.
  // Called in a loop during create (advisory) and approve (locked).
  // ---------------------------------------------------------------------------
  private async validateBalanceForType(
    conn: mysql.PoolConnection,
    staffId: number,
    leaveTypeId: string,
    requiredHours: number,
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
        `No leave policy configured for leave type "${leaveTypeId}" in ${country}`,
      );
    }
    const config = configRows[0];
    const isAccrual = config.monthly_accrual_hours != null;

    // Hours already consumed by active leaves of this type
    // NOTE: query now joins leave_durations to filter by leave_type_id there
    const [usedRows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT COALESCE(SUM(ld.hours), 0) AS used_hours
       FROM   leave_durations ld
       INNER JOIN leaves l ON l.id = ld.leave_id
       WHERE  l.staff_id         = ?
         AND  ld.leave_type_id   = ?
         AND  l.status           IN ('Pending', 'Reviewed', 'Approved')
         AND  YEAR(l.created_at) = ?`,
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

    if (availableHours < requiredHours) {
      // Resolve leave type name for a friendlier error
      const [[ltRow]] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT name FROM leave_types WHERE unique_id = ?`,
        [leaveTypeId],
      );
      const ltName = (ltRow?.name as string) ?? leaveTypeId;
      throw new BadRequestException(
        `Insufficient balance for "${ltName}". ` +
          `Required: ${requiredHours} hrs, Available: ${availableHours.toFixed(2)} hrs`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // POST /leaves
  // ---------------------------------------------------------------------------
  async create(dto: CreateLeaveDto, user: RequestUser): Promise<Leave> {
    const conn = await this.pool.getConnection();
    try {
      // 1. Internal overlap check (across all ranges regardless of leave type)
      const internalOverlap = findInternalOverlap(dto.leaveDuration);
      if (internalOverlap) {
        throw new BadRequestException(
          `Date ranges at index ${internalOverlap.a} and ${internalOverlap.b} overlap each other`,
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

      // 3. Verify all referenced leave types actually exist
      const uniqueLeaveTypeIds = [
        ...new Set(dto.leaveDuration.map((d) => d.leaveTypeId)),
      ];
      for (const ltId of uniqueLeaveTypeIds) {
        const [ltRows] = await conn.query<mysql.RowDataPacket[]>(
          `SELECT unique_id FROM leave_types WHERE unique_id = ?`,
          [ltId],
        );
        if (!ltRows.length) {
          throw new BadRequestException(`Leave type "${ltId}" does not exist`);
        }
      }

      // 4. No overlap with existing active leaves for this staff member
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

      // 5. Group durations by leave type and calculate hours per type
      const hoursPerType = new Map<string, number>();
      for (const d of dto.leaveDuration) {
        const hours = calculateHoursForRange(d.startDate, d.endDate);
        hoursPerType.set(
          d.leaveTypeId,
          (hoursPerType.get(d.leaveTypeId) ?? 0) + hours,
        );
      }

      // Ensure no range results in 0 working hours
      const totalHours = [...hoursPerType.values()].reduce((a, b) => a + b, 0);
      if (totalHours === 0) {
        throw new BadRequestException(
          'Leave duration contains no working hours (check that dates fall on working days)',
        );
      }

      // 6. Advisory balance check — one per leave type
      const now = new Date();
      for (const [leaveTypeId, hours] of hoursPerType) {
        await this.validateBalanceForType(
          conn,
          dto.staffId,
          leaveTypeId,
          hours,
          now.getFullYear(),
          now.getMonth() + 1,
        );
      }

      // 7. Persist
      await conn.beginTransaction();

      const unique_id = randomBytes(16).toString('hex');
      const [result] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO leaves
           (unique_id, staff_id, reason, handover_note, total_hours, status, created_by)
         VALUES (?, ?, ?, ?, ?, 'Pending', ?)`,
        [
          unique_id,
          dto.staffId,
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
          `INSERT INTO leave_durations (leave_id, leave_type_id, start_date, end_date, hours)
           VALUES (?, ?, ?, ?, ?)`,
          [leaveId, d.leaveTypeId, d.startDate, d.endDate, hours],
        );
      }

      await conn.commit();

      const leave = await this.findOne(leaveId);

      // 8. Notifications — non-fatal
      try {
        const { staffEmail, supervisorEmail, hrEmails } =
          await this.resolveEmailRecipients(conn, dto.staffId);
        const staffName = await this.resolveStaffName(conn, dto.staffId);
        const breakdown = this.buildBreakdown(leave.durations ?? []);
        const { startDate, endDate } = this.summariseDurations(
          leave.durations ?? [],
        );

        const message = msgCreated(
          staffName,
          breakdown,
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

        if (staffEmail)
          await this.mailService.sendCaseNotification({
            ...mailOpts,
            to: staffEmail,
          });
        if (supervisorEmail)
          await this.mailService.sendCaseNotification({
            ...mailOpts,
            to: supervisorEmail,
          });
        if (hrEmails.length)
          await this.mailService.sendToMany(hrEmails, mailOpts);
      } catch {
        /* non-fatal */
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
           CONCAT(e.first_name, ' ', e.last_name)  AS employee_name,
           e.designation                            AS employee_designation,
           CONCAT(s.first_name, ' ', s.last_name)  AS supervisor_name,
           o.name                                   AS location_name,
           p.name                                   AS program_name,
           d.name                                   AS department_name
         FROM leaves l
         LEFT JOIN employee e     ON e.staff_id  = l.staff_id
         LEFT JOIN employee s     ON s.staff_id  = e.supervisor
         LEFT JOIN locations o    ON o.unique_id = e.location
         LEFT JOIN programs p     ON p.unique_id = e.program
         LEFT JOIN departments d  ON d.unique_id = e.department
         ${whereClause}
         ORDER BY l.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );

      // Attach durations (with leave type names) for each leave in the page
      const leaveIds = (rows as Leave[]).map((r) => r.id);

      const durationsMap = new Map<number, LeaveDuration[]>();

      if (leaveIds.length) {
        const [durationRows] = await conn.query<mysql.RowDataPacket[]>(
          `SELECT ld.*, lt.name AS leave_type_name
     FROM leave_durations ld
     LEFT JOIN leave_types lt ON lt.unique_id = ld.leave_type_id
     WHERE ld.leave_id IN (?)
     ORDER BY ld.start_date ASC`,
          [leaveIds],
        );
        for (const dr of durationRows as LeaveDuration[]) {
          const list = durationsMap.get(dr.leave_id) ?? [];
          list.push(dr);
          durationsMap.set(dr.leave_id, list);
        }
      }

      const data = (rows as Leave[]).map((r) => ({
        ...r,
        durations: durationsMap.get(r.id) ?? [],
      }));

      return {
        data,
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
        `SELECT l.*
         FROM   leaves l
         WHERE  l.id = ?`,
        [id],
      );
      if (!rows.length)
        throw new NotFoundException(`Leave with id ${id} not found`);

      const leave = rows[0] as Leave;

      const [durations] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT ld.*, lt.name AS leave_type_name
         FROM   leave_durations ld
         LEFT JOIN leave_types lt ON lt.unique_id = ld.leave_type_id
         WHERE  ld.leave_id = ?
         ORDER BY ld.start_date ASC`,
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
        `UPDATE leaves SET status = 'Reviewed', reviewed_by = ?, date_reviewed = NOW() WHERE id = ?`,
        [reviewedBy, id],
      );

      const updated = await this.findOne(id);

      try {
        const { staffEmail, supervisorEmail } =
          await this.resolveEmailRecipients(conn, leave.staff_id);
        const staffName = await this.resolveStaffName(conn, leave.staff_id);
        const breakdown = this.buildBreakdown(updated.durations ?? []);
        const { startDate, endDate } = this.summariseDurations(
          updated.durations ?? [],
        );

        const message = msgReviewed(
          staffName,
          breakdown,
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
        if (staffEmail)
          await this.mailService.sendCaseNotification({
            ...mailOpts,
            to: staffEmail,
          });
        if (supervisorEmail)
          await this.mailService.sendCaseNotification({
            ...mailOpts,
            to: supervisorEmail,
          });
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
  // Locks balance rows for ALL leave types on this leave before validating.
  // Each type is deducted independently.
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

      // Load durations (with leave type info) before entering transaction
      const [durationRows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT ld.*, lt.name AS leave_type_name
         FROM leave_durations ld
         LEFT JOIN leave_types lt ON lt.unique_id = ld.leave_type_id
         WHERE ld.leave_id = ?`,
        [id],
      );
      const durations = durationRows as LeaveDuration[];
      const breakdown = this.buildBreakdown(durations); // Map<leaveTypeId, { name, hours }>

      const leaveYear = new Date(leave.created_at).getFullYear();
      const now = new Date();

      await conn.beginTransaction();

      // Lock balance rows for ALL leave types on this leave — in a consistent
      // order (sorted by leaveTypeId) to prevent deadlocks across concurrent approvals
      const sortedTypeIds = [...breakdown.keys()].sort();
      const balanceMap = new Map<string, { id: number; remaining: number }>();

      for (const leaveTypeId of sortedTypeIds) {
        const [balanceRows] = await conn.query<mysql.RowDataPacket[]>(
          `SELECT id, remaining_hours
           FROM   leave_balances
           WHERE  staff_id      = ?
             AND  leave_type_id = ?
             AND  year          = ?
           FOR UPDATE`,
          [leave.staff_id, leaveTypeId, leaveYear],
        );

        if (!balanceRows.length) {
          throw new BadRequestException(
            `Leave balance record not found for leave type "${breakdown.get(leaveTypeId)?.name ?? leaveTypeId}" ` +
              `in year ${leaveYear}. HR must seed a balance before approvals can proceed.`,
          );
        }

        balanceMap.set(leaveTypeId, {
          id: balanceRows[0].id as number,
          remaining: Number(balanceRows[0].remaining_hours),
        });
      }

      // Validate each type independently (locked remaining_hours + full policy check)
      for (const [leaveTypeId, { name, hours }] of breakdown) {
        const { remaining } = balanceMap.get(leaveTypeId)!;
        if (remaining < hours) {
          throw new BadRequestException(
            `Insufficient balance for "${name}". ` +
              `Required: ${hours} hrs, Available: ${remaining.toFixed(2)} hrs`,
          );
        }

        await this.validateBalanceForType(
          conn,
          leave.staff_id,
          leaveTypeId,
          hours,
          leaveYear,
          now.getMonth() + 1,
        );
      }

      // Mutations — update leave status
      await conn.query(
        `UPDATE leaves SET status = 'Approved', approved_by = ?, date_approved = NOW() WHERE id = ?`,
        [approvedBy, id],
      );

      // Deduct balance + write transaction for each leave type
      for (const [leaveTypeId, { name, hours }] of breakdown) {
        const { id: balanceId } = balanceMap.get(leaveTypeId)!;

        await conn.query(
          `UPDATE leave_balances
           SET used_hours = used_hours + ?, remaining_hours = remaining_hours - ?
           WHERE id = ?`,
          [hours, hours, balanceId],
        );

        await conn.query(
          `INSERT INTO leave_balance_transactions
             (unique_id, balance_id, staff_id, leave_type_id, leave_id, type, hours, note, created_by)
           VALUES (?, ?, ?, ?, ?, 'debit', ?, ?, ?)`,
          [
            randomBytes(16).toString('hex'),
            balanceId,
            leave.staff_id,
            leaveTypeId,
            id,
            hours,
            `Leave approved — deducted ${hours} hrs (${name})`,
            approvedBy,
          ],
        );
      }

      await conn.commit();

      const updated = await this.findOne(id);

      try {
        const { staffEmail, hrEmails } = await this.resolveEmailRecipients(
          conn,
          leave.staff_id,
        );
        const staffName = await this.resolveStaffName(conn, leave.staff_id);
        const { startDate, endDate } = this.summariseDurations(
          updated.durations ?? [],
        );

        const message = msgApproved(
          staffName,
          breakdown,
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
        if (staffEmail)
          await this.mailService.sendCaseNotification({
            ...mailOpts,
            to: staffEmail,
          });
        if (hrEmails.length)
          await this.mailService.sendToMany(hrEmails, mailOpts);
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
  // PATCH /leaves/:id/reject
  // If previously Approved, reverses hours for every leave type on the leave.
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
          `Only Pending, Reviewed, or Approved leaves can be rejected. Current status: ${leave.status}`,
        );
      }

      await conn.beginTransaction();

      await conn.query(
        `UPDATE leaves SET status = 'Rejected', rejected_by = ?, date_rejected = NOW() WHERE id = ?`,
        [rejectedBy, id],
      );

      // Restore balance per leave type — only if leave was Approved
      if (leave.status === 'Approved') {
        const leaveYear = new Date(leave.created_at).getFullYear();

        const [durationRows] = await conn.query<mysql.RowDataPacket[]>(
          `SELECT ld.*, lt.name AS leave_type_name
           FROM leave_durations ld
           LEFT JOIN leave_types lt ON lt.unique_id = ld.leave_type_id
           WHERE ld.leave_id = ?`,
          [id],
        );
        const breakdown = this.buildBreakdown(durationRows as LeaveDuration[]);

        for (const [leaveTypeId, { name, hours }] of breakdown) {
          const [balanceRows] = await conn.query<mysql.RowDataPacket[]>(
            `SELECT id FROM leave_balances
             WHERE staff_id = ? AND leave_type_id = ? AND year = ?
             FOR UPDATE`,
            [leave.staff_id, leaveTypeId, leaveYear],
          );

          if (!balanceRows.length) continue; // edge case: balance deleted post-approval

          const balanceId = balanceRows[0].id as number;

          await conn.query(
            `UPDATE leave_balances
             SET used_hours = used_hours - ?, remaining_hours = remaining_hours + ?
             WHERE id = ?`,
            [hours, hours, balanceId],
          );

          await conn.query(
            `INSERT INTO leave_balance_transactions
               (unique_id, balance_id, staff_id, leave_type_id, leave_id, type, hours, note, created_by)
             VALUES (?, ?, ?, ?, ?, 'reversal', ?, ?, ?)`,
            [
              randomBytes(16).toString('hex'),
              balanceId,
              leave.staff_id,
              leaveTypeId,
              id,
              hours,
              `Leave rejected — restored ${hours} hrs (${name})`,
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
        const staffName = await this.resolveStaffName(conn, leave.staff_id);
        const breakdown = this.buildBreakdown(updated.durations ?? []);
        const { startDate, endDate } = this.summariseDurations(
          updated.durations ?? [],
        );

        const message = msgRejected(
          staffName,
          breakdown,
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
        if (staffEmail)
          await this.mailService.sendCaseNotification({
            ...mailOpts,
            to: staffEmail,
          });
        if (hrEmails.length)
          await this.mailService.sendToMany(hrEmails, mailOpts);
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
  // PATCH /leaves/:id/cancel  (Staff self-service — Pending/Reviewed only)
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
            'Approved leaves cannot be self-cancelled. Please ask your supervisor or HR to reject the leave instead.',
          );
        }
        throw new BadRequestException(
          `Only Pending or Reviewed leaves can be cancelled. Current status: ${leave.status}`,
        );
      }

      await conn.beginTransaction();

      await conn.query(
        `UPDATE leaves
         SET status = 'Cancelled', cancelled_by = ?, date_cancelled = NOW()
         WHERE id = ?`,
        [cancelledBy, id],
      );

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
        const staffName = await this.resolveStaffName(conn, leave.staff_id);
        const breakdown = this.buildBreakdown(updated.durations ?? []);
        const { startDate, endDate } = this.summariseDurations(
          updated.durations ?? [],
        );

        const message = msgCancelled(
          staffName,
          breakdown,
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
        if (staffEmail)
          await this.mailService.sendCaseNotification({
            ...mailOpts,
            to: staffEmail,
          });
        if (supervisorEmail)
          await this.mailService.sendCaseNotification({
            ...mailOpts,
            to: supervisorEmail,
          });
        if (hrEmails.length)
          await this.mailService.sendToMany(hrEmails, mailOpts);
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
  // GET /leaves/:id/cancellation
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
