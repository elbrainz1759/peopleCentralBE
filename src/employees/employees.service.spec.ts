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
});
