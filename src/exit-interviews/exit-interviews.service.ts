import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  Inject,
} from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import { randomBytes } from 'crypto';
import { CreateExitInterviewDto } from './dto/create-exit-interview.dto';
import { UpdateExitInterviewDto } from './dto/update-exit-interview.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { ensureExists } from '../utils/check-exit.util';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface ExitInterview {
  id: number;
  unique_id: string;
  staff_id: number;
  department_id: string;
  supervisor_id: string;
  program_id: string;
  country_id: string;
  location_id: string;
  resignation_date: string;
  reason_for_leaving: string;
  other_reason: string;
  most_enjoyed: string;
  company_improvement: string;
  handover_notes: string;
  new_employer: string;
  would_recommend: string;
  stage: string;
  status: string;
  supervisor_cleared: 'Yes' | 'No' | 'Pending';
  hr_cleared: 'Yes' | 'No' | 'Pending';
  operations_cleared: 'Yes' | 'No' | 'Pending';
  finance_cleared: 'Yes' | 'No' | 'Pending';
  hr_director_cleared: 'Yes' | 'No' | 'Pending';
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface ExitInterviewDetail extends ExitInterview {
  staff_first_name: string;
  staff_last_name: string;
  department_name: string;
  location_name: string;
  country_name: string;
  program_name: string;
}

export interface AuditLog {
  id: number;
  unique_id: string;
  interview_id: string;
  action: string;
  from_stage: string | null;
  to_stage: string | null;
  from_status: string | null;
  to_status: string | null;
  performed_by: string;
  notes: string | null;
  created_at: Date;
}

export interface Clearance {
  id: string;
  unique_id: string;
  exit_interview_id: string;
  check_list_item_id: string;
  department: string;
  cleared_by: string;
  cleared_at: Date;
  notes: string;
  item_name: string;
}

export interface ClearanceStatusResult {
  exit_interview_id: string;
  stage: string;
  status: string;
  supervisor_cleared: 'Yes' | 'No' | 'Pending';
  hr_cleared: 'Yes' | 'No' | 'Pending';
  operations_cleared: 'Yes' | 'No' | 'Pending';
  finance_cleared: 'Yes' | 'No' | 'Pending';
  hr_director_cleared: 'Yes' | 'No' | 'Pending';
  hr_can_finalize: boolean;
  completed: boolean;
  clearances: Clearance[];
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

// ─── Shared SQL fragments ──────────────────────────────────────────────────────

const DETAIL_SELECT = `
  ei.*,
  e.first_name AS staff_first_name,
  e.last_name  AS staff_last_name,
  d.name       AS department_name,
  l.name       AS location_name,
  c.name       AS country_name,
  p.name       AS program_name
`;

const DETAIL_JOINS = `
  LEFT JOIN employee e    ON e.unique_id = ei.staff_id
  LEFT JOIN departments d ON d.unique_id = ei.department_id
  LEFT JOIN locations l   ON l.unique_id = ei.location_id
  LEFT JOIN countries c   ON c.unique_id = ei.country_id
  LEFT JOIN programs p    ON p.unique_id = ei.program_id
`;

// ─── Stage / Status flow ──────────────────────────────────────────────────────
// status: Pending      stage: Supervisor  → status: Operations   stage: Operations
// status: Operations   stage: Operations  → status: Finance       stage: Finance
// status: Finance      stage: Finance     → status: HR            stage: HR
// status: HR           stage: HR          → status: HR_Director   stage: HR_Director
// status: HR_Director  stage: HR_Director → status: Approved      stage: Completed

type ClearDepartment =
  | 'Supervisor'
  | 'Operations'
  | 'Finance'
  | 'HR'
  | 'HR_Director';

const COL_MAP: Record<ClearDepartment, { flag: string; date: string }> = {
  Supervisor: { flag: 'supervisor_cleared', date: 'supervisor_cleared_date' },
  Operations: { flag: 'operations_cleared', date: 'operations_cleared_date' },
  Finance: { flag: 'finance_cleared', date: 'finance_cleared_date' },
  HR: { flag: 'hr_cleared', date: 'hr_cleared_date' },
  HR_Director: {
    flag: 'hr_director_cleared',
    date: 'hr_director_cleared_date',
  },
};

const NEXT_STAGE: Record<ClearDepartment, { status: string; stage: string }> = {
  Supervisor: { status: 'Operations', stage: 'Operations' },
  Operations: { status: 'Finance', stage: 'Finance' },
  Finance: { status: 'HR', stage: 'HR' },
  HR: { status: 'HR_Director', stage: 'HR_Director' },
  HR_Director: { status: 'Approved', stage: 'Completed' },
};

@Injectable()
export class ExitInterviewService {
  constructor(@Inject('MYSQL_POOL') private readonly pool: mysql.Pool) {}

