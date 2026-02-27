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
import { FindEmployeesDto } from './dto/find-employee.dto';

export interface EmployeeRow extends mysql.RowDataPacket {
  id: number;
  unique_id: string;
  name: string;
  email: string;
  staff_id: number;
  created_by?: string;
  created_at: Date;
  location_name: string | null;
  department_name: string | null;
  program_name: string | null;
  supervisor_name: string | null;
}

interface CountResult extends mysql.RowDataPacket {
  total: number;
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
      departmentId,
      supervisor,
      programId,
    } = createEmployeeDto;

    const unique_id: string = randomBytes(16).toString('hex');

    const created_by: string = 'System';

    try {
      //Check if department exists
      const [deptRows] = await this.pool.query<mysql.RowDataPacket[]>(
        'SELECT unique_id FROM department WHERE unique_id = ?',
        [departmentId],
      );

      if (deptRows.length === 0) {
        throw new NotFoundException(
          `Department with unique_id ${departmentId} not found`,
        );
      }

      //check if program exists

      const [progRows] = await this.pool.query<mysql.RowDataPacket[]>(
        'SELECT unique_id FROM program WHERE unique_id = ?',
        [programId],
      );
      if (progRows.length === 0) {
        throw new NotFoundException(
          `Program with unique_id ${programId} not found`,
        );
      }

      try {
        const [result] = await this.pool.query<mysql.ResultSetHeader>(
          `INSERT INTO employee (unique_id, first_name, last_name, staff_id, email, location, department, supervisor, program, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            unique_id,
            first_name,
            last_name,
            staff_id,
            email,
            location,
            departmentId,
            supervisor,
            programId,
            created_by,
          ],
        );

        return { id: result.insertId, ...createEmployeeDto };
      } catch (error) {
        console.error('Create employee error:', error);

        throw new InternalServerErrorException('Failed to create employee');
      }
    } catch (error) {
      console.error('Department validation error:', error);
      return { message: 'Failed to create employee' };
    }
  }

  async findAll(query: FindEmployeesDto) {
    const {
      name,
      staff_id,
      email,
      location,
      supervisor,
      departmentId,
      programId,
      page = 1,
      limit = 10,
    } = query;

    const offset = (page - 1) * limit;

    let baseSql = `
    FROM employees e
    LEFT JOIN locations l 
      ON e.location_unique_id = l.unique_id
    LEFT JOIN departments d 
      ON e.department_unique_id = d.unique_id
    LEFT JOIN programs p 
      ON e.program_unique_id = p.unique_id
    LEFT JOIN employees s
      ON e.supervisor_unique_id = s.unique_id
    WHERE 1=1
  `;

    const params: (string | number)[] = [];

    if (name) {
      baseSql += ` AND e.name LIKE ?`;
      params.push(`%${name}%`);
    }

    if (staff_id) {
      baseSql += ` AND e.staff_id LIKE ?`;
      params.push(`%${staff_id}%`);
    }

    if (email) {
      baseSql += ` AND e.email LIKE ?`;
      params.push(`%${email}%`);
    }

    if (location) {
      baseSql += ` AND l.unique_id = ?`;
      params.push(location);
    }

    if (supervisor) {
      baseSql += ` AND s.unique_id = ?`;
      params.push(supervisor);
    }

    if (departmentId) {
      baseSql += ` AND d.unique_id = ?`;
      params.push(departmentId);
    }

    if (programId) {
      baseSql += ` AND p.unique_id = ?`;
      params.push(programId);
    }

    // Get total count
    const countSql = `SELECT COUNT(*) AS total ${baseSql}`;
    const [countRows] = await this.pool.query<CountResult[]>(countSql, params);
    const total = countRows[0]?.total ?? 0;

    // Get paginated data
    const dataSql = `
    SELECT 
      e.*,
      l.name AS location_name,
      d.name AS department_name,
      p.name AS program_name,
      s.name AS supervisor_name
    ${baseSql}
    ORDER BY e.created_at DESC
    LIMIT ? OFFSET ?
  `;

    const dataParams: (string | number)[] = [...params, limit, offset];

    const [rows] = await this.pool.query<EmployeeRow[]>(dataSql, dataParams);

    return {
      data: rows,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
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
