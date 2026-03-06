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

export interface ExitInterview {
  id: number;
  unique_id: string;
  staff_id: number;
  department_id: number;
  supervisor_id: number;
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
  created_by: string;
  created_at: Date;
  updated_at: Date;
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
export class ExitInterviewService {
  constructor(@Inject('MYSQL_POOL') private readonly pool: mysql.Pool) {}

  // POST /exit-interviews
  async create(dto: CreateExitInterviewDto): Promise<ExitInterview> {
    const conn = await this.pool.getConnection();
    try {
      const unique_id = randomBytes(16).toString('hex');
      const created_by = 'System';

      const [result] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO exit_interviews (
            unique_id, staff_id, department_id, supervisor_id,
            resignation_date, reason_for_leaving, other_reason,
            most_enjoyed, company_improvement, handover_notes, new_employer,
            rating_culture, rating_job, rating_manager, would_recommend,
            stage, status, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          unique_id,
          dto.staffId,
          dto.departmentId,
          dto.supervisorId,
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
          dto.stage ?? 'Employee',
          dto.status ?? 'Pending',
          created_by,
        ],
      );

      return this.findOne(result.insertId);
    } catch (err) {
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // GET /exit-interviews
  async findAll(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<ExitInterview>> {
    const conn = await this.pool.getConnection();
    try {
      const page = query.page ?? 1;
      const limit = query.limit ?? 10;
      const offset = (page - 1) * limit;

      const params: (string | number)[] = [];
      let whereClause = '';

      if (query.search) {
        whereClause =
          'WHERE unique_id LIKE ? OR reason_for_leaving LIKE ? OR stage LIKE ? OR status LIKE ?';
        const term = `%${query.search}%`;
        params.push(term, term, term, term);
      }

      const [[countRow]] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM exit_interviews ${whereClause}`,
        params,
      );

      const total = countRow['total'] as number;

      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT * FROM exit_interviews ${whereClause}
           ORDER BY created_at DESC
           LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );

      return {
        data: rows as ExitInterview[],
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
  async findOne(id: number): Promise<ExitInterview> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM exit_interviews WHERE id = ?',
        [id],
      );
      if (!rows.length)
        throw new NotFoundException(`Exit interview with id ${id} not found`);
      return rows[0] as ExitInterview;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // GET /exit-interviews/unique/:uniqueId
  async findByUniqueId(uniqueId: string): Promise<ExitInterview> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM exit_interviews WHERE unique_id = ?',
        [uniqueId],
      );
      if (!rows.length)
        throw new NotFoundException(
          `Exit interview with unique_id "${uniqueId}" not found`,
        );
      return rows[0] as ExitInterview;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // GET /exit-interviews/staff/:staffId
  async findByStaffId(staffId: number): Promise<ExitInterview[]> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM exit_interviews WHERE staff_id = ? ORDER BY created_at DESC',
        [staffId],
      );
      return rows as ExitInterview[];
    } catch (err) {
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // PATCH /exit-interviews/:id
  async update(
    id: number,
    dto: UpdateExitInterviewDto,
  ): Promise<ExitInterview> {
    const conn = await this.pool.getConnection();
    try {
      const [existing] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM exit_interviews WHERE id = ?',
        [id],
      );
      if (!existing.length)
        throw new NotFoundException(`Exit interview with id ${id} not found`);

      // Map camelCase DTO keys to snake_case DB columns
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
        `UPDATE exit_interviews SET ${setClauses} WHERE id = ?`,
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
  async remove(id: number): Promise<{ message: string }> {
    const conn = await this.pool.getConnection();
    try {
      const [existing] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM exit_interviews WHERE id = ?',
        [id],
      );
      if (!existing.length)
        throw new NotFoundException(`Exit interview with id ${id} not found`);

      await conn.execute('DELETE FROM exit_interviews WHERE id = ?', [id]);

      return { message: `Exit interview ${id} deleted successfully` };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }
}
