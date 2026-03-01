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
      staffId,
      email,
      location,
      departmentId,
      supervisor,
      programId,
      countryId,
    } = createEmployeeDto;

    const unique_id: string = randomBytes(16).toString('hex');

    const created_by: string = 'System';

    try {
      //Check if department exists
      const [deptRows] = await this.pool.query<mysql.RowDataPacket[]>(
        'SELECT unique_id FROM departments WHERE unique_id = ?',
        [departmentId],
      );

      if (deptRows.length === 0) {
        throw new NotFoundException(
          `Department with unique_id ${departmentId} not found`,
        );
      }

      //check if program exists

      const [progRows] = await this.pool.query<mysql.RowDataPacket[]>(
        'SELECT unique_id FROM programs WHERE unique_id = ?',
        [programId],
      );
      if (progRows.length === 0) {
        throw new NotFoundException(
          `Program with unique_id ${programId} not found`,
        );
      }

      //check if country exists
      const [countryRows] = await this.pool.query<mysql.RowDataPacket[]>(
        'SELECT unique_id FROM countries WHERE unique_id = ?',
        [countryId],
      );

      if (countryRows.length === 0) {
        throw new NotFoundException(
          `Country with unique_id ${countryId} not found`,
        );
      }

      //check if supervisor exists (if provided)
      if (supervisor) {
        const [supervisorRows] = await this.pool.query<mysql.RowDataPacket[]>(
          'SELECT unique_id FROM employee WHERE unique_id = ?',
          [supervisor],
        );
        if (supervisorRows.length === 0) {
          throw new NotFoundException(
            `Supervisor with unique_id ${supervisor} not found`,
          );
        }
      }
      //check if location exists (if provided)
      if (location) {
        const [locationRows] = await this.pool.query<mysql.RowDataPacket[]>(
          'SELECT unique_id FROM locations WHERE unique_id = ?',
          [location],
        );
        if (locationRows.length === 0) {
          throw new NotFoundException(
            `Location with unique_id ${location} not found`,
          );
        }
      }
      try {
        const [result] = await this.pool.query<mysql.ResultSetHeader>(
          `INSERT INTO employee (unique_id, first_name, last_name, staff_id, email, location, department, supervisor, program, country, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            unique_id,
            first_name,
            last_name,
            staffId,
            email,
            location,
            departmentId,
            supervisor,
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
