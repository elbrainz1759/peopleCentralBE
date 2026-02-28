import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  Inject,
} from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface Department {
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
export class DepartmentsService {
  constructor(@Inject('MYSQL_POOL') private readonly pool: mysql.Pool) {}

  // POST /departments
  async create(dto: CreateDepartmentDto): Promise<Department> {
    const conn = await this.pool.getConnection();
    try {
      const [existing] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM departments WHERE unique_id = ?',
        [dto.unique_id],
      );
      if (existing.length > 0) {
        throw new ConflictException(
          `Department with unique_id "${dto.unique_id}" already exists`,
        );
      }

      const [result] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO departments (unique_id, name, created_by)
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

  // GET /departments
  async findAll(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<Department>> {
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
        `SELECT COUNT(*) AS total FROM departments ${whereClause}`,
        params,
      );

      const total = countRow['total'] as number;

      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT * FROM departments ${whereClause}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );

      return {
        data: rows as Department[],
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

  // GET /departments/:id
  async findOne(id: number): Promise<Department> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM departments WHERE id = ?',
        [id],
      );
      if (!rows.length)
        throw new NotFoundException(`Department with id ${id} not found`);
      return rows[0] as Department;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // GET /departments/unique/:uniqueId
  async findByUniqueId(uniqueId: string): Promise<Department> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM departments WHERE unique_id = ?',
        [uniqueId],
      );
      if (!rows.length) {
        throw new NotFoundException(
          `Department with unique_id "${uniqueId}" not found`,
        );
      }
      return rows[0] as Department;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // PATCH /departments/:id
  async update(id: number, dto: UpdateDepartmentDto): Promise<Department> {
    const conn = await this.pool.getConnection();
    try {
      const [findDepartment] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM departments WHERE id = ?',
        [id],
      );
      if (!findDepartment.length) {
        throw new NotFoundException(`Department with id ${id} not found`);
      }

      const fields = (Object.keys(dto) as (keyof UpdateDepartmentDto)[]).filter(
        (f) => dto[f] !== undefined,
      );
      if (!fields.length) return this.findOne(id);

      const setClauses = fields.map((f) => `${f} = ?`).join(', ');
      const values = fields.map((f) => dto[f]);

      await conn.execute(`UPDATE departments SET ${setClauses} WHERE id = ?`, [
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

  // DELETE /departments/:id
  async remove(id: number): Promise<{ message: string }> {
    const conn = await this.pool.getConnection();
    try {
      const [findDepartment] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM departments WHERE id = ?',
        [id],
      );
      if (!findDepartment.length) {
        throw new NotFoundException(`Department with id ${id} not found`);
      }

      await conn.execute('DELETE FROM departments WHERE id = ?', [id]);

      return { message: `Department ${id} deleted successfully` };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }
}
