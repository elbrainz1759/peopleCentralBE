import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  Inject,
} from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { randomBytes } from 'crypto';

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface Country {
  id: number;
  unique_id: string;
  name: string;
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
export class CountriesService {
  constructor(@Inject('MYSQL_POOL') private readonly pool: mysql.Pool) {}

  // POST /countries
  async create(dto: CreateCountryDto): Promise<Country> {
    const conn = await this.pool.getConnection();
    try {
      const [existing] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM countries WHERE name = ?',
        [dto.name],
      );
      if (existing.length > 0) {
        throw new ConflictException(
          `Country with name "${dto.name}" already exists`,
        );
      }

      const unique_id: string = randomBytes(16).toString('hex');
      const created_by: string = 'System';

      const [result] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO countries (unique_id, name, created_by)
         VALUES (?, ?, ?)`,
        [unique_id, dto.name, created_by],
      );

      return this.findOne(result.insertId);
    } catch (err) {
      if (err instanceof ConflictException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // GET /countries
  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<Country>> {
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
        `SELECT COUNT(*) AS total FROM countries ${whereClause}`,
        params,
      );

      const total = countRow['total'] as number;

      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT * FROM countries ${whereClause}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );

      return {
        data: rows as Country[],
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

  // GET /countries/:id
  async findOne(id: number): Promise<Country> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM countries WHERE id = ?',
        [id],
      );
      if (!rows.length)
        throw new NotFoundException(`Country with id ${id} not found`);
      return rows[0] as Country;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // GET /countries/unique/:uniqueId
  async findByUniqueId(uniqueId: string): Promise<Country> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM countries WHERE unique_id = ?',
        [uniqueId],
      );
      if (!rows.length) {
        throw new NotFoundException(
          `Country with unique_id "${uniqueId}" not found`,
        );
      }
      return rows[0] as Country;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // PATCH /countries/:id
  async update(id: number, dto: UpdateCountryDto): Promise<Country> {
    const conn = await this.pool.getConnection();
    try {
      const [findCountry] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM countries WHERE id = ?',
        [id],
      );
      if (!findCountry.length) {
        throw new NotFoundException(`Country with id ${id} not found`);
      }

      const fields = (Object.keys(dto) as (keyof UpdateCountryDto)[]).filter(
        (f) => dto[f] !== undefined,
      );
      if (!fields.length) return this.findOne(id);

      const setClauses = fields.map((f) => `${f} = ?`).join(', ');
      const values = fields.map((f) => dto[f]);

      await conn.execute(`UPDATE countries SET ${setClauses} WHERE id = ?`, [
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

  // DELETE /countries/:id
  async remove(id: number): Promise<{ message: string }> {
    const conn = await this.pool.getConnection();
    try {
      const [findCountry] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM countries WHERE id = ?',
        [id],
      );
      if (!findCountry.length) {
        throw new NotFoundException(`Country with id ${id} not found`);
      }

      await conn.execute('DELETE FROM countries WHERE id = ?', [id]);

      return { message: `Country ${id} deleted successfully` };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }
}
