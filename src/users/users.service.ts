import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as mysql from 'mysql2/promise';
/** Update payload - validated by UpdateUserDto in controller. */
interface UpdateUserPayload {
  role?: string;
  password?: string;
}

export interface UserRow extends mysql.RowDataPacket {
  id: number;
  unique_id: string;
  email: string;
  role: string;
  first_name?: string | null;
  last_name?: string | null;
  staff_id?: number | null;
  designation?: string | null;
  department?: string | null;
  location?: string | null;
}

@Injectable()
export class UsersService {
  constructor(@Inject('MYSQL_POOL') private readonly pool: mysql.Pool) {}

  // GET ALL USERS
  async findAll() {
    const [rows] = await this.pool.query<UserRow[]>(
      `SELECT 
        u.id,
        u.passChanged,
        u.unique_id,
        u.email,
        u.role,
        e.first_name,
        e.last_name,
        e.staff_id,
        e.designation,
        e.department,
        e.location
      FROM users u
      LEFT JOIN employee e ON e.email = u.email
      ORDER BY u.id DESC`,
    );
    return rows;
  }

  // GET ONE USER
  async findOne(unique_id: string) {
    const [rows] = await this.pool.query<UserRow[]>(
      `SELECT 
        u.id,
        u.passChanged,
        u.unique_id,
        u.email,
        u.role,
        e.first_name,
        e.last_name,
        e.staff_id,
        e.designation,
        e.department,
        e.location
      FROM users u
      LEFT JOIN employee e ON e.email = u.email
      WHERE u.unique_id = ?`,
      [unique_id],
    );

    if (rows.length === 0) {
      throw new NotFoundException('User not found');
    }

    return rows[0];
  }

  // UPDATE USER (role or password)
  async update(unique_id: string, dto: UpdateUserPayload) {
    const [rows] = await this.pool.query<UserRow[]>(
      'SELECT id FROM users WHERE unique_id = ?',
      [unique_id],
    );

    if (rows.length === 0) {
      throw new NotFoundException('User not found');
    }

    const role: string | undefined = dto.role;
    const password: string | undefined = dto.password;

    const fields: string[] = [];
    const values: (string | number)[] = [];

    if (role !== undefined) {
      // ← role query is now inside the guard
      const [validRoles] = await this.pool.query<[]>(
        'SELECT name FROM roles WHERE name = ?',
        [role],
      );
      if (validRoles.length === 0) {
        throw new BadRequestException('Invalid role specified');
      }
      fields.push('role = ?');
      values.push(role);
    }

    if (password !== undefined) {
      const hashed = await bcrypt.hash(password, 10);
      fields.push('password = ?');
      values.push(hashed);
    }

    if (fields.length === 0) {
      throw new BadRequestException('No valid fields to update');
    }

    values.push(unique_id);

    await this.pool.query<mysql.ResultSetHeader>(
      `UPDATE users SET ${fields.join(', ')} WHERE unique_id = ?`,
      values,
    );

    return { message: 'User updated successfully' };
  }

  // DELETE USER
  async remove(unique_id: string) {
    const [rows] = await this.pool.query<UserRow[]>(
      'SELECT id FROM users WHERE unique_id = ?',
      [unique_id],
    );

    if (rows.length === 0) {
      throw new NotFoundException('User not found');
    }

    //soft delete: set status to 'Deleted' and remove role and password
    await this.pool.query<mysql.ResultSetHeader>(
      'UPDATE users SET role = NULL, password = NULL, status = "Deleted" WHERE unique_id = ?',
      [unique_id],
    );

    return { message: 'User deleted successfully' };
  }
}
