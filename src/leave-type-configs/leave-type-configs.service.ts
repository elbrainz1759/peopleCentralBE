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
import { RequestUser } from 'src/common/interfaces/request-user.interface';

// ─── Interface ────────────────────────────────────────────────────────────────

export interface LeaveTypeConfig {
  id: number;
  unique_id: string;
  leave_type_id: string; // unique_id FK to leave_types
  leave_type_name?: string; // joined
  country: string; // unique_id FK to countries
  annual_hours: number;
  monthly_accrual_hours: number | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  period: 'Monthly' | 'Annually';
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class LeaveTypeConfigsService {
  constructor(@Inject('MYSQL_POOL') private readonly pool: mysql.Pool) {}

  // ---------------------------------------------------------------------------
  // POST /leave-type-configs
  // ---------------------------------------------------------------------------
  async create(
    dto: CreateLeaveTypeConfigDto,
    user: RequestUser,
  ): Promise<LeaveTypeConfig> {
    const conn = await this.pool.getConnection();
    try {
      // Verify leave type exists by unique_id
      const [ltRows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM leave_types WHERE unique_id = ?',
        [dto.leaveTypeId],
      );
      if (!ltRows.length) {
        throw new BadRequestException(
          `Leave type with unique_id "${dto.leaveTypeId}" not found`,
        );
      }

      // Verify country exists
      if (!dto.countryId) {
        throw new BadRequestException('Country is required');
      }
      const [countryRows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT unique_id FROM countries WHERE unique_id = ?',
        [dto.countryId],
      );
      if (!countryRows.length) {
        throw new BadRequestException(`Country "${dto.countryId}" not found`);
      }

      // Friendly conflict check before hitting the DB UNIQUE key
      const [existing] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT id FROM leave_type_country_config
         WHERE leave_type_id = ? AND country = ?`,
        [dto.leaveTypeId, dto.countryId],
      );
      if (existing.length) {
        //if status is Deleted, change status to Active and update the config
        if (existing[0].status === 'Deleted') {
          await conn.query<mysql.ResultSetHeader>(
            `UPDATE leave_type_country_config
             SET status = 'Active', annual_hours = ?, monthly_accrual_hours = ?
             WHERE leave_type_id = ? AND country = ?`,
            [
              dto.annualHours,
              dto.monthlyAccrualHours ?? null,
              dto.leaveTypeId,
              dto.countryId,
            ],
          );
          return this.findOne(existing[0].unique_id as string);
        } else {
          throw new ConflictException(
            `A config already exists for leave type "${dto.leaveTypeId}" in country "${dto.countryId}"`,
          );
        }
      }

      const unique_id = randomBytes(16).toString('hex');
      const createdBy = user.email || 'System';

      await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO leave_type_country_config
           (unique_id, leave_type_id, country, annual_hours, monthly_accrual_hours, created_by, status, period)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          unique_id,
          dto.leaveTypeId,
          dto.countryId,
          dto.annualHours,
          dto.monthlyAccrualHours ?? null,
          createdBy,
          'Active',
          dto.period,
        ],
      );

      return this.findOne(unique_id);
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
         LEFT JOIN leave_types lt ON lt.unique_id = ltcc.leave_type_id
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
  // FIX: was joining ON lt.id = ltcc.leave_type_id (numeric PK vs string FK).
  //      Corrected to lt.unique_id = ltcc.leave_type_id.
  // ---------------------------------------------------------------------------
  async findByLeaveType(leaveTypeId: string): Promise<LeaveTypeConfig[]> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT ltcc.*, lt.name AS leave_type_name
         FROM leave_type_country_config ltcc
         LEFT JOIN leave_types lt ON lt.unique_id = ltcc.leave_type_id
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
  // FIX: same join bug corrected here too.
  // ---------------------------------------------------------------------------
  async findByCountry(country: string): Promise<LeaveTypeConfig[]> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT ltcc.*, lt.name AS leave_type_name
         FROM leave_type_country_config ltcc
         LEFT JOIN leave_types lt ON lt.unique_id = ltcc.leave_type_id
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
  // FIX: same join bug corrected here too.
  // ---------------------------------------------------------------------------
  async findOne(id: string): Promise<LeaveTypeConfig> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT ltcc.*, lt.name AS leave_type_name
         FROM leave_type_country_config ltcc
         LEFT JOIN leave_types lt ON lt.unique_id = ltcc.leave_type_id
         WHERE ltcc.unique_id = ?`,
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
  // FIX: current.leave_type_id was typed as number but is actually a string
  //      (unique_id). Fixed type annotation + conflict check.
  // FIX: updated_at = NOW() now always written — previously relied on a trigger.
  // ---------------------------------------------------------------------------
  async update(
    id: string,
    dto: UpdateLeaveTypeConfigDto,
  ): Promise<LeaveTypeConfig> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM leave_type_country_config WHERE unique_id = ?',
        [id],
      );
      if (!rows.length) {
        throw new NotFoundException(
          `Leave type config with id ${id} not found`,
        );
      }

      // leave_type_id is a string (unique_id), not a numeric PK
      const current = rows[0] as { country: string; leave_type_id: string };

      const newCountry = dto.countryId ?? current.country;
      const newLeaveTypeId = dto.leaveTypeId ?? current.leave_type_id;

      // If either FK is changing, verify the new combination isn't already taken
      if (dto.countryId !== undefined || dto.leaveTypeId !== undefined) {
        const [conflict] = await conn.query<mysql.RowDataPacket[]>(
          `SELECT unique_id FROM leave_type_country_config
           WHERE leave_type_id = ? AND country = ? AND unique_id != ?`,
          [newLeaveTypeId, newCountry, id],
        );
        if (conflict.length) {
          throw new ConflictException(
            `A config already exists for leave type "${newLeaveTypeId}" in country "${newCountry}"`,
          );
        }
      }

      const fields: string[] = [];
      const values: (string | number | null)[] = [];

      if (dto.leaveTypeId !== undefined) {
        fields.push('leave_type_id = ?');
        values.push(dto.leaveTypeId);
      }
      if (dto.countryId !== undefined) {
        fields.push('country = ?');
        values.push(dto.countryId);
      }
      if (dto.annualHours !== undefined) {
        fields.push('annual_hours = ?');
        values.push(dto.annualHours);
      }
      if (dto.monthlyAccrualHours !== undefined) {
        fields.push('monthly_accrual_hours = ?');
        values.push(dto.monthlyAccrualHours); // caller passes null to clear accrual
      }
      if (dto.period !== undefined) {
        fields.push('period = ?');
        values.push(dto.period);
      }

      if (!fields.length) {
        throw new BadRequestException('No fields provided to update');
      }
      //map to database column names
      const columnMap: { [key: string]: string } = {
        leaveTypeId: 'leave_type_id',
        country: 'country',
        annualHours: 'annual_hours',
        monthlyAccrualHours: 'monthly_accrual_hours',
        period: 'period',
      };
      const mappedFields = fields.map((field) => columnMap[field] || field);

      // Always bump updated_at explicitly — do not rely on a DB trigger
      mappedFields.push('updated_at = NOW()');

      await conn.query(
        `UPDATE leave_type_country_config SET ${mappedFields.join(', ')} WHERE unique_id = ?`,
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
  // DELETE /leave-type-configs/:uniqueId
  // ---------------------------------------------------------------------------
  async remove(uniqueId: string): Promise<{ deleted: true; id: string }> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT unique_id FROM leave_type_country_config WHERE unique_id = ?',
        [uniqueId],
      );
      if (!rows.length) {
        throw new NotFoundException(
          `Leave type config with unique_id "${uniqueId}" not found`,
        );
      }

      await conn.query(
        'UPDATE leave_type_country_config SET status = "Deleted" WHERE unique_id = ?',
        [uniqueId],
      );

      return { deleted: true, id: uniqueId };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      conn.release();
    }
  }
}
