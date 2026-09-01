import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { BulkCreateEmployeeDto } from './dto/bulk-create-employee.dto';
import { randomBytes } from 'crypto';
import { FindEmployeesDto } from './dto/find-employee.dto';
import { ensureExists } from '../utils/check-exit.util';
import { MailService } from '../mail/mail.service';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

export interface BulkUploadResult {
  created: number;
  updated: number;
  errors: { staffId: number; email: string; error: string }[];
  unresolvedSupervisors: {
    staffId: number;
    email: string;
    supervisorStaffId: number;
  }[];
}

export interface EmployeeRow extends mysql.RowDataPacket {
  id: number;
  unique_id: string;
  name: string;
  email: string;
  staff_id: number;
  created_by?: string;
  designation?: string;
  created_at: Date;
  status: string;
  location_name: string | null;
  department_name: string | null;
  program_name: string | null;
}

interface CountResult extends mysql.RowDataPacket {
  total: number;
}

@Injectable()
export class EmployeeService {
  private readonly logger = new Logger(EmployeeService.name);

  constructor(
    @Inject('MYSQL_POOL') private readonly pool: mysql.Pool,
    private readonly mailService: MailService,
  ) {}

  // Emails of active users holding a given role (case-insensitive)
  private async resolveRoleEmails(role: string): Promise<string[]> {
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT email FROM users WHERE LOWER(role) = LOWER(?) AND status = 'Active'`,
      [role],
    );
    return rows.map((r) => r.email as string);
  }

  private async notifyHR(subjectFull: string, message: string) {
    try {
      const hrEmails = await this.resolveRoleEmails('HR');
      if (hrEmails.length) {
        await this.mailService.sendToMany(hrEmails, {
          message,
          subject: 'PeopleCentral Staff Registration',
          subjectFull,
          siteName: 'PeopleCentral',
        });
      }
    } catch (error) {
      this.logger.error(
        'Failed to send HR registration notification',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async create(createEmployeeDto: CreateEmployeeDto) {
    const {
      firstName,
      lastName,
      staffId,
      email,
      locationId,
      departmentId,
      programId,
      countryId,
      designation,
    } = createEmployeeDto;

    //email must be @mercycorps.org
    if (!email.endsWith('@mercycorps.org')) {
      throw new BadRequestException('Email must be a mercycorps.org address');
    }

    const unique_id: string = randomBytes(16).toString('hex');

    const created_by: string = 'System - Self';

    const checks: Promise<void>[] = [];

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
      checks.push(ensureExists(this.pool, 'locations', locationId, 'Location'));
    }

    await Promise.all(checks);

    // If the employee already exists (e.g. seeded via a staff import),
    // registering just updates their record instead of failing on the
    // duplicate email/staff_id constraint. Status and supervisor are left
    // untouched — this form doesn't collect either.
    const [existingRows] = await this.pool.query<EmployeeRow[]>(
      'SELECT unique_id FROM employee WHERE email = ?',
      [email],
    );

    if (existingRows.length > 0) {
      const updated = await this.update(existingRows[0].unique_id, {
        firstName,
        lastName,
        designation,
        staffId,
        locationId,
        departmentId,
        programId,
        countryId,
      });

      await this.notifyHR(
        'Existing Staff Record Updated via Registration',
        `${firstName} ${lastName} (staff ID ${staffId}, ${email}) registered and matched an existing employee record. Their details were updated automatically. Please review and add them as a user if appropriate.`,
      );

      return updated;
    }

    try {
      const [result] = await this.pool.query<mysql.ResultSetHeader>(
        `INSERT INTO employee (status, unique_id, designation, first_name, last_name, staff_id, email, location, department, program, country, created_by)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'Pending',
          unique_id,
          designation,
          firstName,
          lastName,
          staffId,
          email,
          locationId,
          departmentId,
          programId,
          countryId,
          created_by,
        ],
      );

      await this.notifyHR(
        'New Staff Registration',
        `${firstName} ${lastName} (staff ID ${staffId}, ${email}) has registered as a new employee and is awaiting approval. Please review and add them as a user.`,
      );

      return { id: result.insertId, ...createEmployeeDto };
    } catch (error) {
      console.error('Create employee error:', error);

      throw new InternalServerErrorException('Failed to create employee');
    }
  }

  // ---------------------------------------------------------------------------
  // POST /employees/bulk-upload  (HR/Superadmin)
  //
  // Creates or updates (matched by email or staffId, same dedup rule as
  // create()) a batch of employees, then does a second pass to link
  // supervisors — supervisorStaffId is a raw staffId, resolved against every
  // row in this same batch plus any existing employee, since the supervisor
  // may be created in this very upload. Unresolvable supervisor links are
  // left unset and reported back rather than failing the whole row.
  // ---------------------------------------------------------------------------
  async bulkUpload(
    dto: BulkCreateEmployeeDto,
    user: RequestUser,
  ): Promise<BulkUploadResult> {
    // Pre-flight — validate every distinct lookup ID referenced, once each,
    // rather than per row.
    const distinct = (vals: string[]) => [...new Set(vals)];
    await Promise.all([
      ...distinct(dto.employees.map((e) => e.departmentId)).map((id) =>
        ensureExists(this.pool, 'departments', id, 'Department'),
      ),
      ...distinct(dto.employees.map((e) => e.locationId)).map((id) =>
        ensureExists(this.pool, 'locations', id, 'Location'),
      ),
      ...distinct(dto.employees.map((e) => e.programId)).map((id) =>
        ensureExists(this.pool, 'programs', id, 'Program'),
      ),
      ...distinct(dto.employees.map((e) => e.countryId)).map((id) =>
        ensureExists(this.pool, 'countries', id, 'Country'),
      ),
    ]);

    const errors: BulkUploadResult['errors'] = [];
    // staffId -> unique_id, for every row that made it in (created or
    // updated) this run — used for the supervisor-linking pass below.
    const staffIdToUniqueId = new Map<number, string>();
    let created = 0;
    let updated = 0;

    for (const row of dto.employees) {
      try {
        const [existingRows] = await this.pool.query<EmployeeRow[]>(
          'SELECT unique_id FROM employee WHERE email = ? OR staff_id = ?',
          [row.email, row.staffId],
        );

        if (existingRows.length > 0) {
          const result = await this.update(existingRows[0].unique_id, {
            firstName: row.firstName,
            lastName: row.lastName,
            designation: row.designation,
            staffId: row.staffId,
            locationId: row.locationId,
            departmentId: row.departmentId,
            programId: row.programId,
            countryId: row.countryId,
          });
          staffIdToUniqueId.set(row.staffId, result.unique_id);
          updated++;
        } else {
          const unique_id = randomBytes(16).toString('hex');
          await this.pool.query<mysql.ResultSetHeader>(
            `INSERT INTO employee (status, unique_id, designation, first_name, last_name, staff_id, email, location, department, program, country, created_by)
             VALUES ('Pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              unique_id,
              row.designation,
              row.firstName,
              row.lastName,
              row.staffId,
              row.email,
              row.locationId,
              row.departmentId,
              row.programId,
              row.countryId,
              user.email,
            ],
          );
          staffIdToUniqueId.set(row.staffId, unique_id);
          created++;
        }
      } catch (err) {
        errors.push({
          staffId: row.staffId,
          email: row.email,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Supervisor-linking pass — resolve any supervisorStaffId not already
    // seen in this batch against existing employees.
    const rowsNeedingSupervisor = dto.employees.filter(
      (e) => e.supervisorStaffId && staffIdToUniqueId.has(e.staffId),
    );
    const unseenSupervisorIds = distinct(
      rowsNeedingSupervisor
        .map((e) => String(e.supervisorStaffId))
        .filter((id) => !staffIdToUniqueId.has(Number(id))),
    ).map(Number);

    if (unseenSupervisorIds.length) {
      const [supRows] = await this.pool.query<mysql.RowDataPacket[]>(
        `SELECT staff_id, unique_id FROM employee WHERE staff_id IN (?)`,
        [unseenSupervisorIds],
      );
      for (const r of supRows) {
        staffIdToUniqueId.set(r.staff_id as number, r.unique_id as string);
      }
    }

    const unresolvedSupervisors: BulkUploadResult['unresolvedSupervisors'] = [];

    for (const row of rowsNeedingSupervisor) {
      if (row.supervisorStaffId === row.staffId) {
        unresolvedSupervisors.push({
          staffId: row.staffId,
          email: row.email,
          supervisorStaffId: row.supervisorStaffId,
        });
        continue;
      }

      const empUniqueId = staffIdToUniqueId.get(row.staffId)!;
      const supUniqueId = staffIdToUniqueId.get(row.supervisorStaffId!);

      if (!supUniqueId) {
        unresolvedSupervisors.push({
          staffId: row.staffId,
          email: row.email,
          supervisorStaffId: row.supervisorStaffId!,
        });
        continue;
      }

      await this.pool.query(
        'UPDATE employee SET supervisor = ? WHERE unique_id = ?',
        [supUniqueId, empUniqueId],
      );
    }

    return { created, updated, errors, unresolvedSupervisors };
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
      status,
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

    if (status) {
      baseSql += ` AND e.status = ?`;
      params.push(status);
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
      await this.findByUniqueId(unique_id);

      await this.pool.query<mysql.ResultSetHeader>(
        'UPDATE employee SET status = "Inactive" WHERE unique_id = ?',
        [unique_id],
      );

      return {
        message: `Employee with ID ${unique_id} successfully deactivated`,
      };
    } catch (error) {
      console.error('Deactivate employee error:', error);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Failed to deactivate employee');
    }
  }
}
