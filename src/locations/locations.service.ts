import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  Inject,
} from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import { CreateLocationDto } from './dto/create-location.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface Location {
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
export class LocationsService {
  constructor(@Inject('MYSQL_POOL') private readonly pool: mysql.Pool) {}

  // POST /locations
  async create(dto: CreateLocationDto): Promise<Location> {
    const conn = await this.pool.getConnection();
    try {
      const [existing] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM locations WHERE unique_id = ?',
        [dto.unique_id],
      );
      if (existing.length > 0) {
        throw new ConflictException(
          `Location with unique_id "${dto.unique_id}" already exists`,
        );
      }

      const [result] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO locations (unique_id, name, created_by)
         VALUES (?, ?, ?)`,
        [dto.unique_id, dto.name, dto.created_by],
      );

      return this.findOne(result.insertId);
    } catch (err) {
      if (err instanceof ConflictException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // GET /locations
  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<Location>> {
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
        `SELECT COUNT(*) AS total FROM locations ${whereClause}`,
        params,
      );

      const total = countRow['total'] as number;

      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT * FROM locations ${whereClause}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );

      return {
        data: rows as Location[],
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

  // GET /locations/:id
  async findOne(id: number): Promise<Location> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM locations WHERE id = ?',
        [id],
      );
      if (!rows.length)
        throw new NotFoundException(`Location with id ${id} not found`);
      return rows[0] as Location;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // GET /locations/unique/:uniqueId
  async findByUniqueId(uniqueId: string): Promise<Location> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM locations WHERE unique_id = ?',
        [uniqueId],
      );
      if (!rows.length) {
        throw new NotFoundException(
          `Location with unique_id "${uniqueId}" not found`,
        );
      }
      return rows[0] as Location;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // PATCH /locations/:id
  async update(id: number, dto: UpdateLocationDto): Promise<Location> {
    const conn = await this.pool.getConnection();
    try {
      const [findLocation] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM locations WHERE id = ?',
        [id],
      );
      if (!findLocation.length) {
        throw new NotFoundException(`Location with id ${id} not found`);
      }

      const fields = (Object.keys(dto) as (keyof UpdateLocationDto)[]).filter(
        (f) => dto[f] !== undefined,
      );
      if (!fields.length) return this.findOne(id);

      const setClauses = fields.map((f) => `${f} = ?`).join(', ');
      const values = fields.map((f) => dto[f]);

      await conn.execute(`UPDATE locations SET ${setClauses} WHERE id = ?`, [
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

  // DELETE /locations/:id
  async remove(id: number): Promise<{ message: string }> {
    const conn = await this.pool.getConnection();
    try {
      const [findLocation] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM locations WHERE id = ?',
        [id],
      );
      if (!findLocation.length) {
        throw new NotFoundException(`Location with id ${id} not found`);
      }

      await conn.execute('DELETE FROM locations WHERE id = ?', [id]);

      return { message: `Location ${id} deleted successfully` };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }
}
