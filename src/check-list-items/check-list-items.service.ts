import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  Inject,
} from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import { CreateCheckListItemDto } from './dto/create-check-list-item.dto';
import { UpdateCheckListItemDto } from './dto/update-check-list-item.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { randomBytes } from 'crypto';

export interface CheckListItem {
  id: number;
  unique_id: string;
  name: string;
  department: string;
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
export class CheckListItemsService {
  constructor(@Inject('MYSQL_POOL') private readonly pool: mysql.Pool) {}

  // POST /check-list-items
  async create(dto: CreateCheckListItemDto): Promise<CheckListItem> {
    const conn = await this.pool.getConnection();

    try {
      const [existing] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM check_list_items WHERE name = ? AND department = ?',
        [dto.name, dto.departmentId],
      );
      if (existing.length > 0) {
        throw new ConflictException(
          `Check list item with name "${dto.name}" already exists in this department`,
        );
      }

      // check department exists
      const [dept] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM departments WHERE unique_id = ?',
        [dto.departmentId],
      );
      if (dept.length === 0) {
        throw new NotFoundException(
          `Department with id "${dto.departmentId}" not found`,
        );
      }

      const unique_id: string = randomBytes(16).toString('hex');
      const created_by: string = 'System';

      const [result] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO check_list_items (unique_id, name, department, created_by)
         VALUES (?, ?, ?, ?)`,
        [unique_id, dto.name, dto.departmentId, created_by],
      );

      return this.findOne(result.insertId);
    } catch (err) {
      if (err instanceof ConflictException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // GET /check-list-items
  async findAll(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<CheckListItem>> {
    const conn = await this.pool.getConnection();
    try {
      const page = query.page ?? 1;
      const limit = query.limit ?? 10;
      const offset = (page - 1) * limit;

      const params: (string | number)[] = [];
      const conditions: string[] = [];

      if (query.name) {
        conditions.push('a.name LIKE ?');
        params.push(`%${query.name}%`);
      }

      if (query.departmentId) {
        conditions.push('a.department = ?');
        params.push(query.departmentId);
      }

      const whereClause = conditions.length
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

      const joinClause = `
      FROM check_list_items a
      LEFT JOIN departments d ON d.unique_id = a.department
    `;

      const [[countRow]] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT COUNT(*) AS total ${joinClause} ${whereClause}`,
        params,
      );

      const total = countRow['total'] as number;

      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT a.*, d.name AS department_name
       ${joinClause}
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );

      return {
        data: rows as CheckListItem[],
        meta: { total, page, limit, last_page: Math.ceil(total / limit) },
      };
    } catch (err) {
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // GET /check-list-items/:id
  async findOne(id: number): Promise<CheckListItem> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM check_list_items WHERE id = ?',
        [id],
      );
      if (!rows.length)
        throw new NotFoundException(`Check list item with id ${id} not found`);
      return rows[0] as CheckListItem;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // GET /check-list-items/unique/:uniqueId
  async findByUniqueId(uniqueId: string): Promise<CheckListItem> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM check_list_items WHERE unique_id = ?',
        [uniqueId],
      );
      if (!rows.length) {
        throw new NotFoundException(
          `Check list item with unique_id "${uniqueId}" not found`,
        );
      }
      return rows[0] as CheckListItem;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // PATCH /check-list-items/:id
  async update(
    id: number,
    dto: UpdateCheckListItemDto,
  ): Promise<CheckListItem> {
    const conn = await this.pool.getConnection();
    try {
      const [findItem] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM check_list_items WHERE id = ?',
        [id],
      );
      if (!findItem.length) {
        throw new NotFoundException(`Check list item with id ${id} not found`);
      }

      const fieldMap: Record<keyof UpdateCheckListItemDto, string> = {
        name: 'name',
        departmentId: 'department',
      };

      const fields = (
        Object.keys(dto) as (keyof UpdateCheckListItemDto)[]
      ).filter((f) => dto[f] !== undefined);
      if (!fields.length) return this.findOne(id);

      const setClauses = fields.map((f) => `${fieldMap[f]} = ?`).join(', ');
      const values = fields.map((f) => dto[f]);

      await conn.execute(
        `UPDATE check_list_items SET ${setClauses} WHERE id = ?`,
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

  // DELETE /check-list-items/:id
  async remove(id: number): Promise<{ message: string }> {
    const conn = await this.pool.getConnection();
    try {
      const [findItem] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM check_list_items WHERE id = ?',
        [id],
      );
      if (!findItem.length) {
        throw new NotFoundException(`Check list item with id ${id} not found`);
      }

      await conn.execute('DELETE FROM check_list_items WHERE id = ?', [id]);

      return { message: `Check list item ${id} deleted successfully` };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }
}
