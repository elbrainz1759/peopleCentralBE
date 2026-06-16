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
import { RequestUser } from 'src/common/interfaces/request-user.interface';

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

@Injectable()
export class CountriesService {
  constructor(@Inject('MYSQL_POOL') private readonly pool: mysql.Pool) {}

  async create(dto: CreateCountryDto, user: RequestUser): Promise<Country> {
    const conn = await this.pool.getConnection();
    try {
      const normalizedName = dto.name.trim(); // ← trim input

      const [existing] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT unique_id FROM countries WHERE LOWER(TRIM(name)) = LOWER(?)',
        [normalizedName],
      );

      if (existing.length > 0) {
        await conn.execute(
          'UPDATE countries SET status = "Active" WHERE unique_id = ?',
          [existing[0].unique_id],
        );
        return this.findOne(existing[0].unique_id as string);
      }

      const unique_id: string = randomBytes(16).toString('hex');

      await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO countries (unique_id, name, created_by, status)
       VALUES (?, ?, ?, ?)`,
        [unique_id, normalizedName, user.email, 'Active'], // ← use normalizedName
      );

      return this.findOne(unique_id);
    } catch (err) {
      if (err instanceof ConflictException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<Country>> {
    const conn = await this.pool.getConnection();
    try {
      const page = query.page ?? 1;
      const limit = query.limit ?? 10;
      const offset = (page - 1) * limit;

      const params: (string | number)[] = [];
      let whereClause = 'WHERE status = "Active"';

      if (query.search) {
        whereClause += ' AND (name LIKE ? OR unique_id LIKE ?)';
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
  async findOne(unique_id: string): Promise<Country> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM countries WHERE unique_id = ?',
        [unique_id],
      );
      if (!rows.length)
        throw new NotFoundException(`Country with id ${unique_id} not found`);
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
  async update(uniqueId: string, dto: UpdateCountryDto): Promise<Country> {
    const conn = await this.pool.getConnection();
    try {
      const [findCountry] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT unique_id FROM countries WHERE unique_id = ?',
        [uniqueId],
      );
      if (!findCountry.length) {
        throw new NotFoundException(
          `Country with unique_id ${uniqueId} not found`,
        );
      }

      const fields = (Object.keys(dto) as (keyof UpdateCountryDto)[]).filter(
        (f) => dto[f] !== undefined,
      );
      if (!fields.length) return this.findOne(uniqueId);

      const setClauses = fields.map((f) => `${f} = ?`).join(', ');
      const values = fields.map((f) => dto[f]);

      await conn.execute(
        `UPDATE countries SET ${setClauses} WHERE unique_id = ?`,
        [...values, uniqueId],
      );

      return this.findOne(uniqueId);
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // DELETE /countries/:id
  async remove(unique_id: string): Promise<{ message: string }> {
    const conn = await this.pool.getConnection();
    try {
      const [findCountry] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT unique_id FROM countries WHERE unique_id = ?',
        [unique_id],
      );
      if (!findCountry.length) {
        throw new NotFoundException(
          `Country with unique_id ${unique_id} not found`,
        );
      }

      await conn.execute(
        'UPDATE countries SET status = "Deleted" WHERE unique_id = ?',
        [unique_id],
      );

      return { message: `Country ${unique_id} deleted successfully` };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }
}
