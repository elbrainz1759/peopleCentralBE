import { ConflictException, NotFoundException } from '@nestjs/common';
import { RolesService } from './roles.service';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

describe('RolesService', () => {
  let service: RolesService;

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
    service = new RolesService(mockPool as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto: any = { name: 'Admin', description: 'Administrator role' };

    it('throws ConflictException when role name already exists', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]);

      await expect(service.create(dto, mockUser)).rejects.toThrow(ConflictException);
    });

    it('creates role and returns it', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query
        .mockResolvedValueOnce([[]])               // no existing role
        .mockResolvedValueOnce([{ insertId: 1 }]); // INSERT

      mockFindOneConn.query.mockResolvedValueOnce([
        [
          {
            id: 1,
            unique_id: 'role-uid-1',
            name: 'Admin',
            description: 'Administrator role',
            created_by: mockUser.email,
            status: 'Active',
          },
        ],
      ]);

      const result = await service.create(dto, mockUser);

      expect(result.name).toBe('Admin');
      expect(result.created_by).toBe(mockUser.email);
      expect(mockConn.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO roles'),
        expect.arrayContaining([dto.name, dto.description, mockUser.email, 'Active']),
      );
    });
  });

  // ─── findAll ───────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated roles without search', async () => {
      const rows = [{ id: 1, name: 'Admin', description: 'Administrator role' }];

      mockConn.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([rows]);

      const result = await service.findAll({ page: 1, limit: 10 } as any);

      expect(result.data).toEqual(rows);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 10, last_page: 1 });
    });

    it('returns paginated roles with search term', async () => {
      const rows = [{ id: 1, name: 'Admin' }];

      mockConn.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([rows]);

      const result = await service.findAll({ page: 1, limit: 10, search: 'Admin' } as any);

      expect(result.data).toEqual(rows);
      expect(mockConn.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('WHERE'),
        ['%Admin%', '%Admin%'],
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

  // ─── findOne ───────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns role when found', async () => {
      const role = { id: 1, unique_id: 'role-uid-1', name: 'Admin' };

      mockConn.query.mockResolvedValueOnce([[role]]);

      const result = await service.findOne('role-uid-1');

      expect(result).toEqual(role);
      expect(mockConn.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE unique_id = ?'),
        ['role-uid-1'],
      );
    });

    it('throws NotFoundException when role not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.findOne('uid-missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── findByUniqueId ────────────────────────────────────────────────────────

  describe('findByUniqueId', () => {
    it('returns role by unique_id', async () => {
      const role = { id: 1, unique_id: 'role-uid-1', name: 'Admin' };

      mockConn.query.mockResolvedValueOnce([[role]]);

      const result = await service.findByUniqueId('role-uid-1');

      expect(result).toEqual(role);
    });

    it('throws NotFoundException when unique_id not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.findByUniqueId('uid-missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('throws NotFoundException when role not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.update('uid-missing', { name: 'HR Admin' } as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns existing role unchanged when dto is empty', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query.mockResolvedValueOnce([[{ unique_id: 'role-uid-1' }]]);
      mockFindOneConn.query.mockResolvedValueOnce([
        [{ id: 1, unique_id: 'role-uid-1', name: 'Admin' }],
      ]);

      const result = await service.update('role-uid-1', {} as any);

      expect(result.name).toBe('Admin');
      expect(mockConn.execute).not.toHaveBeenCalled();
    });

    it('updates role fields and returns updated role', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query.mockResolvedValueOnce([[{ unique_id: 'role-uid-1' }]]);
      mockConn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockFindOneConn.query.mockResolvedValueOnce([
        [{ id: 1, unique_id: 'role-uid-1', name: 'HR Admin', description: 'Updated role' }],
      ]);

      const result = await service.update('role-uid-1', {
        name: 'HR Admin',
        description: 'Updated role',
      } as any);

      expect(result.name).toBe('HR Admin');
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE roles SET'),
        expect.arrayContaining(['HR Admin', 'Updated role', 'role-uid-1']),
      );
    });
  });

  // ─── remove ────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('throws NotFoundException when role not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.remove('uid-missing')).rejects.toThrow(NotFoundException);
    });

    it('soft-deletes role and returns confirmation message', async () => {
      mockConn.query.mockResolvedValueOnce([[{ unique_id: 'role-uid-1' }]]);
      mockConn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await service.remove('role-uid-1');

      expect(result).toEqual({ message: 'Role role-uid-1 deleted successfully' });
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'Deleted'"),
        ['role-uid-1'],
      );
    });
  });
});