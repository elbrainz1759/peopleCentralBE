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
import { ensureExists } from '../utils/check-exit.util';

export interface EmployeeRow extends mysql.RowDataPacket {
  id: number;
  unique_id: string;
  name: string;
  email: string;
  staff_id: number;
  created_by?: string;
  designation?: string;
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
      firstName,
      lastName,
      staffId,
      email,
      locationId,
      departmentId,
      supervisorId,
      programId,
      countryId,
      designation,
    } = createEmployeeDto;

    const unique_id: string = randomBytes(16).toString('hex');

    const created_by: string = 'System';

    const checks: Promise<void>[] = [];

    try {
      if (departmentId) {
        checks.push(
          ensureExists(this.pool, 'departments', departmentId, 'Department'),
        );
      }
      if (programId) {
        checks.push(ensureExists(this.pool, 'programs', programId, 'Program'));
      }
      if (countryId) {
        checks.push(ensureExists(this.pool, 'countries', countryId, 'Country'));
      }
      if (locationId) {
        checks.push(
          ensureExists(this.pool, 'locations', locationId, 'Location'),
        );
      }
      if (supervisorId) {
        checks.push(
          ensureExists(this.pool, 'employee', supervisorId, 'Supervisor'),
        );
      }

      await Promise.all(checks);

      try {
        const [result] = await this.pool.query<mysql.ResultSetHeader>(
          `INSERT INTO employee (unique_id, designation, first_name, last_name, staff_id, email, location, department, supervisor, program, country, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            unique_id,
            designation,
            firstName,
            lastName,
            staffId,
            email,
            locationId,
            departmentId,
            supervisorId,
            programId,
            countryId,
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

  async findAll(query?: FindEmployeesDto) {
    const {
      firstName,
      lastName,
      staffId,
      email,
      locationId,
      supervisorId,
      departmentId,
      designation,
      programId,
      page = 1,
      limit = 10,
    } = query ?? {};

    const offset = (page - 1) * limit;

    let baseSql = `
    FROM employee e
    LEFT JOIN locations l 
      ON e.location = l.unique_id
    LEFT JOIN departments d 
      ON e.department = d.unique_id
    LEFT JOIN programs p 
      ON e.program = p.unique_id
    LEFT JOIN employee s
      ON e.supervisor = s.unique_id
    WHERE 1=1
  `;

    const params: (string | number)[] = [];

    if (firstName) {
      baseSql += ` AND e.first_name LIKE ?`;
      params.push(`%${firstName}%`);
    }

    if (lastName) {
      baseSql += ` AND e.last_name LIKE ?`;
      params.push(`%${lastName}%`);
    }

    if (staffId) {
      baseSql += ` AND e.staff_id LIKE ?`;
      params.push(`%${staffId}%`);
    }

    if (email) {
      baseSql += ` AND e.email LIKE ?`;
      params.push(`%${email}%`);
    }

    if (locationId) {
      baseSql += ` AND l.unique_id = ?`;
      params.push(locationId);
    }

    if (supervisorId) {
      baseSql += ` AND s.unique_id = ?`;
      params.push(supervisorId);
    }

    if (departmentId) {
      baseSql += ` AND d.unique_id = ?`;
      params.push(departmentId);
    }

    if (programId) {
      baseSql += ` AND p.unique_id = ?`;
      params.push(programId);
    }

    if (designation) {
      baseSql += ` AND e.designation LIKE ?`;
      params.push(`%${designation}%`);
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
      s.first_name AS supervisor_first_name,
      s.last_name AS supervisor_last_name,
      CONCAT(s.first_name, ' ', s.last_name) AS supervisor_name
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

  async update(unique_id: string, updateEmployeeDto: UpdateEmployeeDto) {
    // Run independent existence checks in parallel
    const checks: Promise<void>[] = [];

    if (updateEmployeeDto.departmentId) {
      checks.push(
        ensureExists(
          this.pool,
          'departments',
          updateEmployeeDto.departmentId,
          'Department',
        ),
      );
    }
    if (updateEmployeeDto.programId) {
      checks.push(
        ensureExists(
          this.pool,
          'programs',
          updateEmployeeDto.programId,
          'Program',
        ),
      );
    }
    if (updateEmployeeDto.countryId) {
      checks.push(
        ensureExists(
          this.pool,
          'countries',
          updateEmployeeDto.countryId,
          'Country',
        ),
      );
    }
    if (updateEmployeeDto.locationId) {
      checks.push(
        ensureExists(
          this.pool,
          'locations',
          updateEmployeeDto.locationId,
          'Location',
        ),
      );
    }
    if (updateEmployeeDto.supervisorId) {
      checks.push(
        ensureExists(
          this.pool,
          'employee',
          updateEmployeeDto.supervisorId,
          'Supervisor',
        ),
      );
    }

    await Promise.all(checks);

    // Build partial update dynamically
    const fields: string[] = [];
    const values: any[] = [];

    const fieldMap: Record<string, any> = {
      designation: updateEmployeeDto.designation,
      first_name: updateEmployeeDto.firstName,
      last_name: updateEmployeeDto.lastName,
      staff_id: updateEmployeeDto.staffId,
      email: updateEmployeeDto.email,
      location: updateEmployeeDto.locationId,
      department: updateEmployeeDto.departmentId,
      supervisor: updateEmployeeDto.supervisorId,
      program: updateEmployeeDto.programId,
      country: updateEmployeeDto.countryId,
    };

    for (const [col, val] of Object.entries(fieldMap)) {
      if (val !== undefined) {
        fields.push(`${col}=?`);
        values.push(val);
      }
    }

    if (fields.length === 0) {
      throw new BadRequestException('No fields provided for update');
    }

    values.push(unique_id);

    try {
      const [result] = await this.pool.query<mysql.ResultSetHeader>(
        `UPDATE employee SET ${fields.join(', ')} WHERE unique_id=?`,
        values,
      );

      if (result.affectedRows === 0) {
        throw new NotFoundException('Employee not found');
      }

      return this.findByUniqueId(unique_id);
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

  async remove(unique_id: string) {
    try {
      await this.findByUniqueId(unique_id); // ensure employee exists

      await this.pool.query<mysql.ResultSetHeader>(
        'DELETE FROM employee WHERE unique_id = ?',
        [unique_id],
      );

      return { message: `Employee with ID ${unique_id} successfully deleted` };
    } catch (error) {
      console.error('Delete employee error:', error);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Failed to delete employee');
    }
  }
}
