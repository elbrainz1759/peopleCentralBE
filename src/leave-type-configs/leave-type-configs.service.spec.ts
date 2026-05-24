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

  describe('create', () => {
    const dto = {
      leaveTypeId: 'lt-uid-1',
      country: 'country-uid-1',
      annualHours: 160,
      monthlyAccrualHours: 13.33,
    };

    it('throws BadRequestException when leave type not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.create(dto as any, mockUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when country not found', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]);
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.create(dto as any, mockUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws ConflictException when config already exists', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]);
      mockConn.query.mockResolvedValueOnce([[{ unique_id: 'c1' }]]);
      mockConn.query.mockResolvedValueOnce([[{ id: 5 }]]);

      await expect(service.create(dto as any, mockUser)).rejects.toThrow(
        ConflictException,
      );
    });

    it('creates config and returns it', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]);
      mockConn.query.mockResolvedValueOnce([[{ unique_id: 'c1' }]]);
      mockConn.query.mockResolvedValueOnce([[]]);
      mockConn.query.mockResolvedValueOnce([{ insertId: 10 }]);

      mockFindOneConn.query.mockResolvedValueOnce([
        [
          {
            id: 10,
            unique_id: 'uid1',
            leave_type_id: 'lt-uid-1',
            country: 'country-uid-1',
            annual_hours: 160,
            monthly_accrual_hours: 13.33,
          },
        ],
      ]);

      const result = await service.create(dto as any, mockUser);

      expect(result.id).toBe(10);
      expect(result.annual_hours).toBe(160);
    });
  });

  describe('findAll', () => {
    it('returns all configs', async () => {
      const configs = [{ id: 1, country: 'NG', annual_hours: 160 }];

      mockConn.query.mockResolvedValueOnce([configs]);

      expect(await service.findAll()).toEqual(configs);
    });
  });

  describe('findByLeaveType', () => {
    it('returns configs for a leave type', async () => {
      const configs = [{ id: 1, leave_type_id: 'lt1' }];

      mockConn.query.mockResolvedValueOnce([configs]);

      expect(await service.findByLeaveType('lt1')).toEqual(configs);
    });
  });

  describe('findByCountry', () => {
    it('returns configs for a country', async () => {
      const configs = [{ id: 1, country: 'NG' }];

      mockConn.query.mockResolvedValueOnce([configs]);

      expect(await service.findByCountry('NG')).toEqual(configs);
    });
  });

  describe('findOne', () => {
    it('returns config when found', async () => {
      const config = { id: 1, country: 'NG', annual_hours: 160 };

      mockConn.query.mockResolvedValueOnce([[config]]);

      expect(await service.findOne(1)).toEqual(config);
    });

    it('throws NotFoundException when not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.findOne(1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('throws NotFoundException when config not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.update(1, { annualHours: 200 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when no fields provided', async () => {
      mockConn.query.mockResolvedValueOnce([
        [{ id: 1, country: 'NG', leave_type_id: 1 }],
      ]);

      await expect(service.update(1, {})).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when new combo already exists', async () => {
      mockConn.query.mockResolvedValueOnce([
        [{ id: 1, country: 'NG', leave_type_id: 1 }],
      ]);
      mockConn.query.mockResolvedValueOnce([[{ id: 99 }]]);

      await expect(service.update(1, { country: 'GH' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('updates and returns updated config', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query.mockResolvedValueOnce([
        [{ id: 1, country: 'NG', leave_type_id: 1 }],
      ]);

      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      mockFindOneConn.query.mockResolvedValueOnce([
        [
          {
            id: 1,
            annual_hours: 200,
            country: 'NG',
            leave_type_id: 1,
          },
        ],
      ]);

      const result = await service.update(1, { annualHours: 200 });

      expect(result.annual_hours).toBe(200);
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when config not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.remove('uid123')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deletes config and returns confirmation', async () => {
      mockConn.query.mockResolvedValueOnce([[{ unique_id: 'uid123' }]]);
      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await service.remove('uid123');

      expect(result).toEqual({ deleted: true, id: 'uid123' });
    });
  });
});