import * as mysql from 'mysql2/promise';
import { NotFoundException } from '@nestjs/common';

const ALLOWED_TABLES = new Set([
  'departments',
  'programs',
  'countries',
  'locations',
  'employee',
]);

export async function ensureExists(
  pool: mysql.Pool,
  table: string,
  id: string,
  name: string,
): Promise<void> {
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`Table "${table}" is not allowed in ensureExists`);
  }

  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT unique_id FROM ${table} WHERE unique_id = ?`,
    [id],
  );

  if (rows.length === 0) {
    throw new NotFoundException(`${name} ${id} not found`);
  }
}
