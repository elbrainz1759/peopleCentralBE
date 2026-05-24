import { LeaveTypesService } from './leave-types.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

describe('LeaveTypesService', () => {
  let service: LeaveTypesService;

  const mockPool: any = { getConnection: jest.fn() };
  const mockConn: any = {
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

  const mockLeaveType = {
    id: 1,
    unique_id: 'uid1',
    name: 'Annual Leave',
    description: 'Annual leave',
    country: 'NG',
    created_by: 'hr@mercycorps.org',
    created_at: new Date(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    mockPool.getConnection.mockResolvedValue(mockConn);
    service = new LeaveTypesService(mockPool as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const dto = { name: 'Annual Leave', description: 'Annual', country: 'NG' };

    it('throws ConflictException when leave type already exists', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]);
      await expect(service.create(dto as any, mockUser)).rejects.toThrow(ConflictException);
    });

it('creates leave type and returns it', async () => {
  mockConn.query.mockResolvedValueOnce([[]]); // no duplicate
  mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]); // INSERT
  mockPool.getConnection.mockResolvedValueOnce(mockConn); // findOne connection
  mockConn.query.mockResolvedValueOnce([[mockLeaveType]]);

  const result = await service.create(dto as any, mockUser); // ← mockUser added
  expect(result.name).toBe('Annual Leave');
});
  });

  describe('findAll', () => {
    it('returns paginated leave types', async () => {
      mockConn.query.mockResolvedValueOnce([[{ total: 1 }]]);
      mockConn.query.mockResolvedValueOnce([[mockLeaveType]]);
      const result = await service.findAll({} as any);
      expect(result.data).toEqual([mockLeaveType]);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('findOne', () => {
    it('returns leave type when found', async () => {
      mockConn.query.mockResolvedValueOnce([[mockLeaveType]]);
      expect(await service.findOne(1)).toEqual(mockLeaveType);
    });

    it('throws NotFoundException when not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);
      await expect(service.findOne(1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByUniqueId', () => {
    it('returns leave type when found', async () => {
      mockConn.query.mockResolvedValueOnce([[mockLeaveType]]);
      expect(await service.findByUniqueId('uid1')).toEqual(mockLeaveType);
    });

    it('throws NotFoundException when not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);
      await expect(service.findByUniqueId('bad')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('throws NotFoundException when leave type does not exist', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);
      await expect(service.update(1, { name: 'Updated' })).rejects.toThrow(NotFoundException);
    });

    it('returns existing leave type when dto is empty', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]);
      mockPool.getConnection.mockResolvedValueOnce(mockConn);
      mockConn.query.mockResolvedValueOnce([[mockLeaveType]]);
      const result = await service.update(1, {});
      expect(result).toEqual(mockLeaveType);
    });

    it('updates and returns updated leave type', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]); // SELECT existing
      mockConn.execute.mockResolvedValueOnce([{}]); // UPDATE
      mockPool.getConnection.mockResolvedValueOnce(mockConn); // findOne connection
      mockConn.query.mockResolvedValueOnce([[{ ...mockLeaveType, name: 'Updated' }]]);

      const result = await service.update(1, { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when leave type does not exist', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);
      await expect(service.remove(1)).rejects.toThrow(NotFoundException);
    });

    it('deletes leave type successfully', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]);
      mockConn.execute.mockResolvedValueOnce([{}]);
      const result = await service.remove(1);
      expect(result).toEqual({ message: 'Leave type 1 deleted successfully' });
    });
  });
});