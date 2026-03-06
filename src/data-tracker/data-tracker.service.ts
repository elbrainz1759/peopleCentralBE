import {
  Injectable,
  Inject,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import { randomBytes } from 'crypto';
import { CreateDataTrackerDto } from './dto/create-data-tracker.dto';
import { UpdateDataTrackerDto } from './dto/update-data-tracker.dto';
import { FindDataTrackerDto } from './dto/find-data-tracker.dto';

export interface DataTrackerRow extends mysql.RowDataPacket {
  id: number;
  unique_id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  recipients?: string[];
  notification_periods?: number[];
}

interface CountResult extends mysql.RowDataPacket {
  total: number;
}

interface RecipientRow extends mysql.RowDataPacket {
  email: string;
}

interface PeriodRow extends mysql.RowDataPacket {
  days_before: number;
}

export interface DueNotificationRow extends mysql.RowDataPacket {
  unique_id: string;
  title: string;
  end_date: string;
  days_before: number;
  recipient_emails: string[];
}

@Injectable()
export class DataTrackerService {
  constructor(@Inject('MYSQL_POOL') private readonly pool: mysql.Pool) {}

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async insertRecipients(
    conn: mysql.PoolConnection,
    tracker_id: string,
    recipients: string[],
  ) {
    if (!recipients?.length) return;
    const values = recipients.map((email) => [tracker_id, email]);
    await conn.query(
      `INSERT INTO data_tracker_recipients (tracker_id, email) VALUES ?`,
      [values],
    );
  }

  private async insertPeriods(
    conn: mysql.PoolConnection,
    tracker_id: string,
    periods: number[],
  ) {
    if (!periods?.length) return;
    const values = periods.map((days) => [tracker_id, days]);
    await conn.query(
      `INSERT INTO data_tracker_notification_periods (tracker_id, days_before) VALUES ?`,
      [values],
    );
  }

  private async attachRelations(
    tracker: DataTrackerRow,
  ): Promise<DataTrackerRow> {
    const [recipientRows] = await this.pool.query<RecipientRow[]>(
      `SELECT email FROM data_tracker_recipients WHERE tracker_id = ?`,
      [tracker.unique_id],
    );
    const [periodRows] = await this.pool.query<PeriodRow[]>(
      `SELECT days_before FROM data_tracker_notification_periods WHERE tracker_id = ?`,
      [tracker.unique_id],
    );

    return {
      ...tracker,
      recipients: recipientRows.map((r) => r.email),
      notification_periods: periodRows.map((p) => p.days_before),
    };
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async create(dto: CreateDataTrackerDto) {
    const unique_id = randomBytes(16).toString('hex');
    const conn = await this.pool.getConnection();

    try {
      await conn.beginTransaction();

      await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO data_tracker (unique_id, title, description, start_date, end_date, created_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
        [
          unique_id,
          dto.title,
          dto.description ?? null,
          dto.start_date,
          dto.end_date,
          'System',
        ],
      );

      await this.insertRecipients(conn, unique_id, dto.recipients);
      await this.insertPeriods(conn, unique_id, dto.notification_periods);

      await conn.commit();
      return this.findByUniqueId(unique_id);
    } catch (error) {
      await conn.rollback();
      console.error('Create data tracker error:', error);
      throw new InternalServerErrorException('Failed to create data tracker');
    } finally {
      conn.release();
    }
  }

  async findAll(query?: FindDataTrackerDto) {
    const { title, end_date, page = 1, limit = 10 } = query ?? {};
    const offset = (page - 1) * limit;

    let baseSql = `FROM data_tracker WHERE 1=1`;
    const params: (string | number)[] = [];

    if (title) {
      baseSql += ` AND title LIKE ?`;
      params.push(`%${title}%`);
    }
    if (end_date) {
      baseSql += ` AND end_date = ?`;
      params.push(end_date);
    }

    const [[{ total }]] = await this.pool.query<CountResult[]>(
      `SELECT COUNT(*) AS total ${baseSql}`,
      params,
    );

    const [rows] = await this.pool.query<DataTrackerRow[]>(
      `SELECT * ${baseSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    // Attach recipients + periods to each row
    const data = await Promise.all(rows.map((r) => this.attachRelations(r)));

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findByUniqueId(unique_id: string) {
    const [rows] = await this.pool.query<DataTrackerRow[]>(
      `SELECT * FROM data_tracker WHERE unique_id = ?`,
      [unique_id],
    );

    if (!rows.length) {
      throw new NotFoundException(
        `Data tracker with ID ${unique_id} not found`,
      );
    }

    return this.attachRelations(rows[0]);
  }

  async update(unique_id: string, dto: UpdateDataTrackerDto) {
    await this.findByUniqueId(unique_id); // ensure exists

    const conn = await this.pool.getConnection();

    try {
      await conn.beginTransaction();

      // Build partial update
      const fieldMap: Record<string, any> = {
        title: dto.title,
        description: dto.description,
        start_date: dto.start_date,
        end_date: dto.end_date,
      };

      const fields: string[] = [];
      const values: any[] = [];

      for (const [col, val] of Object.entries(fieldMap)) {
        if (val !== undefined) {
          fields.push(`${col} = ?`);
          values.push(val);
        }
      }

      if (fields.length) {
        values.push(unique_id);
        await conn.query(
          `UPDATE data_tracker SET ${fields.join(', ')} WHERE unique_id = ?`,
          values,
        );
      }

      // Replace recipients if provided
      if (dto.recipients !== undefined) {
        await conn.query(
          `DELETE FROM data_tracker_recipients WHERE tracker_id = ?`,
          [unique_id],
        );
        await this.insertRecipients(conn, unique_id, dto.recipients);
      }

      // Replace periods if provided
      if (dto.notification_periods !== undefined) {
        await conn.query(
          `DELETE FROM data_tracker_notification_periods WHERE tracker_id = ?`,
          [unique_id],
        );
        await this.insertPeriods(conn, unique_id, dto.notification_periods);
      }

      await conn.commit();
      return this.findByUniqueId(unique_id);
    } catch (error) {
      await conn.rollback();
      console.error('Update data tracker error:', error);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Failed to update data tracker');
    } finally {
      conn.release();
    }
  }

  async remove(unique_id: string) {
    await this.findByUniqueId(unique_id); // ensure exists

    // CASCADE on FK will clean up recipients, periods, and sent log
    await this.pool.query(`DELETE FROM data_tracker WHERE unique_id = ?`, [
      unique_id,
    ]);

    return { message: `Data tracker ${unique_id} successfully deleted` };
  }

  // ─── Cron / Notification ──────────────────────────────────────────────────

  async getDueNotifications(): Promise<DueNotificationRow[]> {
    const [rows] = await this.pool.query<DueNotificationRow[]>(`
      SELECT
        dt.unique_id,
        dt.title,
        dt.end_date,
        np.days_before,
        GROUP_CONCAT(r.email) AS recipient_emails
      FROM data_tracker dt
      JOIN data_tracker_notification_periods np ON np.tracker_id = dt.unique_id
      JOIN data_tracker_recipients r ON r.tracker_id = dt.unique_id
      LEFT JOIN data_tracker_notifications_sent ns
        ON ns.tracker_id = dt.unique_id AND ns.days_before = np.days_before
      WHERE
        DATE(dt.end_date) - INTERVAL np.days_before DAY = CURDATE()
        AND ns.id IS NULL
      GROUP BY dt.unique_id, np.days_before
    `);

    return rows.map((r) => ({
      ...r,
      recipient_emails: r.recipient_emails
        ? String(r.recipient_emails).split(',')
        : [],
    }));
  }

  async markNotificationSent(tracker_id: string, days_before: number) {
    await this.pool.query(
      `INSERT IGNORE INTO data_tracker_notifications_sent (tracker_id, days_before) VALUES (?, ?)`,
      [tracker_id, days_before],
    );
  }
}
