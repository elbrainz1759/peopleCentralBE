import { ConflictException, NotFoundException } from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

describe('DepartmentsService', () => {
  let service: DepartmentsService;

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

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('throws ConflictException when department exists and is Active', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1, status: 'Active' }]]);

      await expect(service.create({ name: 'Engineering' } as any, mockUser)).rejects.toThrow(
        ConflictException,
      );
    });

    it('restores a soft-deleted department and returns it', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ id: 1, status: 'Deleted' }]])  // name lookup → Deleted
        .mockResolvedValueOnce([[{ id: 1, unique_id: 'dept-uid-1', name: 'Engineering', status: 'Active' }]]); // SELECT after UPDATE

      mockConn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await service.create({ name: 'Engineering' } as any, mockUser);

      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE departments SET'),
        ['Engineering', 'Engineering'],
      );
      expect(result.name).toBe('Engineering');
    });

    it('creates a new department and returns it', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query
        .mockResolvedValueOnce([[]])               // no existing dept
        .mockResolvedValueOnce([{ insertId: 1 }]); // INSERT

      mockFindOneConn.query.mockResolvedValueOnce([
        [{ id: 1, unique_id: 'dept-uid-1', name: 'Engineering', created_by: mockUser.email, status: 'Active' }],
      ]);

      const result = await service.create({ name: 'Engineering' } as any, mockUser);

      expect(result.name).toBe('Engineering');
      expect(result.created_by).toBe(mockUser.email);
      expect(mockConn.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO departments'),
        expect.arrayContaining([mockUser.email, 'Active']),
      );
    });
  });

  // ─── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated departments without search', async () => {
      const rows = [{ id: 1, name: 'Engineering' }];

      mockConn.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([rows]);

      const result = await service.findAll({ page: 1, limit: 10 } as any);

      expect(result.data).toEqual(rows);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 10, last_page: 1 });
    });

    it('returns paginated departments with search term', async () => {
      const rows = [{ id: 1, name: 'Engineering' }];

      mockConn.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([rows]);

      const result = await service.findAll({ page: 1, limit: 10, search: 'Eng' } as any);

      expect(result.data).toEqual(rows);
      expect(mockConn.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('WHERE'),
        ['%Eng%', '%Eng%'],
      );
    });

    it('applies default page and limit when omitted', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ total: 0 }]])
        .mockResolvedValueOnce([[]]);

      const result = await service.findAll({} as any);

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns department when found', async () => {
      const dept = { id: 1, unique_id: 'dept-uid-1', name: 'Engineering' };

      mockConn.query.mockResolvedValueOnce([[dept]]);

      const result = await service.findOne('dept-uid-1');

      expect(result).toEqual(dept);
      expect(mockConn.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE unique_id = ?'),
        ['dept-uid-1'],
      );
    });

    it('throws NotFoundException when not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.findOne('uid-missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── findByUniqueId ──────────────────────────────────────────────────────────

  describe('findByUniqueId', () => {
    it('returns department by unique_id', async () => {
      const dept = { id: 1, unique_id: 'dept-uid-1', name: 'Engineering' };

      mockConn.query.mockResolvedValueOnce([[dept]]);

      const result = await service.findByUniqueId('dept-uid-1');

      expect(result).toEqual(dept);
    });

    it('throws NotFoundException when not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.findByUniqueId('uid-missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('throws NotFoundException when department not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.update('uid-missing', { name: 'HR' } as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns existing department unchanged when dto is empty', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query.mockResolvedValueOnce([[{ unique_id: 'dept-uid-1' }]]);
      mockFindOneConn.query.mockResolvedValueOnce([
        [{ id: 1, unique_id: 'dept-uid-1', name: 'Engineering' }],
      ]);

      const result = await service.update('dept-uid-1', {} as any);

      expect(result.name).toBe('Engineering');
      expect(mockConn.execute).not.toHaveBeenCalled();
    });

    it('updates department fields and returns updated department', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query.mockResolvedValueOnce([[{ unique_id: 'dept-uid-1' }]]);
      mockConn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockFindOneConn.query.mockResolvedValueOnce([
        [{ id: 1, unique_id: 'dept-uid-1', name: 'HR' }],
      ]);

      const result = await service.update('dept-uid-1', { name: 'HR' } as any);

      expect(result.name).toBe('HR');
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE departments SET'),
        expect.arrayContaining(['HR', 'dept-uid-1']),
      );
    });
  });

  // ─── remove ──────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('throws NotFoundException when department not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.remove('uid-missing')).rejects.toThrow(NotFoundException);
    });

    it('soft-deletes department and returns confirmation message', async () => {
      mockConn.query.mockResolvedValueOnce([[{ unique_id: 'dept-uid-1' }]]);
      mockConn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await service.remove('dept-uid-1');

      expect(result).toEqual({ message: 'Department dept-uid-1 deleted successfully' });
      expect(mockConn.execute).toHaveBeenCalledWith(
        'UPDATE departments SET status = "Deleted" WHERE unique_id = ?',
        ['dept-uid-1'],
      );
    });
  });
});