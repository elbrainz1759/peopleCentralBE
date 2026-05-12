import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import { randomBytes } from 'crypto';
import { CreateLeaveTypeConfigDto } from './dto/create-leave-type-config.dto';
import { UpdateLeaveTypeConfigDto } from './dto/update-leave-type-config.dto';

export interface LeaveTypeConfig {
  id: number;
  unique_id: string;
  leave_type_id: string;
  leave_type_name?: string;
  country: string;
  annual_hours: number;
  monthly_accrual_hours: number | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class LeaveTypeConfigsService {
  constructor(@Inject('MYSQL_POOL') private readonly pool: mysql.Pool) {}

  // ---------------------------------------------------------------------------
  // POST /leave-type-configs
  // ---------------------------------------------------------------------------
  async create(dto: CreateLeaveTypeConfigDto): Promise<LeaveTypeConfig> {
    const conn = await this.pool.getConnection();

    try {
      // Verify leave type exists
      const [ltRows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM leave_types WHERE unique_id = ?',
        [dto.leaveTypeId],
      );
      if (!ltRows.length) {
        throw new BadRequestException(
          `Leave type with unique_id ${dto.leaveTypeId} not found`,
        );
      }

      // Enforce unique constraint with a friendly error before hitting the DB key
      const [existing] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM leave_type_country_config WHERE leave_type_id = ? AND country = ?',
        [dto.leaveTypeId, dto.country],
      );
      if (existing.length) {
        throw new ConflictException(
          `A config already exists for leave type ${dto.leaveTypeId} in ${dto.country}`,
        );
      }

      const unique_id = randomBytes(16).toString('hex');

      const [result] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO leave_type_country_config
           (unique_id, leave_type_id, country, annual_hours, monthly_accrual_hours)
         VALUES (?, ?, ?, ?, ?)`,
        [
          unique_id,
          dto.leaveTypeId,
          dto.country,
          dto.annualHours,
          dto.monthlyAccrualHours ?? null,
        ],
      );

      return this.findOne(result.insertId);
    } catch (err) {
      if (
        err instanceof BadRequestException ||
        err instanceof ConflictException
      )
        throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // ---------------------------------------------------------------------------
  // GET /leave-type-configs
  // ---------------------------------------------------------------------------
  async findAll(): Promise<LeaveTypeConfig[]> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT ltcc.*, lt.name AS leave_type_name
         FROM leave_type_country_config ltcc
         LEFT JOIN leave_types lt ON lt.id = ltcc.leave_type_id
         ORDER BY lt.name ASC, ltcc.country ASC`,
      );
      return rows as LeaveTypeConfig[];
    } catch (err) {
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // ---------------------------------------------------------------------------
  // GET /leave-type-configs/leave-type/:leaveTypeId
  // ---------------------------------------------------------------------------
  async findByLeaveType(leaveTypeId: string): Promise<LeaveTypeConfig[]> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT ltcc.*, lt.name AS leave_type_name
         FROM leave_type_country_config ltcc
         LEFT JOIN leave_types lt ON lt.id = ltcc.leave_type_id
         WHERE ltcc.leave_type_id = ?
         ORDER BY ltcc.country ASC`,
        [leaveTypeId],
      );
      return rows as LeaveTypeConfig[];
    } catch (err) {
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // ---------------------------------------------------------------------------
  // GET /leave-type-configs/country/:country
  // ---------------------------------------------------------------------------
  async findByCountry(country: string): Promise<LeaveTypeConfig[]> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT ltcc.*, lt.name AS leave_type_name
         FROM leave_type_country_config ltcc
         LEFT JOIN leave_types lt ON lt.id = ltcc.leave_type_id
         WHERE ltcc.country = ?
         ORDER BY lt.name ASC`,
        [country],
      );
      return rows as LeaveTypeConfig[];
    } catch (err) {
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // ---------------------------------------------------------------------------
  // GET /leave-type-configs/:id  (internal — used by create/update to return result)
  // ---------------------------------------------------------------------------
  async findOne(id: number): Promise<LeaveTypeConfig> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT ltcc.*, lt.name AS leave_type_name
         FROM leave_type_country_config ltcc
         LEFT JOIN leave_types lt ON lt.id = ltcc.leave_type_id
         WHERE ltcc.id = ?`,
        [id],
      );
      if (!rows.length) {
        throw new NotFoundException(
          `Leave type config with id ${id} not found`,
        );
      }
      return rows[0] as LeaveTypeConfig;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // ---------------------------------------------------------------------------
  // PATCH /leave-type-configs/:id
  // All fields are optional — only provided fields are updated.
  // ---------------------------------------------------------------------------
  async update(
    id: number,
    dto: UpdateLeaveTypeConfigDto,
  ): Promise<LeaveTypeConfig> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM leave_type_country_config WHERE id = ?',
        [id],
      );
      if (!rows.length) {
        throw new NotFoundException(
          `Leave type config with id ${id} not found`,
        );
      }
      const current = rows[0] as { country: string; leave_type_id: number };

      // If country is changing, check the new combination isn't already taken
      const newCountry = dto.country ?? current.country;
      const newLeaveTypeId = dto.leaveTypeId ?? current.leave_type_id;

      if (dto.country || dto.leaveTypeId) {
        const [conflict] = await conn.query<mysql.RowDataPacket[]>(
          `SELECT id FROM leave_type_country_config
           WHERE leave_type_id = ? AND country = ? AND id != ?`,
          [newLeaveTypeId, newCountry, id],
        );
        if (conflict.length) {
          throw new ConflictException(
            `A config already exists for leave type ${newLeaveTypeId} in ${newCountry}`,
          );
        }
      }

      const fields: string[] = [];
      const values: (string | number | null)[] = [];

      if (dto.leaveTypeId !== undefined) {
        fields.push('leave_type_id = ?');
        values.push(dto.leaveTypeId);
      }
      if (dto.country !== undefined) {
        fields.push('country = ?');
        values.push(dto.country);
      }
      if (dto.annualHours !== undefined) {
        fields.push('annual_hours = ?');
        values.push(dto.annualHours);
      }
      if (dto.monthlyAccrualHours !== undefined) {
        fields.push('monthly_accrual_hours = ?');
        values.push(dto.monthlyAccrualHours); // caller passes null to clear it
      }

      if (!fields.length) {
        throw new BadRequestException('No fields provided to update');
      }

      await conn.query(
        `UPDATE leave_type_country_config SET ${fields.join(', ')} WHERE id = ?`,
        [...values, id],
      );

      return this.findOne(id);
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof ConflictException ||
        err instanceof BadRequestException
      )
        throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }

  // ---------------------------------------------------------------------------
  // DELETE /leave-type-configs/:id
  // ---------------------------------------------------------------------------
  async remove(id: string): Promise<{ deleted: true; id: string }> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT unique_id FROM leave_type_country_config WHERE unique_id = ?',
        [id],
      );
      if (!rows.length) {
        throw new NotFoundException(
          `Leave type config with unique_id ${id} not found`,
        );
      }

      await conn.query(
        'DELETE FROM leave_type_country_config WHERE unique_id = ?',
        [id],
      );

      return { deleted: true, id };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }
}
