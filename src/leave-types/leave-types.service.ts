import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  Inject,
} from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import { CreateLeaveTypeDto } from './dto/create-leave-type.dto';
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { randomBytes } from 'crypto';

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface LeaveType {
  id: number;
  unique_id: string;
  name: string;
  description: string;
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
export class LeaveTypesService {
  constructor(@Inject('MYSQL_POOL') private readonly pool: mysql.Pool) {}

  // POST /leave-types
  async create(dto: CreateLeaveTypeDto): Promise<LeaveType> {
    const conn = await this.pool.getConnection();
    try {
      const [existing] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM leave_types WHERE name = ?',
        [dto.name],
      );
      if (existing.length > 0) {
        throw new ConflictException(
          `Leave type with name "${dto.name}" already exists`,
        );
      }

      const unique_id: string = randomBytes(16).toString('hex');
      const created_by: string = 'System';

      const [result] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO leave_types (unique_id, name, description, country, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [unique_id, dto.name, dto.description, dto.country, created_by],
      );

      return this.findOne(result.insertId);
    } catch (err) {
      if (err instanceof ConflictException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // GET /leave-types
  async findAll(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<LeaveType>> {
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
        `SELECT COUNT(*) AS total FROM leave_types ${whereClause}`,
        params,
      );

      const total = countRow['total'] as number;

      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT * FROM leave_types ${whereClause}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );

      return {
        data: rows as LeaveType[],
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

  // GET /leave-types/:id
  async findOne(id: number): Promise<LeaveType> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM leave_types WHERE id = ?',
        [id],
      );
      if (!rows.length)
        throw new NotFoundException(`Leave type with id ${id} not found`);
      return rows[0] as LeaveType;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // GET /leave-types/unique/:uniqueId
  async findByUniqueId(uniqueId: string): Promise<LeaveType> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM leave_types WHERE unique_id = ?',
        [uniqueId],
      );
      if (!rows.length) {
        throw new NotFoundException(
          `Leave type with unique_id "${uniqueId}" not found`,
        );
      }
      return rows[0] as LeaveType;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // PATCH /leave-types/:id
  async update(id: number, dto: UpdateLeaveTypeDto): Promise<LeaveType> {
    const conn = await this.pool.getConnection();
    try {
      const [findLeaveType] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM leave_types WHERE id = ?',
        [id],
      );
      if (!findLeaveType.length) {
        throw new NotFoundException(`Leave type with id ${id} not found`);
      }

      const fields = (Object.keys(dto) as (keyof UpdateLeaveTypeDto)[]).filter(
        (f) => dto[f] !== undefined,
      );
      if (!fields.length) return this.findOne(id);

      const setClauses = fields.map((f) => `${f} = ?`).join(', ');
      const values = fields.map((f) => dto[f]);

      await conn.execute(`UPDATE leave_types SET ${setClauses} WHERE id = ?`, [
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

  // DELETE /leave-types/:id
  async remove(id: number): Promise<{ message: string }> {
    const conn = await this.pool.getConnection();
    try {
      const [findLeaveType] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM leave_types WHERE id = ?',
        [id],
      );
      if (!findLeaveType.length) {
        throw new NotFoundException(`Leave type with id ${id} not found`);
      }

      await conn.execute('DELETE FROM leave_types WHERE id = ?', [id]);

      return { message: `Leave type ${id} deleted successfully` };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }
}
