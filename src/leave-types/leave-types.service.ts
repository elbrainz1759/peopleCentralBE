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
import { RequestUser } from 'src/common/interfaces/request-user.interface';

export interface LeaveType {
  id: number;
  unique_id: string;
  name: string;
  description: string;
  country: string;
  require_document: 'Yes' | 'No';
  trigger_value: number;
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
export class LeaveTypesService {
  constructor(@Inject('MYSQL_POOL') private readonly pool: mysql.Pool) {}

  async create(dto: CreateLeaveTypeDto, user: RequestUser): Promise<LeaveType> {
    const conn = await this.pool.getConnection();
    try {
      const [existing] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM leave_types WHERE name = ?',
        [dto.name],
      );
      if (existing.length > 0) {
        //check if status is Deleted, change status to Active and update the leave type
        if (existing[0].status === 'Deleted') {
          await conn.execute(
            'UPDATE leave_types SET name = ?, description = ?, country = ?, require_document = ?, trigger_value = ?, status = "Active" WHERE name = ?',
            [
              dto.name,
              dto.description,
              dto.country,
              dto.requireDocument,
              dto.trigger,
              dto.name,
            ],
          );
          return this.findOne(existing[0].unique_id as string);
        } else {
          throw new ConflictException(
            `Leave type with name "${dto.name}" already exists`,
          );
        }
      }

      const unique_id = randomBytes(16).toString('hex');
      const created_by = user.email;
      const require_document = dto.requireDocument ?? 'No';
      const trigger_value = dto.trigger ?? 0;

      await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO leave_types
           (unique_id, name, description, country, require_document, trigger_value, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          unique_id,
          dto.name,
          dto.description,
          dto.country,
          require_document,
          trigger_value,
          created_by,
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
        `SELECT * FROM leave_types ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );

      return {
        data: rows as LeaveType[],
        meta: { total, page, limit, last_page: Math.ceil(total / limit) },
      };
    } catch (err) {
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  async findOne(id: string): Promise<LeaveType> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM leave_types WHERE unique_id = ?',
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

  async update(id: string, dto: UpdateLeaveTypeDto): Promise<LeaveType> {
    const conn = await this.pool.getConnection();
    try {
      const [findLeaveType] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM leave_types WHERE unique_id = ?',
        [id],
      );
      if (!findLeaveType.length) {
        throw new NotFoundException(`Leave type with id ${id} not found`);
      }

      const fieldMap: Record<string, string> = {
        name: 'name',
        description: 'description',
        country: 'country',
        requireDocument: 'require_document',
        trigger: 'trigger_value',
      };

      const dtoKeys = (Object.keys(dto) as (keyof UpdateLeaveTypeDto)[]).filter(
        (k) => dto[k] !== undefined,
      );
      if (!dtoKeys.length) return this.findOne(id);

      const setClauses = dtoKeys.map((k) => `${fieldMap[k]} = ?`).join(', ');
      const values = dtoKeys.map((k) => dto[k]);

      await conn.execute(
        `UPDATE leave_types SET ${setClauses} WHERE unique_id = ?`,
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

  async remove(id: string): Promise<{ message: string }> {
    const conn = await this.pool.getConnection();
    try {
      const [findLeaveType] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM leave_types WHERE unique_id = ?',
        [id],
      );
      if (!findLeaveType.length) {
        throw new NotFoundException(`Leave type with id ${id} not found`);
      }

      await conn.execute(
        'UPDATE leave_types SET status="Deleted" WHERE unique_id = ?',
        [id],
      );
      return { message: `Leave type ${id} deleted successfully` };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }
}
