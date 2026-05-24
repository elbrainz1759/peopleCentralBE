import { DepartmentsService } from './departments.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

describe('DepartmentsService', () => {
  let service: DepartmentsService;

  const mockPool: any = { getConnection: jest.fn() };
  const mockConn: any = {
    query: jest.fn(),
    execute: jest.fn(),
    release: jest.fn(),
  };

  const mockUser: RequestUser = {
    id: 1,
    email: 'admin@example.com',
    role: 'Admin',
    unique_id: 'abc123',
    first_name: 'Admin',
    last_name: 'User',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    mockPool.getConnection.mockResolvedValue(mockConn);
    service = new DepartmentsService(mockPool as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates a department and uses user email as created_by', async () => {
      mockConn.query.mockResolvedValueOnce([[]]); // no duplicate
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]); // INSERT
      // findOne connection
      mockPool.getConnection.mockResolvedValueOnce(mockConn);
      mockConn.query.mockResolvedValueOnce([[{
        id: 1,
        name: 'Engineering',
        unique_id: 'uid1',
        created_by: 'admin@example.com',
        created_at: new Date(),
      }]]);

      const result = await service.create({ name: 'Engineering' } as any, mockUser);

      const insertCall = mockConn.query.mock.calls[1];
      expect(insertCall[1]).toContain('admin@example.com');
      expect(insertCall[1]).toContain('Active');
      expect(result.name).toBe('Engineering');
    });

    it('throws ConflictException when department already exists', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]);
      await expect(
        service.create({ name: 'Engineering' } as any, mockUser),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findOne', () => {
    it('returns department when found', async () => {
      const dept = { id: 1, name: 'Engineering', unique_id: 'uid1', created_by: 'admin@example.com', created_at: new Date() };
      mockConn.query.mockResolvedValueOnce([[dept]]);
      expect(await service.findOne(1)).toEqual(dept);
    });

    it('throws NotFoundException when not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);
      await expect(service.findOne(1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByUniqueId', () => {
    it('returns department when found', async () => {
      const dept = { id: 1, name: 'Engineering', unique_id: 'uid1' };
      mockConn.query.mockResolvedValueOnce([[dept]]);
      expect(await service.findByUniqueId('uid1')).toEqual(dept);
    });

    it('throws NotFoundException when not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);
      await expect(service.findByUniqueId('bad')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('throws NotFoundException when department does not exist', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);
      await expect(service.update(1, { name: 'HR' })).rejects.toThrow(NotFoundException);
    });

    it('returns existing department when dto is empty', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]);
      mockPool.getConnection.mockResolvedValueOnce(mockConn);
      mockConn.query.mockResolvedValueOnce([[{ id: 1, name: 'Engineering' }]]);
      const result = await service.update(1, {});
      expect(result.id).toBe(1);
    });
  });

  describe('remove', () => {
    it('deactivates department by unique_id', async () => {
      mockConn.query.mockResolvedValueOnce([[{ unique_id: 'uid1' }]]);
      mockConn.execute.mockResolvedValueOnce([{}]);
      const result = await service.remove('uid1');
      expect(result).toEqual({ message: 'Department uid1 deactivated successfully' });
      expect(mockConn.execute).toHaveBeenCalledWith(
        'UPDATE departments SET status = "Inactive" WHERE unique_id = ?',
        ['uid1'],
      );
    });

    it('throws NotFoundException when department does not exist', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);
      await expect(service.remove('bad-uid')).rejects.toThrow(NotFoundException);
    });
  });
});