import { ConflictException, NotFoundException } from '@nestjs/common';
import { RolesService } from './roles.service';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

describe('RolesService', () => {
  let service: RolesService;

  const mockPool: any = {
    getConnection: jest.fn(),
  };

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

  describe('create', () => {
    const dto: any = {
      name: 'Admin',
      description: 'Administrator role',
    };

    it('throws ConflictException when role name already exists', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]);

      await expect(service.create(dto, mockUser)).rejects.toThrow(
        ConflictException,
      );
    });

    it('creates role and returns it', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query.mockResolvedValueOnce([[]]);
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]);

      mockFindOneConn.query.mockResolvedValueOnce([
        [
          {
            id: 1,
            unique_id: 'role-uid-1',
            name: 'Admin',
            description: 'Administrator role',
            created_by: mockUser.email,
          },
        ],
      ]);

      const result = await service.create(dto, mockUser);

      expect(result.id).toBe(1);
      expect(result.name).toBe('Admin');
      expect(result.created_by).toBe(mockUser.email);
    });
  });

  describe('findAll', () => {
    it('returns paginated roles without search', async () => {
      const query: any = {
        page: 1,
        limit: 10,
      };

      const rows = [
        {
          id: 1,
          name: 'Admin',
          description: 'Administrator role',
        },
      ];

      mockConn.query.mockResolvedValueOnce([[{ total: 1 }]]);
      mockConn.query.mockResolvedValueOnce([rows]);

      const result = await service.findAll(query);

      expect(result.data).toEqual(rows);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        last_page: 1,
      });
    });

    it('returns paginated roles with search', async () => {
      const query: any = {
        page: 1,
        limit: 10,
        search: 'Admin',
      };

      const rows = [
        {
          id: 1,
          name: 'Admin',
          description: 'Administrator role',
        },
      ];

      mockConn.query.mockResolvedValueOnce([[{ total: 1 }]]);
      mockConn.query.mockResolvedValueOnce([rows]);

      const result = await service.findAll(query);

      expect(result.data).toEqual(rows);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('findOne', () => {
    it('returns role when found', async () => {
      const role = {
        id: 1,
        unique_id: 'role-uid-1',
        name: 'Admin',
      };

      mockConn.query.mockResolvedValueOnce([[role]]);

      const result = await service.findOne(1);

      expect(result).toEqual(role);
    });

    it('throws NotFoundException when role not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.findOne(1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByUniqueId', () => {
    it('returns role by unique id', async () => {
      const role = {
        id: 1,
        unique_id: 'role-uid-1',
        name: 'Admin',
      };

      mockConn.query.mockResolvedValueOnce([[role]]);

      const result = await service.findByUniqueId('role-uid-1');

      expect(result).toEqual(role);
    });

    it('throws NotFoundException when unique id not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.findByUniqueId('role-uid-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('throws NotFoundException when role not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(
        service.update(1, { name: 'HR Admin' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns existing role when no fields are provided', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]);

      mockFindOneConn.query.mockResolvedValueOnce([
        [
          {
            id: 1,
            unique_id: 'role-uid-1',
            name: 'Admin',
          },
        ],
      ]);

      const result = await service.update(1, {} as any);

      expect(result.id).toBe(1);
      expect(result.name).toBe('Admin');
    });

    it('updates role and returns updated role', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]);
      mockConn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

      mockFindOneConn.query.mockResolvedValueOnce([
        [
          {
            id: 1,
            unique_id: 'role-uid-1',
            name: 'HR Admin',
            description: 'Updated role',
          },
        ],
      ]);

      const result = await service.update(1, {
        name: 'HR Admin',
        description: 'Updated role',
      } as any);

      expect(result.name).toBe('HR Admin');
      expect(mockConn.execute).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when role not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.remove(1)).rejects.toThrow(NotFoundException);
    });

    it('deletes role and returns confirmation message', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]);
      mockConn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await service.remove(1);

      expect(result).toEqual({
        message: 'Role 1 deleted successfully',
      });

      expect(mockConn.execute).toHaveBeenCalledWith(
        'DELETE FROM roles WHERE id = ?',
        [1],
      );
    });
  });
});