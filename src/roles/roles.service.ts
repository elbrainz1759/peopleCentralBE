import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  Inject,
} from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import { CreateRoleDto } from './dto/create-role.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { randomBytes } from 'crypto';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface Role {
  id: number;
  unique_id: string;
  name: string;
  description: string;
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
export class RolesService {
  constructor(@Inject('MYSQL_POOL') private readonly pool: mysql.Pool) {}

  // POST /roles
  async create(dto: CreateRoleDto, user: RequestUser): Promise<Role> {
    const conn = await this.pool.getConnection();
    try {
      const [existing] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM roles WHERE name = ?',
        [dto.name],
      );

      if (existing.length > 0) {
        throw new ConflictException(
          `Role with name "${dto.name}" already exists`,
        );
      }

      const unique_id: string = randomBytes(16).toString('hex');
      const created_by: string = user.email;

      const [result] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO roles (unique_id, name, description, created_by)
         VALUES (?, ?, ?, ?)`,
        [unique_id, dto.name, dto.description, created_by],
      );

      return this.findOne(result.insertId);
    } catch (err) {
      if (err instanceof ConflictException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // GET /roles
  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<Role>> {
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
        `SELECT COUNT(*) AS total FROM roles ${whereClause}`,
        params,
      );

      const total = countRow['total'] as number;

      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT * FROM roles ${whereClause}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );

      return {
        data: rows as Role[],
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

  // GET /roles/:id
  async findOne(id: number): Promise<Role> {
    const conn = await this.pool.getConnection();

    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM roles WHERE id = ?',
        [id],
      );

      if (!rows.length) {
        throw new NotFoundException(`Role with id ${id} not found`);
      }

      return rows[0] as Role;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // GET /roles/unique/:uniqueId
  async findByUniqueId(uniqueId: string): Promise<Role> {
    const conn = await this.pool.getConnection();

    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM roles WHERE unique_id = ?',
        [uniqueId],
      );

      if (!rows.length) {
        throw new NotFoundException(
          `Role with unique_id "${uniqueId}" not found`,
        );
      }

      return rows[0] as Role;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // PATCH /roles/:id
  async update(id: number, dto: UpdateRoleDto): Promise<Role> {
    const conn = await this.pool.getConnection();

    try {
      const [findRole] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM roles WHERE id = ?',
        [id],
      );

      if (!findRole.length) {
        throw new NotFoundException(`Role with id ${id} not found`);
      }

      const fields = (Object.keys(dto) as (keyof UpdateRoleDto)[]).filter(
        (f) => dto[f] !== undefined,
      );

      if (!fields.length) return this.findOne(id);

      const setClauses = fields.map((f) => `${f} = ?`).join(', ');
      const values = fields.map((f) => dto[f]);

      await conn.execute(`UPDATE roles SET ${setClauses} WHERE id = ?`, [
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

  // DELETE /roles/:id
  async remove(id: number): Promise<{ message: string }> {
    const conn = await this.pool.getConnection();

    try {
      const [findRole] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM roles WHERE id = ?',
        [id],
      );

      if (!findRole.length) {
        throw new NotFoundException(`Role with id ${id} not found`);
      }

      await conn.execute('DELETE FROM roles WHERE id = ?', [id]);

      return { message: `Role ${id} deleted successfully` };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }
}
