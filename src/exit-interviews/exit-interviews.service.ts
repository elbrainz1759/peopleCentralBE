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
  rating_culture: number;
  rating_job: number;
  rating_manager: number;
  would_recommend: string;
  stage: string;
  status: string;
  operations_cleared: boolean;
  finance_cleared: boolean;
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
  operations_cleared: boolean;
  finance_cleared: boolean;
  hr_can_finalize: boolean;
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

// ─── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ExitInterviewService {
  constructor(@Inject('MYSQL_POOL') private readonly pool: mysql.Pool) {}

  // POST /exit-interviews
  async create(dto: CreateExitInterviewDto): Promise<ExitInterviewDetail> {
    const conn = await this.pool.getConnection();
    try {
      const unique_id = randomBytes(16).toString('hex');
      const created_by = 'System';
      const checks: Promise<void>[] = [];

      if (dto.departmentId) {
        checks.push(
          ensureExists(
            this.pool,
            'departments',
            dto.departmentId,
            'Department',
          ),
        );
      }
      if (dto.programId) {
        checks.push(
          ensureExists(this.pool, 'programs', dto.programId, 'Program'),
        );
      }
      if (dto.countryId) {
        checks.push(
          ensureExists(this.pool, 'countries', dto.countryId, 'Country'),
        );
      }
      if (dto.locationId) {
        checks.push(
          ensureExists(this.pool, 'locations', dto.locationId, 'Location'),
        );
      }

      // Check supervisor exists by unique_id
      const [supervisor] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM employee WHERE unique_id = ?',
        [dto.supervisorId],
      );
      if (!supervisor.length) {
        throw new NotFoundException(
          `Supervisor with id ${dto.supervisorId} not found`,
        );
      }

      await Promise.all(checks);

      await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO exit_interviews (
          unique_id, staff_id, department_id, supervisor_id, program_id, country_id, location_id,
          resignation_date, reason_for_leaving, other_reason,
          most_enjoyed, company_improvement, handover_notes, new_employer,
          rating_culture, rating_job, rating_manager, would_recommend,
          stage, status, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          dto.otherReason ?? '',
          dto.mostEnjoyed ?? null,
          dto.companyImprovement ?? null,
          dto.handoverNotes ?? null,
          dto.newEmployer ?? null,
          dto.ratingCulture,
          dto.ratingJob,
          dto.ratingManager,
          dto.wouldRecommend,
          dto.stage ?? 'HR',
          dto.status ?? 'Pending',
          created_by,
        ],
      );

      return this.findOne(unique_id);
    } catch (err) {
      console.error('Create exit interview error:', err);
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // GET /exit-interviews
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
        `SELECT COUNT(*) AS total
         FROM exit_interviews ei
         ${DETAIL_JOINS}
         ${whereClause}`,
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
        meta: {
          total,
          page,
          limit,
          last_page: Math.ceil(total / limit),
        },
      };
    } catch (err) {
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // GET /exit-interviews/:id
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

  // GET /exit-interviews/unique/:uniqueId
  async findByUniqueId(uniqueId: string): Promise<ExitInterviewDetail> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT ${DETAIL_SELECT}
         FROM exit_interviews ei
         ${DETAIL_JOINS}
         WHERE ei.unique_id = ?`,
        [uniqueId],
      );
      if (!rows.length)
        throw new NotFoundException(
          `Exit interview with unique_id "${uniqueId}" not found`,
        );
      return rows[0] as ExitInterviewDetail;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // GET /exit-interviews/staff/:staffId
  async findByStaffId(staffId: number): Promise<ExitInterviewDetail[]> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT ${DETAIL_SELECT}
         FROM exit_interviews ei
         ${DETAIL_JOINS}
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

  // GET /exit-interviews/supervisor/:supervisorId
  async findBySupervisorId(
    supervisorId: string,
  ): Promise<ExitInterviewDetail[]> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT ${DETAIL_SELECT}
         FROM exit_interviews ei
         ${DETAIL_JOINS}
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

  // GET /exit-interviews/pending/:department  (Operations | Finance)
  async findPendingByDepartment(
    department: string,
  ): Promise<PaginatedResult<ExitInterviewDetail>> {
    const conn = await this.pool.getConnection();
    try {
      const col =
        department === 'Operations' ? 'operations_cleared' : 'finance_cleared';

      const [[countRow]] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT COUNT(*) AS total
         FROM exit_interviews ei
         ${DETAIL_JOINS}
         WHERE ei.stage IN ('Operations', 'Finance') AND ei.${col} = 0`,
      );
      const total = countRow['total'] as number;

      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT ${DETAIL_SELECT}
         FROM exit_interviews ei
         ${DETAIL_JOINS}
         WHERE ei.stage IN ('Operations', 'Finance') AND ei.${col} = 0
         ORDER BY ei.created_at DESC`,
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

  // GET /exit-interviews/:id/clearance-status
  async getClearanceStatus(id: string): Promise<ClearanceStatusResult> {
    const conn = await this.pool.getConnection();
    try {
      const [[row]] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id, operations_cleared, finance_cleared FROM exit_interviews WHERE id = ?',
        [id],
      );
      if (!row)
        throw new NotFoundException(`Exit interview with id ${id} not found`);

      const [clearances] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT
           eic.*,
           cli.name AS item_name
         FROM exit_interview_clearances eic
         LEFT JOIN check_list_items cli ON cli.id = eic.check_list_item_id
         WHERE eic.exit_interview_id = ?
         ORDER BY eic.cleared_at ASC`,
        [id],
      );

      const opsDone = Boolean(row['operations_cleared']);
      const finDone = Boolean(row['finance_cleared']);

      return {
        exit_interview_id: id,
        operations_cleared: opsDone,
        finance_cleared: finDone,
        hr_can_finalize: opsDone && finDone,
        clearances: clearances as Clearance[],
      };
    } catch (err) {
      console.error('Get clearance status error:', err);
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // POST /exit-interviews/:id/clear  (Operations or Finance clears their items)
  async clearDepartment(
    id: string,
    department: 'Operations' | 'Finance' | 'HR',
    checkListItemIds: number[],
    notes?: string,
  ): Promise<ClearanceStatusResult> {
    console.log(
      `Clearing department ${department} for exit interview with id of ${id} with items:`,
      checkListItemIds,
      'and notes:',
      notes,
    );
    const clearedBy = 'System';
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      const [existing] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id, operations_cleared, finance_cleared FROM exit_interviews WHERE unique_id = ?',
        [id],
      );
      if (!existing.length)
        throw new NotFoundException(`Exit interview with id ${id} not found`);

      // Insert clearance rows for each checklist item (IGNORE duplicates)
      for (const itemId of checkListItemIds) {
        const unique_id = randomBytes(16).toString('hex');
        await conn.execute(
          `INSERT IGNORE INTO exit_interview_clearances
             (unique_id, exit_interview_id, check_list_item_id, department, cleared_by, notes)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [unique_id, id, itemId, department, clearedBy, notes ?? null],
        );
      }

      // Mark the department as cleared on the parent record
      const col =
        department === 'Operations' ? 'operations_cleared' : 'finance_cleared';
      await conn.execute(
        `UPDATE exit_interviews SET ${col} = 1 WHERE unique_id = ?`,
        [id],
      );

      // Re-fetch updated flags
      const [[updated]] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT operations_cleared, finance_cleared FROM exit_interviews WHERE unique_id = ?',
        [id],
      );

      const opsDone = Boolean(updated['operations_cleared']);
      const finDone = Boolean(updated['finance_cleared']);

      // Both cleared → advance to HR_Final
      if (opsDone && finDone) {
        await conn.execute(
          `UPDATE exit_interviews SET stage = 'HR_Final', status = 'In_Progress' WHERE unique_id = ?`,
          [id],
        );
      }

      await conn.commit();
      return this.getClearanceStatus(id);
    } catch (err) {
      console.error('Clear department error:', err);
      await conn.rollback();
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // PATCH /exit-interviews/:id/finalize  (HR final submission)
  async finalize(id: string): Promise<ExitInterviewDetail> {
    const conn = await this.pool.getConnection();
    const finalizedBy = 'System';
    try {
      const [[row]] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id, operations_cleared, finance_cleared, stage FROM exit_interviews WHERE unique_id = ?',
        [id],
      );
      if (!row)
        throw new NotFoundException(`Exit interview with id ${id} not found`);

      if (!row['operations_cleared'] || !row['finance_cleared']) {
        throw new InternalServerErrorException(
          'Cannot finalize: Operations and Finance must both clear before HR can finalize.',
        );
      }

      await conn.execute(
        `UPDATE exit_interviews
         SET stage = 'HR_Final', status = 'Completed', created_by = ?
         WHERE unique_id = ?`,
        [finalizedBy, id],
      );

      const exitId = row['unique_id'] as string;

      return this.findOne(exitId);
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // PATCH /exit-interviews/:id
  async update(
    id: string,
    dto: UpdateExitInterviewDto,
  ): Promise<ExitInterviewDetail> {
    const conn = await this.pool.getConnection();
    try {
      const [existing] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM exit_interviews WHERE id = ?',
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
        ratingCulture: 'rating_culture',
        ratingJob: 'rating_job',
        ratingManager: 'rating_manager',
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

      return this.findOne(id);
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // DELETE /exit-interviews/:id
  async remove(id: string): Promise<{ message: string }> {
    const conn = await this.pool.getConnection();
    try {
      const [existing] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM exit_interviews WHERE id = ?',
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

  // GET /exit-interviews/dashboard
  async getDashboard(): Promise<Record<string, any>> {
    const conn = await this.pool.getConnection();
    try {
      // ── Total ────────────────────────────────────────────────────────────────
      const [[totalRow]] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT COUNT(*) AS total FROM exit_interviews',
      );

      // ── By Stage ─────────────────────────────────────────────────────────────
      const [byStage] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT stage, COUNT(*) AS count
         FROM exit_interviews
         GROUP BY stage
         ORDER BY count DESC`,
      );

      // ── By Status ────────────────────────────────────────────────────────────
      const [byStatus] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT status, COUNT(*) AS count
         FROM exit_interviews
         GROUP BY status
         ORDER BY count DESC`,
      );

      // ── By Department ────────────────────────────────────────────────────────
      const [byDepartment] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT d.name AS department, COUNT(*) AS count
         FROM exit_interviews ei
         LEFT JOIN departments d ON d.unique_id = ei.department_id
         GROUP BY ei.department_id, d.name
         ORDER BY count DESC`,
      );

      // ── By Location ──────────────────────────────────────────────────────────
      const [byLocation] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT l.name AS location, COUNT(*) AS count
         FROM exit_interviews ei
         LEFT JOIN locations l ON l.unique_id = ei.location_id
         GROUP BY ei.location_id, l.name
         ORDER BY count DESC`,
      );

      // ── By Country ───────────────────────────────────────────────────────────
      const [byCountry] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT c.name AS country, COUNT(*) AS count
         FROM exit_interviews ei
         LEFT JOIN countries c ON c.unique_id = ei.country_id
         GROUP BY ei.country_id, c.name
         ORDER BY count DESC`,
      );

      // ── Would Recommend ──────────────────────────────────────────────────────
      const [wouldRecommend] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT would_recommend, COUNT(*) AS count
         FROM exit_interviews
         GROUP BY would_recommend
         ORDER BY count DESC`,
      );

      // ── Monthly Trend (last 12 months) ───────────────────────────────────────
      const [monthlyTrend] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT
           DATE_FORMAT(created_at, '%Y-%m') AS month,
           COUNT(*) AS count
         FROM exit_interviews
         WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
         GROUP BY month
         ORDER BY month ASC`,
      );

      // ── Yearly Trend ─────────────────────────────────────────────────────────
      const [yearlyTrend] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT
           YEAR(created_at) AS year,
           COUNT(*) AS count
         FROM exit_interviews
         GROUP BY year
         ORDER BY year ASC`,
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
