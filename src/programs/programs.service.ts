import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  Inject,
} from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import {
  CreateProgramDto,
  UpdateProgramDto,
  PaginationQueryDto,
} from './dto/program.dto';
import { randomBytes } from 'crypto';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface Program {
  id: number;
  unique_id: string;
  name: string;
  fund_code: number;
  start_date: string;
  end_date: string;
  country: string;
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

// ─── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ProgramsService {
  constructor(@Inject('MYSQL_POOL') private readonly pool: mysql.Pool) {}

  // POST /programs
  async create(dto: CreateProgramDto, user: RequestUser): Promise<Program> {
    const conn = await this.pool.getConnection();
    try {
      const [existing] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT unique_id, status FROM programs WHERE fund_code = ?',
        [dto.fundCode],
      );
      if (existing.length > 0) {
        //if status is Deleted, change status to Active and update the program
        if (existing[0].status === 'Deleted') {
          await conn.execute(
            'UPDATE programs SET name = ?, start_date = ?, end_date = ?, status = "Active" WHERE fund_code = ?',
            [dto.name, dto.startDate, dto.endDate, dto.fundCode],
          );
          return this.findOne(existing[0].unique_id);
        } else {
          throw new ConflictException(
            `Program with fund_code "${dto.fundCode}" already exists`,
          );
        }
      }

      const unique_id: string = randomBytes(16).toString('hex');
      const created_by: string = user.email;

      await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO programs (unique_id, name, fund_code, start_date, end_date, created_by, status, country)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          unique_id,
          dto.name,
          dto.fundCode,
          dto.startDate,
          dto.endDate,
          created_by,
          'Active',
          dto.countryId,
        ],
      );

      return this.findOne(unique_id);
    } catch (err) {
      if (err instanceof ConflictException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<Program>> {
    const conn = await this.pool.getConnection();
    try {
      const page = query.page ?? 1;
      const limit = query.limit ?? 10;
      const offset = (page - 1) * limit;

      const params: (string | number)[] = [];
      let whereClause = "WHERE status = 'Active'";

      if (query.search) {
        whereClause += ' AND (name LIKE ? OR unique_id LIKE ?)';
        const term = `%${query.search}%`;
        params.push(term, term);
      }

      const [[countRow]] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM programs ${whereClause}`,
        params,
      );

      const total = countRow['total'] as number;

      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT * FROM programs ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );

      return {
        data: rows as Program[],
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

  // GET /programs/:id
  // Either use pool directly everywhere (simplest):
  async findOne(id: string): Promise<Program> {
    const conn = await this.pool.getConnection();

    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM programs WHERE unique_id = ?',
        [id],
      );
      if (!rows.length)
        throw new NotFoundException(`Program with unique_id ${id} not found`);
      return rows[0] as Program;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // GET /programs/unique/:uniqueId
  async findByUniqueId(uniqueId: string): Promise<Program> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM programs WHERE unique_id = ?',
        [uniqueId],
      );
      if (!rows.length) {
        throw new NotFoundException(
          `Program with unique_id "${uniqueId}" not found`,
        );
      }
      return rows[0] as Program;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // PATCH /programs/:id
  async update(id: string, dto: UpdateProgramDto): Promise<Program> {
    const conn = await this.pool.getConnection();
    try {
      const [findProgram] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT unique_id FROM programs WHERE unique_id = ?',
        [id],
      );
      if (!findProgram.length) {
        throw new NotFoundException(`Program with unique_id ${id} not found`);
      }

      const fieldMap: Record<string, string> = {
        name: 'name',
        fundCode: 'fund_code',
        startDate: 'start_date',
        endDate: 'end_date',
        countryId: 'country',
      };

      const fields = Object.keys(dto) as (keyof UpdateProgramDto)[];
      if (!fields.length) return this.findOne(id);

      const setClauses = fields
        .map((f) => `${fieldMap[f as string] ?? f} = ?`)
        .join(', ');
      const values = fields.map((f) => dto[f]);

      await conn.execute(
        `UPDATE programs SET ${setClauses} WHERE unique_id = ?`,
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

  // DELETE /programs/:id
  async remove(id: string): Promise<{ message: string }> {
    const conn = await this.pool.getConnection();
    try {
      const [findProgram] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT unique_id FROM programs WHERE unique_id = ?',
        [id],
      );
      if (!findProgram.length) {
        throw new NotFoundException(`Program with unique_id ${id} not found`);
      }

      await conn.execute(
        "UPDATE programs SET status = 'Deleted' WHERE unique_id = ?",
        [id],
      );

      return { message: `Program ${id} deleted successfully` };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }
}
