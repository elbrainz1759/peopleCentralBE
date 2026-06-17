import { LeaveTypeConfigsService } from './leave-type-configs.service';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

describe('LeaveTypeConfigsService', () => {
  let service: LeaveTypeConfigsService;

  const mockPool: any = { getConnection: jest.fn() };

  const mockConn: any = {
    query: jest.fn(),
    execute: jest.fn(),
    release: jest.fn(),
  };

  const mockFindOneConn: any = {
    query: jest.fn(),
    execute: jest.fn(),
    release: jest.fn(),
  };

  const mockUser: RequestUser = {
    id: 1,
    email: 'hr@mercycorps.org',
    role: 'Admin',
    unique_id: 'abc123',
    first_name: 'HR',
    last_name: 'User',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    mockPool.getConnection.mockResolvedValue(mockConn);
    service = new LeaveTypeConfigsService(mockPool as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto: any = {
      leaveTypeId: 'lt-uid-1',
      country: 'country-uid-1',
      annualHours: 160,
      monthlyAccrualHours: 13.33,
      period: 'Monthly',
    };

    it('throws BadRequestException when leave type not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]); // lt lookup → empty

      await expect(service.create(dto, mockUser)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when country not found', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ id: 1 }]]) // lt found
        .mockResolvedValueOnce([[]]); // country not found

      await expect(service.create(dto, mockUser)).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when active config already exists', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ id: 1 }]])                        // lt found
        .mockResolvedValueOnce([[{ unique_id: 'country-uid-1' }]])   // country found
        .mockResolvedValueOnce([[{ id: 5, status: 'Active' }]]);     // existing → Active

      await expect(service.create(dto, mockUser)).rejects.toThrow(ConflictException);
    });

    it('restores a soft-deleted config and returns it', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([[{ unique_id: 'country-uid-1' }]])
        .mockResolvedValueOnce([[{ id: 5, unique_id: 'cfg-uid-1', status: 'Deleted' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE

      mockFindOneConn.query.mockResolvedValueOnce([
        [{ id: 5, unique_id: 'cfg-uid-1', leave_type_id: 'lt-uid-1', country: 'country-uid-1', annual_hours: 160, status: 'Active', period: 'Monthly' }],
      ]);

      const result = await service.create(dto, mockUser);

      expect(result.unique_id).toBe('cfg-uid-1');
      expect(result.annual_hours).toBe(160);
    });

    it('creates new config with period and returns it', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([[{ unique_id: 'country-uid-1' }]])
        .mockResolvedValueOnce([[]])                   // no existing config
        .mockResolvedValueOnce([{ insertId: 10 }]);    // INSERT

      mockFindOneConn.query.mockResolvedValueOnce([
        [{ id: 10, unique_id: 'cfg-uid-new', leave_type_id: 'lt-uid-1', country: 'country-uid-1', annual_hours: 160, monthly_accrual_hours: 13.33, period: 'Monthly' }],
      ]);

      const result = await service.create(dto, mockUser);

      expect(result.annual_hours).toBe(160);
      expect(result.monthly_accrual_hours).toBe(13.33);
      expect(result.period).toBe('Monthly');
      expect(mockConn.query).toHaveBeenNthCalledWith(
        4,
        expect.stringContaining('INSERT INTO leave_type_country_config'),
        expect.arrayContaining([dto.leaveTypeId, dto.country, dto.annualHours, 13.33, mockUser.email, 'Active', dto.period]),
      );
    });

    it('creates with period=Annually', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([[{ unique_id: 'country-uid-1' }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 1 }]);

      mockFindOneConn.query.mockResolvedValueOnce([
        [{ id: 1, unique_id: 'cfg-uid-1', annual_hours: 160, period: 'Annually' }],
      ]);

      const result = await service.create({ ...dto, period: 'Annually' }, mockUser);

      expect(result.period).toBe('Annually');
      expect(mockConn.query).toHaveBeenNthCalledWith(
        4,
        expect.stringContaining('INSERT INTO leave_type_country_config'),
        expect.arrayContaining(['Annually']),
      );
    });

    it('inserts null for monthlyAccrualHours when not provided', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([[{ unique_id: 'country-uid-1' }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 1 }]);

      mockFindOneConn.query.mockResolvedValueOnce([
        [{ id: 1, unique_id: 'cfg-uid-1', annual_hours: 160, monthly_accrual_hours: null, period: 'Monthly' }],
      ]);

      await service.create({ ...dto, monthlyAccrualHours: undefined }, mockUser);

      const insertArgs = mockConn.query.mock.calls[3][1];
      expect(insertArgs).toContain(null);
    });
  });

  // ─── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all configs including period', async () => {
      const configs = [
        { id: 1, country: 'country-uid-1', annual_hours: 160, period: 'Monthly' },
        { id: 2, country: 'country-uid-1', annual_hours: 160, period: 'Annually' },
      ];

      mockConn.query.mockResolvedValueOnce([configs]);

      const result = await service.findAll();

      expect(result).toEqual(configs);
      expect(mockConn.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM leave_type_country_config'),
      );
    });
  });

  // ─── findByLeaveType ─────────────────────────────────────────────────────────

  describe('findByLeaveType', () => {
    it('returns configs for a leave type', async () => {
      const configs = [{ id: 1, leave_type_id: 'lt-uid-1', period: 'Monthly' }];

      mockConn.query.mockResolvedValueOnce([configs]);

      const result = await service.findByLeaveType('lt-uid-1');

      expect(result).toEqual(configs);
      expect(mockConn.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE ltcc.leave_type_id = ?'),
        ['lt-uid-1'],
      );
    });
  });

  // ─── findByCountry ───────────────────────────────────────────────────────────

  describe('findByCountry', () => {
    it('returns configs for a country', async () => {
      const configs = [{ id: 1, country: 'country-uid-1', period: 'Annually' }];

      mockConn.query.mockResolvedValueOnce([configs]);

      const result = await service.findByCountry('country-uid-1');

      expect(result).toEqual(configs);
      expect(mockConn.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE ltcc.country = ?'),
        ['country-uid-1'],
      );
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns config when found including period', async () => {
      const config = { id: 1, unique_id: 'cfg-uid-1', country: 'country-uid-1', annual_hours: 160, period: 'Monthly' };

      mockConn.query.mockResolvedValueOnce([[config]]);

      const result = await service.findOne('cfg-uid-1');

      expect(result).toEqual(config);
      expect(result.period).toBe('Monthly');
      expect(mockConn.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE ltcc.unique_id = ?'),
        ['cfg-uid-1'],
      );
    });

    it('throws NotFoundException when not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.findOne('uid-missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('throws NotFoundException when config not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.update('uid-missing', { annualHours: 200 } as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when no fields provided', async () => {
      mockConn.query.mockResolvedValueOnce([
        [{ unique_id: 'cfg-uid-1', country: 'country-uid-1', leave_type_id: 'lt-uid-1' }],
      ]);

      await expect(service.update('cfg-uid-1', {} as any)).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when new combo already exists', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ unique_id: 'cfg-uid-1', country: 'country-uid-1', leave_type_id: 'lt-uid-1' }]])
        .mockResolvedValueOnce([[{ unique_id: 'cfg-uid-other' }]]); // conflict found

      await expect(
        service.update('cfg-uid-1', { country: 'country-uid-2' } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('updates annualHours and returns updated config', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query
        .mockResolvedValueOnce([[{ unique_id: 'cfg-uid-1', country: 'country-uid-1', leave_type_id: 'lt-uid-1' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      mockFindOneConn.query.mockResolvedValueOnce([
        [{ id: 1, unique_id: 'cfg-uid-1', annual_hours: 200, country: 'country-uid-1', leave_type_id: 'lt-uid-1', period: 'Monthly' }],
      ]);

      const result = await service.update('cfg-uid-1', { annualHours: 200 } as any);

      expect(result.annual_hours).toBe(200);
      expect(mockConn.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('UPDATE leave_type_country_config SET'),
        expect.arrayContaining([200, 'cfg-uid-1']),
      );
    });

    it('updates period and returns updated config', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query
        .mockResolvedValueOnce([[{ unique_id: 'cfg-uid-1', country: 'country-uid-1', leave_type_id: 'lt-uid-1' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      mockFindOneConn.query.mockResolvedValueOnce([
        [{ id: 1, unique_id: 'cfg-uid-1', annual_hours: 160, period: 'Annually' }],
      ]);

      const result = await service.update('cfg-uid-1', { period: 'Annually' } as any);

      expect(result.period).toBe('Annually');
      const updateSql = mockConn.query.mock.calls[1][0];
      expect(updateSql).toContain('period = ?');
      expect(mockConn.query.mock.calls[1][1]).toContain('Annually');
    });

    it('always appends updated_at = NOW() to the SET clause', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query
        .mockResolvedValueOnce([[{ unique_id: 'cfg-uid-1', country: 'country-uid-1', leave_type_id: 'lt-uid-1' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      mockFindOneConn.query.mockResolvedValueOnce([
        [{ id: 1, unique_id: 'cfg-uid-1', annual_hours: 200, period: 'Monthly' }],
      ]);

      await service.update('cfg-uid-1', { annualHours: 200 } as any);

      const updateSql = mockConn.query.mock.calls[1][0];
      expect(updateSql).toContain('updated_at = NOW()');
    });
  });

  // ─── remove ──────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('throws NotFoundException when config not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.remove('uid-missing')).rejects.toThrow(NotFoundException);
    });

    it('soft-deletes config and returns confirmation', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ unique_id: 'cfg-uid-1' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await service.remove('cfg-uid-1');

      expect(result).toEqual({ deleted: true, id: 'cfg-uid-1' });
      expect(mockConn.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('SET status = "Deleted"'),
        ['cfg-uid-1'],
      );
    });
  });
});