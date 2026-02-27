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

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface Program {
  id: number;
  unique_id: string;
  name: string;
  fund_code: number;
  start_date: string;
  end_date: string;
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
  async create(dto: CreateProgramDto): Promise<Program> {
    const conn = await this.pool.getConnection();
    try {
      const [existing] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM programs WHERE unique_id = ?',
        [dto.unique_id],
      );
      if (existing.length > 0) {
        throw new ConflictException(
          `Program with unique_id "${dto.unique_id}" already exists`,
        );
      }

      const [result] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO programs (unique_id, name, fund_code, start_date, end_date, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          dto.unique_id,
          dto.name,
          dto.fund_code,
          dto.start_date,
          dto.end_date,
          dto.created_by,
        ],
      );

      return this.findOne(result.insertId);
    } catch (err) {
      if (err instanceof ConflictException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // GET /programs
  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<Program>> {
    const conn = await this.pool.getConnection();
    try {
      const page = query.page ?? 1;
      const limit = query.limit ?? 10;
      const offset = (page - 1) * limit;

      const params: (string | number)[] = [];
      let whereClause = '';

      if (query.search) {
        whereClause = 'WHERE name LIKE ? OR unique_id LIKE ?';
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
  async findOne(id: number): Promise<Program> {
    const conn = await this.pool.getConnection();

    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM programs WHERE id = ?',
        [id],
      );
      if (!rows.length)
        throw new NotFoundException(`Program with id ${id} not found`);
      return rows[0] as Program;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
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
  async update(id: number, dto: UpdateProgramDto): Promise<Program> {
    const conn = await this.pool.getConnection();
    try {
      await this.findOne(id); // 404 guard

      const fields = Object.keys(dto) as (keyof UpdateProgramDto)[];
      if (!fields.length) return this.findOne(id);

      const setClauses = fields.map((f) => `${f} = ?`).join(', ');
      const values = fields.map((f) => dto[f]);

      await conn.execute(`UPDATE programs SET ${setClauses} WHERE id = ?`, [
        ...values,
        id,
      ]);

      return this.findOne(id);
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // DELETE /programs/:id
  async remove(id: number): Promise<{ message: string }> {
    const conn = await this.pool.getConnection();
    try {
      await this.findOne(id); // 404 guard

      await conn.execute('DELETE FROM programs WHERE id = ?', [id]);

      return { message: `Program ${id} deleted successfully` };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }
}
