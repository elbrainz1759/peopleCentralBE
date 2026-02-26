import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { randomBytes } from 'crypto';

export interface EmployeeRow extends mysql.RowDataPacket {
  id: number;
  unique_id: string;
  first_name: string;
  last_name: string;
  staff_id: number;
  email: string;
  location: string;
  supervisor: string;
  program: string;
  created_by?: string;
  created_at: Date;
}

@Injectable()
export class EmployeeService {
  constructor(@Inject('MYSQL_POOL') private readonly pool: mysql.Pool) {}

  async create(createEmployeeDto: CreateEmployeeDto) {
    const {
      first_name,
      last_name,
      staff_id,
      email,
      location,
      supervisor,
      program,
    } = createEmployeeDto;

    const unique_id: string = randomBytes(16).toString('hex');

    const created_by: string = 'System';

    try {
      const [result] = await this.pool.query<mysql.ResultSetHeader>(
        `INSERT INTO employee (unique_id, first_name, last_name, staff_id, email, location, supervisor, program, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          unique_id,
          first_name,
          last_name,
          staff_id,
          email,
          location,
          supervisor,
          program,
          created_by,
        ],
      );

      return { id: result.insertId, ...createEmployeeDto };
    } catch (error) {
      console.error('Create employee error:', error);

      throw new InternalServerErrorException('Failed to create employee');
    }
  }

  async findAll() {
    try {
      const [rows] = await this.pool.query<EmployeeRow[]>(
        'SELECT * FROM employee',
      );
      return rows;
    } catch (error) {
      console.error('Find all employees error:', error);
      throw new InternalServerErrorException('Failed to fetch employees');
    }
  }

  async findOne(id: number) {
    try {
      const [rows] = await this.pool.query<EmployeeRow[]>(
        'SELECT * FROM employee WHERE id = ?',
        [id],
      );

      if (rows.length === 0) {
        throw new NotFoundException(`Employee with ID ${id} not found`);
      }

      return rows[0];
    } catch (error) {
      console.error('Find employee error:', error);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Failed to fetch employee');
    }
  }

  async findByUniqueId(unique_id: string) {
    try {
      const [rows] = await this.pool.query<EmployeeRow[]>(
        'SELECT * FROM employee WHERE unique_id = ?',
        [unique_id],
      );

      if (rows.length === 0) {
        throw new NotFoundException(
          `Employee with unique ID ${unique_id} not found`,
        );
      }

      return rows[0];
    } catch (error) {
      console.error('Find by unique_id error:', error);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Failed to fetch employee');
    }
  }

  async update(id: number, updateEmployeeDto: UpdateEmployeeDto) {
    const fields = Object.keys(
      updateEmployeeDto,
    ) as (keyof UpdateEmployeeDto)[];

    if (fields.length === 0) {
      throw new BadRequestException('No fields provided for update');
    }

    try {
      await this.findOne(id);

      const setClause = fields.map((field) => `${field} = ?`).join(', ');
      const values: (string | number)[] = fields.map(
        (field) => updateEmployeeDto[field] as string | number,
      );

      await this.pool.query<mysql.ResultSetHeader>(
        `UPDATE employee SET ${setClause} WHERE id = ?`,
        [...values, id],
      );

      return this.findOne(id);
    } catch (error) {
      console.error('Update employee error:', error);
      if (error instanceof NotFoundException) throw error;
      if (error instanceof BadRequestException) throw error;
      if ((error as NodeJS.ErrnoException).code === 'ER_DUP_ENTRY') {
        throw new ConflictException(
          'Update conflicts with an existing unique_id, staff_id, or email',
        );
      }
      throw new InternalServerErrorException('Failed to update employee');
    }
  }

  async remove(id: number) {
    try {
      await this.findOne(id); // ensure employee exists

      await this.pool.query<mysql.ResultSetHeader>(
        'DELETE FROM employee WHERE id = ?',
        [id],
      );

      return { message: `Employee with ID ${id} successfully deleted` };
    } catch (error) {
      console.error('Delete employee error:', error);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Failed to delete employee');
    }
  }
}