  // ---------------------------------------------------------------------------
  // PRIVATE — write an audit log entry
  // ---------------------------------------------------------------------------
  private async writeAuditLog(
    conn: mysql.PoolConnection,
    interviewId: string,
    action: string,
    performedBy: string,
    opts?: {
      fromStage?: string;
      toStage?: string;
      fromStatus?: string;
      toStatus?: string;
      notes?: string;
    },
  ): Promise<void> {
    await conn.execute(
      `INSERT INTO exit_interview_audit_log
         (unique_id, interview_id, action, from_stage, to_stage,
          from_status, to_status, performed_by, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomBytes(16).toString('hex'),
        interviewId,
        action,
        opts?.fromStage ?? null,
        opts?.toStage ?? null,
        opts?.fromStatus ?? null,
        opts?.toStatus ?? null,
        performedBy,
        opts?.notes ?? null,
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // POST /exit-interviews
  // ---------------------------------------------------------------------------
  async create(
    dto: CreateExitInterviewDto,
    user: RequestUser,
  ): Promise<ExitInterviewDetail> {
    const conn = await this.pool.getConnection();
    try {
      const unique_id = randomBytes(16).toString('hex');
      const created_by = user.email || 'System';
      const checks: Promise<void>[] = [];

      if (dto.departmentId)
        checks.push(
          ensureExists(
            this.pool,
            'departments',
            dto.departmentId,
            'Department',
          ),
        );
      if (dto.programId)
        checks.push(
          ensureExists(this.pool, 'programs', dto.programId, 'Program'),
        );
      if (dto.countryId)
        checks.push(
          ensureExists(this.pool, 'countries', dto.countryId, 'Country'),
        );
      if (dto.locationId)
        checks.push(
          ensureExists(this.pool, 'locations', dto.locationId, 'Location'),
        );

      const [supervisor] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM employee WHERE unique_id = ?',
        [dto.supervisorId],
      );
      if (!supervisor.length)
        throw new NotFoundException(
          `Supervisor with id ${dto.supervisorId} not found`,
        );

      await Promise.all(checks);

      await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO exit_interviews (
          unique_id, staff_id, department_id, supervisor_id, program_id,
          country_id, location_id, resignation_date, reason_for_leaving,
          other_reason, most_enjoyed, company_improvement, handover_notes,
          new_employer, why_leaving, what_would_prevent, suggestions,
          work_as_expected, work_expected_comments, workload,
          supervisor_fair, supervisor_communication, supervisor_feedback,
          supervisor_recognition, supervisor_sensitive, supervisor_policies,
          supervisor_complaints, rating_pay, rating_training, rating_career_dev,
          rating_equipment, rating_work_conditions, rating_orientation,
          rating_perf_review, rating_coop_dept, rating_coop_other, rating_comments,
          benefit_medical, benefit_annual_leave, benefit_sick_leave,
          benefit_gratuity, benefit_holidays, benefit_education,
          would_recommend, stage, status, created_by
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?
        )`,
        [
          unique_id,
          dto.staffId,
          dto.departmentId,
          dto.supervisorId,
          dto.programId,
          dto.countryId,
          dto.locationId,
          dto.resignationDate,
          dto.reasonForLeaving,
          dto.otherReason ?? null,
          dto.mostEnjoyed ?? null,
          dto.companyImprovement ?? null,
          dto.handoverNotes ?? null,
          dto.newEmployer ?? null,
          dto.whyLeaving ?? null,
          dto.whatWouldPrevent ?? null,
          dto.suggestions ?? null,
          dto.workAsExpected ?? null,
          dto.workExpectedComments ?? null,
          dto.workload ?? null,
          dto.supervisorFair ?? null,
          dto.supervisorCommunication ?? null,
          dto.supervisorFeedback ?? null,
          dto.supervisorRecognition ?? null,
          dto.supervisorSensitive ?? null,
          dto.supervisorPolicies ?? null,
          dto.supervisorComplaints ?? null,
          dto.ratingPay ?? null,
          dto.ratingTraining ?? null,
          dto.ratingCareerDev ?? null,
          dto.ratingEquipment ?? null,
          dto.ratingWorkConditions ?? null,
          dto.ratingOrientation ?? null,
          dto.ratingPerfReview ?? null,
          dto.ratingCoopDept ?? null,
          dto.ratingCoopOther ?? null,
          dto.ratingComments ?? null,
          dto.benefitMedical ?? null,
          dto.benefitAnnualLeave ?? null,
          dto.benefitSickLeave ?? null,
          dto.benefitGratuity ?? null,
          dto.benefitHolidays ?? null,
          dto.benefitEducation ?? null,
          dto.wouldRecommend ?? null,
          'Supervisor',
          'Pending',
          created_by,
        ],
      );

      await this.writeAuditLog(
        conn,
        unique_id,
        'Exit interview submitted',
        created_by,
        {
          toStage: 'Supervisor',
          toStatus: 'Pending',
        },
      );

      return this.findOne(unique_id);
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // ---------------------------------------------------------------------------
  // GET /exit-interviews
  // ---------------------------------------------------------------------------
  async findAll(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<ExitInterviewDetail>> {
    const conn = await this.pool.getConnection();
    try {
      const page = query.page ?? 1;
      const limit = query.limit ?? 10;
      const offset = (page - 1) * limit;

      const params: (string | number)[] = [];
      const conditions: string[] = [];

      if (query.search) {
        conditions.push(`(
          ei.unique_id LIKE ?          OR
          ei.reason_for_leaving LIKE ? OR
          ei.stage LIKE ?              OR
          ei.status LIKE ?             OR
          e.first_name LIKE ?          OR
          e.last_name LIKE ?
        )`);
        const term = `%${query.search}%`;
        params.push(term, term, term, term, term, term);
      }
      if (query.departmentId) {
        conditions.push('ei.department_id = ?');
        params.push(query.departmentId);
      }
      if (query.locationId) {
        conditions.push('ei.location_id = ?');
        params.push(query.locationId);
      }
      if (query.countryId) {
        conditions.push('ei.country_id = ?');
        params.push(query.countryId);
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const [[countRow]] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM exit_interviews ei ${DETAIL_JOINS} ${whereClause}`,
        params,
      );
      const total = countRow['total'] as number;

      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT ${DETAIL_SELECT}
         FROM exit_interviews ei
         ${DETAIL_JOINS}
         ${whereClause}
         ORDER BY ei.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );

      return {
        data: rows as ExitInterviewDetail[],
        meta: { total, page, limit, last_page: Math.ceil(total / limit) },
      };
    } catch (err) {
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // ---------------------------------------------------------------------------
  // GET /exit-interviews/:id
  // ---------------------------------------------------------------------------
  async findOne(id: string): Promise<ExitInterviewDetail> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT ${DETAIL_SELECT}
         FROM exit_interviews ei
         ${DETAIL_JOINS}
         WHERE ei.unique_id = ?`,
        [id],
      );
      if (!rows.length)
        throw new NotFoundException(`Exit interview with id ${id} not found`);
      return rows[0] as ExitInterviewDetail;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // ---------------------------------------------------------------------------
  // GET /exit-interviews/unique/:uniqueId
  // ---------------------------------------------------------------------------
  async findByUniqueId(uniqueId: string): Promise<ExitInterviewDetail> {
    return this.findOne(uniqueId);
  }

  // ---------------------------------------------------------------------------
  // GET /exit-interviews/staff/:staffId
  // ---------------------------------------------------------------------------
  async findByStaffId(staffId: number): Promise<ExitInterviewDetail[]> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT ${DETAIL_SELECT}
         FROM exit_interviews ei ${DETAIL_JOINS}
         WHERE ei.staff_id = ?
         ORDER BY ei.created_at DESC`,
        [staffId],
      );
      return rows as ExitInterviewDetail[];
    } catch (err) {
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // ---------------------------------------------------------------------------
  // GET /exit-interviews/supervisor/:supervisorId
  // ---------------------------------------------------------------------------
  async findBySupervisorId(
    supervisorId: string,
  ): Promise<ExitInterviewDetail[]> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT ${DETAIL_SELECT}
         FROM exit_interviews ei ${DETAIL_JOINS}
         WHERE ei.supervisor_id = ?
         ORDER BY ei.created_at DESC`,
        [supervisorId],
      );
      return rows as ExitInterviewDetail[];
    } catch (err) {
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // ---------------------------------------------------------------------------
  // GET /exit-interviews/pending/:department
  // ---------------------------------------------------------------------------
  async findPendingByDepartment(
    department: string,
  ): Promise<PaginatedResult<ExitInterviewDetail>> {
    const conn = await this.pool.getConnection();
    try {
      const colMap: Record<string, string> = {
        Supervisor: 'supervisor_cleared',
        Operations: 'operations_cleared',
        Finance: 'finance_cleared',
        HR: 'hr_cleared',
        HR_Director: 'hr_director_cleared',
      };
      const col = colMap[department] ?? 'supervisor_cleared';

      const [[countRow]] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT COUNT(*) AS total
         FROM exit_interviews ei ${DETAIL_JOINS}
         WHERE ei.stage = ? AND ei.${col} = 'Pending'`,
        [department],
      );
      const total = countRow['total'] as number;

      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT ${DETAIL_SELECT}
         FROM exit_interviews ei ${DETAIL_JOINS}
         WHERE ei.stage = ? AND ei.${col} = 'Pending'
         ORDER BY ei.created_at DESC`,
        [department],
      );

      return {
        data: rows as ExitInterviewDetail[],
        meta: { total, page: 1, limit: total, last_page: 1 },
      };
    } catch (err) {
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // ---------------------------------------------------------------------------
  // GET /exit-interviews/:id/clearance-status
  // ---------------------------------------------------------------------------
  async getClearanceStatus(id: string): Promise<ClearanceStatusResult> {
    const conn = await this.pool.getConnection();
    try {
      const [[row]] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT stage, status, supervisor_cleared, hr_cleared,
                operations_cleared, finance_cleared, hr_director_cleared
         FROM exit_interviews WHERE unique_id = ?`,
        [id],
      );
      if (!row)
        throw new NotFoundException(`Exit interview with id ${id} not found`);

      const [clearances] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT eic.*, cli.name AS item_name
         FROM exit_interview_clearances eic
         LEFT JOIN check_list_items cli ON cli.id = eic.check_list_item_id
         WHERE eic.exit_interview_id = ?
         ORDER BY eic.cleared_at ASC`,
        [id],
      );

      const supVal = row['supervisor_cleared'] as 'Yes' | 'No' | 'Pending';
      const opsVal = row['operations_cleared'] as 'Yes' | 'No' | 'Pending';
      const finVal = row['finance_cleared'] as 'Yes' | 'No' | 'Pending';
      const hrVal = row['hr_cleared'] as 'Yes' | 'No' | 'Pending';
      const dirVal = row['hr_director_cleared'] as 'Yes' | 'No' | 'Pending';

      return {
        exit_interview_id: id,
        stage: row['stage'] as string,
        status: row['status'] as string,
        supervisor_cleared: supVal,
        operations_cleared: opsVal,
        finance_cleared: finVal,
        hr_cleared: hrVal,
        hr_director_cleared: dirVal,
        hr_can_finalize: row['stage'] === 'HR_Director',
        completed: row['stage'] === 'Completed',
        clearances: clearances as Clearance[],
      };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // ---------------------------------------------------------------------------
  // POST /exit-interviews/:id/clear
  // ---------------------------------------------------------------------------
  async clearDepartment(
    id: string,
    department: ClearDepartment,
    clearedBy: string,
    checkListItemIds: number[],
    notes?: string,
  ): Promise<ClearanceStatusResult> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      const [existing] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT stage, status FROM exit_interviews WHERE unique_id = ?`,
        [id],
      );
      if (!existing.length)
        throw new NotFoundException(`Exit interview with id ${id} not found`);

      const fromStage = existing[0]['stage'] as string;
      const fromStatus = existing[0]['status'] as string;

      // Insert clearance rows — IGNORE duplicates
      for (const itemId of checkListItemIds) {
        await conn.execute(
          `INSERT IGNORE INTO exit_interview_clearances
             (unique_id, exit_interview_id, check_list_item_id, department, cleared_by, notes)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            randomBytes(16).toString('hex'),
            id,
            itemId,
            department,
            clearedBy,
            notes ?? null,
          ],
        );
      }

      // Mark this department as cleared
      const { flag, date } = COL_MAP[department];
      await conn.execute(
        `UPDATE exit_interviews
         SET ${flag} = 'Yes', ${date} = CURDATE()
         WHERE unique_id = ?`,
        [id],
      );

      // Advance stage and status — no conditional logic needed
      const { status: nextStatus, stage: nextStage } = NEXT_STAGE[department];
      await conn.execute(
        `UPDATE exit_interviews SET stage = ?, status = ? WHERE unique_id = ?`,
        [nextStage, nextStatus, id],
      );

      // Audit log — one entry covering both clearance and stage advance
      await this.writeAuditLog(
        conn,
        id,
        `${department} clearance submitted`,
        clearedBy,
        {
          fromStage,
          toStage: nextStage,
          fromStatus,
          toStatus: nextStatus,
          notes,
        },
      );

      await conn.commit();
      return this.getClearanceStatus(id);
    } catch (err) {
      await conn.rollback();
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // ---------------------------------------------------------------------------
  // PATCH /exit-interviews/:id/finalize  (HR Director sign-off)
  // ---------------------------------------------------------------------------
  async finalize(id: string, user: RequestUser): Promise<ExitInterviewDetail> {
    const conn = await this.pool.getConnection();
    try {
      const [[row]] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT stage, status FROM exit_interviews WHERE unique_id = ?`,
        [id],
      );
      if (!row)
        throw new NotFoundException(`Exit interview with id ${id} not found`);

      if (row['stage'] !== 'HR_Director') {
        throw new InternalServerErrorException(
          `Cannot finalize: interview must be at HR_Director stage. Current stage: ${row['stage'] as string}`,
        );
      }

      const fromStage = row['stage'] as string;
      const fromStatus = row['status'] as string;
      const finalizedBy = user.email || 'System';

      await conn.execute(
        `UPDATE exit_interviews
         SET stage = 'Completed', status = 'Approved',
             hr_director_cleared = 'Yes', hr_director_cleared_date = CURDATE()
         WHERE unique_id = ?`,
        [id],
      );

      await this.writeAuditLog(
        conn,
        id,
        'Exit interview finalized by HR Director',
        finalizedBy,
        {
          fromStage,
          toStage: 'Completed',
          fromStatus,
          toStatus: 'Approved',
        },
      );

      return this.findOne(id);
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // ---------------------------------------------------------------------------
  // PATCH /exit-interviews/:id
  // ---------------------------------------------------------------------------
  async update(
    id: string,
    dto: UpdateExitInterviewDto,
    user: RequestUser,
  ): Promise<ExitInterviewDetail> {
    const conn = await this.pool.getConnection();
    try {
      const [existing] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM exit_interviews WHERE unique_id = ?',
        [id],
      );
      if (!existing.length)
        throw new NotFoundException(`Exit interview with id ${id} not found`);

      const columnMap: Record<string, string> = {
        staffId: 'staff_id',
        departmentId: 'department_id',
        supervisorId: 'supervisor_id',
        resignationDate: 'resignation_date',
        reasonForLeaving: 'reason_for_leaving',
        otherReason: 'other_reason',
        mostEnjoyed: 'most_enjoyed',
        companyImprovement: 'company_improvement',
        handoverNotes: 'handover_notes',
        newEmployer: 'new_employer',
        whyLeaving: 'why_leaving',
        whatWouldPrevent: 'what_would_prevent',
        suggestions: 'suggestions',
        workAsExpected: 'work_as_expected',
        workExpectedComments: 'work_expected_comments',
        workload: 'workload',
        supervisorFair: 'supervisor_fair',
        supervisorCommunication: 'supervisor_communication',
        supervisorFeedback: 'supervisor_feedback',
        supervisorRecognition: 'supervisor_recognition',
        supervisorSensitive: 'supervisor_sensitive',
        supervisorPolicies: 'supervisor_policies',
        supervisorComplaints: 'supervisor_complaints',
        ratingPay: 'rating_pay',
        ratingTraining: 'rating_training',
        ratingCareerDev: 'rating_career_dev',
        ratingEquipment: 'rating_equipment',
        ratingWorkConditions: 'rating_work_conditions',
        ratingOrientation: 'rating_orientation',
        ratingPerfReview: 'rating_perf_review',
        ratingCoopDept: 'rating_coop_dept',
        ratingCoopOther: 'rating_coop_other',
        ratingComments: 'rating_comments',
        benefitMedical: 'benefit_medical',
        benefitAnnualLeave: 'benefit_annual_leave',
        benefitSickLeave: 'benefit_sick_leave',
        benefitGratuity: 'benefit_gratuity',
        benefitHolidays: 'benefit_holidays',
        benefitEducation: 'benefit_education',
        wouldRecommend: 'would_recommend',
        stage: 'stage',
        status: 'status',
        programId: 'program_id',
        countryId: 'country_id',
        locationId: 'location_id',
      };

      const fields = (
        Object.keys(dto) as (keyof UpdateExitInterviewDto)[]
      ).filter((f) => dto[f] !== undefined);
      if (!fields.length) return this.findOne(id);

      const setClauses = fields
        .map((f) => `${columnMap[f] ?? f} = ?`)
        .join(', ');
      const values = fields.map((f) => dto[f]);

      await conn.execute(
        `UPDATE exit_interviews SET ${setClauses} WHERE unique_id = ?`,
        [...values, id],
      );

      await this.writeAuditLog(
        conn,
        id,
        'Exit interview updated',
        user.email || 'System',
        {
          notes: `Fields updated: ${fields.join(', ')}`,
        },
      );

      return this.findOne(id);
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // ---------------------------------------------------------------------------
  // DELETE /exit-interviews/:id
  // ---------------------------------------------------------------------------
  async remove(id: string): Promise<{ message: string }> {
    const conn = await this.pool.getConnection();
    try {
      const [existing] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM exit_interviews WHERE unique_id = ?',
        [id],
      );
      if (!existing.length)
        throw new NotFoundException(`Exit interview with id ${id} not found`);

      await conn.execute('DELETE FROM exit_interviews WHERE unique_id = ?', [
        id,
      ]);
      return { message: `Exit interview ${id} deleted successfully` };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // ---------------------------------------------------------------------------
  // GET /exit-interviews/:id/audit-log
  // ---------------------------------------------------------------------------
  async getAuditLog(id: string): Promise<AuditLog[]> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT * FROM exit_interview_audit_log
         WHERE interview_id = ?
         ORDER BY created_at ASC`,
        [id],
      );
      return rows as AuditLog[];
    } catch (err) {
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // ---------------------------------------------------------------------------
  // GET /exit-interviews/dashboard
  // ---------------------------------------------------------------------------
  async getDashboard(): Promise<Record<string, unknown>> {
    const conn = await this.pool.getConnection();
    try {
      const [[totalRow]] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT COUNT(*) AS total FROM exit_interviews',
      );

      const [byStage] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT stage, COUNT(*) AS count FROM exit_interviews
         GROUP BY stage ORDER BY count DESC`,
      );

      const [byStatus] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT status, COUNT(*) AS count FROM exit_interviews
         GROUP BY status ORDER BY count DESC`,
      );

      const [byDepartment] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT d.name AS department, COUNT(*) AS count
         FROM exit_interviews ei
         LEFT JOIN departments d ON d.unique_id = ei.department_id
         GROUP BY ei.department_id, d.name ORDER BY count DESC`,
      );

      const [byLocation] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT l.name AS location, COUNT(*) AS count
         FROM exit_interviews ei
         LEFT JOIN locations l ON l.unique_id = ei.location_id
         GROUP BY ei.location_id, l.name ORDER BY count DESC`,
      );

      const [byCountry] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT c.name AS country, COUNT(*) AS count
         FROM exit_interviews ei
         LEFT JOIN countries c ON c.unique_id = ei.country_id
         GROUP BY ei.country_id, c.name ORDER BY count DESC`,
      );

      const [wouldRecommend] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT would_recommend, COUNT(*) AS count FROM exit_interviews
         GROUP BY would_recommend ORDER BY count DESC`,
      );

      const [monthlyTrend] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS count
         FROM exit_interviews
         WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
         GROUP BY month ORDER BY month ASC`,
      );

      const [yearlyTrend] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT YEAR(created_at) AS year, COUNT(*) AS count
         FROM exit_interviews
         GROUP BY year ORDER BY year ASC`,
      );

      return {
        total: totalRow['total'] as number,
        by_stage: byStage,
        by_status: byStatus,
        by_department: byDepartment,
        by_location: byLocation,
        by_country: byCountry,
        would_recommend: wouldRecommend,
        monthly_trend: monthlyTrend,
        yearly_trend: yearlyTrend,
      };
    } catch (err) {
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }
}
