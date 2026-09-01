import { EmployeeService } from './employees.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('EmployeesService', () => {
  let service: EmployeeService;
  const mockPool = {
    query: jest.fn(),
    getConnection: jest.fn(),
  } as { query: jest.Mock; getConnection: jest.Mock };
  const mockConn = {
    query: jest.fn(),
    execute: jest.fn(),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
  };
  const mockMailService = {
    sendCaseNotification: jest.fn(),
    sendToMany: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    mockPool.getConnection.mockResolvedValue(mockConn);
    service = new EmployeeService(mockPool as any, mockMailService as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOne/findByUniqueId', () => {
    it('throws when not found', async () => {
      mockPool.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]);
      await expect(service.findOne(1)).rejects.toThrow(NotFoundException);
      await expect(service.findByUniqueId('u')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('errors when no update fields provided', async () => {
      mockPool.query.mockResolvedValueOnce([[{ id: 1 }]]);
      await expect(service.update('u', {} as any)).rejects.toThrow(
        BadRequestException,
      );
    });
    it('errors when employee not exists', async () => {
      mockPool.query.mockResolvedValue([[]]);
      await expect(
        service.update('u', { firstName: 'a' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create — HR notification', () => {
    const baseDto = {
      firstName: 'Jane',
      lastName: 'Doe',
      designation: 'Officer',
      staffId: 123,
      email: 'jane.doe@mercycorps.org',
    } as any;

    it('notifies HR on a brand-new registration', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // no existing employee with this email
        .mockResolvedValueOnce([{ insertId: 10 }]) // insert
        .mockResolvedValueOnce([[{ email: 'hr1@mercycorps.org' }]]); // HR lookup

      const result = await service.create(baseDto);

      expect(result).toEqual({ id: 10, ...baseDto });
      expect(mockMailService.sendToMany).toHaveBeenCalledTimes(1);
      expect(mockMailService.sendToMany).toHaveBeenCalledWith(
        ['hr1@mercycorps.org'],
        expect.objectContaining({ subjectFull: 'New Staff Registration' }),
      );
    });

    it('notifies HR when a registration matches and updates an existing employee', async () => {
      mockPool.query
        .mockResolvedValueOnce([[{ unique_id: 'abc' }]]) // matched by email
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // update
        .mockResolvedValueOnce([[{ unique_id: 'abc', email: baseDto.email }]]) // re-fetch
        .mockResolvedValueOnce([[{ email: 'hr1@mercycorps.org' }]]); // HR lookup

      const result = await service.create(baseDto);

      expect(result).toEqual({ unique_id: 'abc', email: baseDto.email });
      expect(mockMailService.sendToMany).toHaveBeenCalledTimes(1);
      expect(mockMailService.sendToMany).toHaveBeenCalledWith(
        ['hr1@mercycorps.org'],
        expect.objectContaining({
          subjectFull: 'Existing Staff Record Updated via Registration',
        }),
      );
    });

    it('skips the email send when there are no active HR users', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 11 }])
        .mockResolvedValueOnce([[]]); // no HR rows

      await service.create(baseDto);

      expect(mockMailService.sendToMany).not.toHaveBeenCalled();
    });

    it('does not let a mail failure break registration', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 12 }])
        .mockResolvedValueOnce([[{ email: 'hr1@mercycorps.org' }]]);
      mockMailService.sendToMany.mockRejectedValueOnce(new Error('SMTP down'));

      const result = await service.create(baseDto);

      expect(result).toEqual({ id: 12, ...baseDto });
    });
  });

  describe('create — failure handling', () => {
    const baseDto = {
      firstName: 'Jane',
      lastName: 'Doe',
      designation: 'Officer',
      staffId: 123,
      email: 'jane.doe@mercycorps.org',
    } as any;

    it('throws instead of returning a fake success when the insert fails', async () => {
      mockPool.query
        .mockResolvedValueOnce([[]]) // no existing employee
        .mockRejectedValueOnce(
          Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' }),
        ); // insert fails

      await expect(service.create(baseDto)).rejects.toThrow(
        'Failed to create employee',
      );
      expect(mockMailService.sendToMany).not.toHaveBeenCalled();
    });

    it('propagates a NotFoundException when a referenced department does not exist', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // ensureExists('departments', ...) finds nothing

      await expect(
        service.create({ ...baseDto, departmentId: 'missing-dept' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('bulkUpload', () => {
    const mockUser = { email: 'hr@mercycorps.org' } as any;

    const row = (overrides: Record<string, unknown> = {}) => ({
      firstName: 'Jane',
      lastName: 'Doe',
      designation: 'Officer',
      staffId: 100,
      email: 'jane.doe@mercycorps.org',
      locationId: 'loc-1',
      programId: 'prog-1',
      departmentId: 'dept-1',
      countryId: 'country-1',
      ...overrides,
    });

    it('creates two new employees and links a supervisor within the same batch', async () => {
      const dto = {
        employees: [
          row({ staffId: 100, email: 'a@mc.org', supervisorStaffId: 200 }),
          row({ staffId: 200, email: 'b@mc.org' }),
        ],
      } as any;

      mockPool.query
        .mockResolvedValueOnce([[{ unique_id: 'dept-1' }]]) // ensureExists dept
        .mockResolvedValueOnce([[{ unique_id: 'loc-1' }]]) // ensureExists location
        .mockResolvedValueOnce([[{ unique_id: 'prog-1' }]]) // ensureExists program
        .mockResolvedValueOnce([[{ unique_id: 'country-1' }]]) // ensureExists country
        .mockResolvedValueOnce([[]]) // row1: no existing match
        .mockResolvedValueOnce([{ insertId: 1 }]) // row1: insert
        .mockResolvedValueOnce([[]]) // row2: no existing match
        .mockResolvedValueOnce([{ insertId: 2 }]) // row2: insert
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // supervisor link UPDATE

      const result = await service.bulkUpload(dto, mockUser);

      expect(result).toEqual({
        created: 2,
        updated: 0,
        errors: [],
        unresolvedSupervisors: [],
      });

      // The two INSERTs each carry a freshly generated unique_id as their
      // 2nd bound param — capture row2's so we can confirm the final UPDATE
      // links row1 to it.
      const row2InsertParams = mockPool.query.mock.calls[7][1] as unknown[];
      const row2UniqueId = row2InsertParams[0];

      const supervisorUpdateCall = mockPool.query.mock.calls[8];
      expect(supervisorUpdateCall[0]).toContain(
        'UPDATE employee SET supervisor = ?',
      );
      expect(supervisorUpdateCall[1]).toEqual([
        row2UniqueId,
        expect.any(String), // row1's own unique_id
      ]);
    });

    it('updates an existing employee instead of creating a duplicate', async () => {
      const dto = { employees: [row()] } as any;

      mockPool.query
        .mockResolvedValueOnce([[{ unique_id: 'dept-1' }]]) // batch pre-check: dept
        .mockResolvedValueOnce([[{ unique_id: 'loc-1' }]]) // batch pre-check: location
        .mockResolvedValueOnce([[{ unique_id: 'prog-1' }]]) // batch pre-check: program
        .mockResolvedValueOnce([[{ unique_id: 'country-1' }]]) // batch pre-check: country
        .mockResolvedValueOnce([[{ unique_id: 'existing-uid' }]]) // matched by email/staffId
        .mockResolvedValueOnce([[{ unique_id: 'dept-1' }]]) // update()'s own ensureExists: dept
        .mockResolvedValueOnce([[{ unique_id: 'prog-1' }]]) // update()'s own ensureExists: program
        .mockResolvedValueOnce([[{ unique_id: 'country-1' }]]) // update()'s own ensureExists: country
        .mockResolvedValueOnce([[{ unique_id: 'loc-1' }]]) // update()'s own ensureExists: location
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // update()'s UPDATE
        .mockResolvedValueOnce([[{ unique_id: 'existing-uid' }]]); // update()'s re-fetch

      const result = await service.bulkUpload(dto, mockUser);

      expect(result.created).toBe(0);
      expect(result.updated).toBe(1);
      expect(result.errors).toEqual([]);
    });

    it('reports an unresolved supervisor instead of failing the row', async () => {
      const dto = {
        employees: [row({ supervisorStaffId: 999 })],
      } as any;

      mockPool.query
        .mockResolvedValueOnce([[{ unique_id: 'dept-1' }]])
        .mockResolvedValueOnce([[{ unique_id: 'loc-1' }]])
        .mockResolvedValueOnce([[{ unique_id: 'prog-1' }]])
        .mockResolvedValueOnce([[{ unique_id: 'country-1' }]])
        .mockResolvedValueOnce([[]]) // no existing match
        .mockResolvedValueOnce([{ insertId: 1 }]) // insert
        .mockResolvedValueOnce([[]]); // supervisor 999 not found anywhere

      const result = await service.bulkUpload(dto, mockUser);

      expect(result.created).toBe(1);
      expect(result.unresolvedSupervisors).toEqual([
        {
          staffId: 100,
          email: 'jane.doe@mercycorps.org',
          supervisorStaffId: 999,
        },
      ]);
      // No supervisor UPDATE should have run
      const updateCalls = mockPool.query.mock.calls.filter((c) =>
        (c[0] as string).includes('UPDATE employee SET supervisor'),
      );
      expect(updateCalls).toHaveLength(0);
    });

    it('flags self-supervision as unresolved rather than creating a loop', async () => {
      const dto = {
        employees: [row({ staffId: 100, supervisorStaffId: 100 })],
      } as any;

      mockPool.query
        .mockResolvedValueOnce([[{ unique_id: 'dept-1' }]])
        .mockResolvedValueOnce([[{ unique_id: 'loc-1' }]])
        .mockResolvedValueOnce([[{ unique_id: 'prog-1' }]])
        .mockResolvedValueOnce([[{ unique_id: 'country-1' }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 1 }]);

      const result = await service.bulkUpload(dto, mockUser);

      expect(result.unresolvedSupervisors).toEqual([
        {
          staffId: 100,
          email: 'jane.doe@mercycorps.org',
          supervisorStaffId: 100,
        },
      ]);
    });

    it('isolates a per-row failure instead of failing the whole batch', async () => {
      const dto = {
        employees: [
          row({ staffId: 100, email: 'a@mc.org' }),
          row({ staffId: 200, email: 'b@mc.org' }),
        ],
      } as any;

      mockPool.query
        .mockResolvedValueOnce([[{ unique_id: 'dept-1' }]])
        .mockResolvedValueOnce([[{ unique_id: 'loc-1' }]])
        .mockResolvedValueOnce([[{ unique_id: 'prog-1' }]])
        .mockResolvedValueOnce([[{ unique_id: 'country-1' }]])
        .mockResolvedValueOnce([[]]) // row1: no existing match
        .mockRejectedValueOnce(new Error('duplicate key')) // row1: insert fails
        .mockResolvedValueOnce([[]]) // row2: no existing match
        .mockResolvedValueOnce([{ insertId: 2 }]); // row2: insert succeeds

      const result = await service.bulkUpload(dto, mockUser);

      expect(result.created).toBe(1);
      expect(result.errors).toEqual([
        { staffId: 100, email: 'a@mc.org', error: 'duplicate key' },
      ]);
    });

    it('propagates NotFoundException when a referenced lookup value does not exist', async () => {
      const dto = { employees: [row({ departmentId: 'missing-dept' })] } as any;

      mockPool.query.mockResolvedValueOnce([[]]); // ensureExists('departments', ...) finds nothing

      await expect(service.bulkUpload(dto, mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
