import { ConflictException, NotFoundException } from '@nestjs/common';
import { CheckListItemsService } from './check-list-items.service';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

describe('CheckListItemsService', () => {
  let service: CheckListItemsService;

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
    email: 'admin@mc.org',
    role: 'Admin',
    unique_id: 'abc123',
    first_name: 'Admin',
    last_name: 'User',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    mockPool.getConnection.mockResolvedValue(mockConn);
    service = new CheckListItemsService(mockPool as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto: any = { name: 'Handover Docs', departmentId: 'dept-uid-1' };

    it('throws ConflictException when item exists and is Active', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1, status: 'Active' }]]);

      await expect(service.create(dto, mockUser)).rejects.toThrow(ConflictException);
    });

    it('restores a soft-deleted item and returns it', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query.mockResolvedValueOnce([[{ id: 1, unique_id: 'item-uid-1', status: 'Deleted' }]]);
      mockConn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockFindOneConn.query.mockResolvedValueOnce([
        [{ id: 1, unique_id: 'item-uid-1', name: 'Handover Docs', department: 'dept-uid-1', status: 'Active' }],
      ]);

      const result = await service.create(dto, mockUser);

      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE check_list_items SET'),
        [dto.name, dto.departmentId, dto.name, dto.departmentId],
      );
      expect(result.unique_id).toBe('item-uid-1');
    });

    it('throws NotFoundException when department does not exist', async () => {
      mockConn.query
        .mockResolvedValueOnce([[]])  // no existing item
        .mockResolvedValueOnce([[]]); // dept not found

      // NotFoundException is thrown inside create but caught and re-thrown —
      // service catch block only re-throws ConflictException; fix needed in service.
      // Until fixed, assert NotFoundException propagates (after service fix):
      await expect(service.create(dto, mockUser)).rejects.toThrow(NotFoundException);
    });

    it('creates a new item and returns it', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query
        .mockResolvedValueOnce([[]])               // no existing item
        .mockResolvedValueOnce([[{ id: 1 }]])      // dept found
        .mockResolvedValueOnce([{ insertId: 1 }]); // INSERT

      mockFindOneConn.query.mockResolvedValueOnce([
        [{ id: 1, unique_id: 'item-uid-1', name: 'Handover Docs', department: 'dept-uid-1', created_by: mockUser.email, status: 'Active' }],
      ]);

      const result = await service.create(dto, mockUser);

      expect(result.name).toBe('Handover Docs');
      expect(result.created_by).toBe(mockUser.email);
      expect(mockConn.query).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('INSERT INTO check_list_items'),
        expect.arrayContaining([dto.name, dto.departmentId, mockUser.email, 'Active']),
      );
    });
  });

  // ─── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated items without filters', async () => {
      const rows = [{ id: 1, name: 'Handover Docs', department: 'dept-uid-1' }];

      mockConn.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([rows]);

      const result = await service.findAll({ page: 1, limit: 10 } as any);

      expect(result.data).toEqual(rows);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 10, last_page: 1 });
    });

    it('filters by name when provided', async () => {
      const rows = [{ id: 1, name: 'Handover Docs' }];

      mockConn.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([rows]);

      await service.findAll({ page: 1, limit: 10, name: 'Handover' } as any);

      expect(mockConn.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('a.name LIKE ?'),
        ['%Handover%'],
      );
    });

    it('filters by departmentId when provided', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ total: 0 }]])
        .mockResolvedValueOnce([[]]);

      await service.findAll({ page: 1, limit: 10, departmentId: 'dept-uid-1' } as any);

      expect(mockConn.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('a.department = ?'),
        ['dept-uid-1'],
      );
    });

    it('always filters by active status', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ total: 0 }]])
        .mockResolvedValueOnce([[]]);

      await service.findAll({} as any);

      expect(mockConn.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('a.status = "Active"'),
        [],
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
    it('returns item when found', async () => {
      const item = { id: 1, unique_id: 'item-uid-1', name: 'Handover Docs' };

      mockConn.query.mockResolvedValueOnce([[item]]);

      const result = await service.findOne('item-uid-1');

      expect(result).toEqual(item);
      expect(mockConn.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE unique_id = ?'),
        ['item-uid-1'],
      );
    });

    it('throws NotFoundException when not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.findOne('uid-missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── findByUniqueId ──────────────────────────────────────────────────────────

  describe('findByUniqueId', () => {
    it('returns item by unique_id', async () => {
      const item = { id: 1, unique_id: 'item-uid-1', name: 'Handover Docs' };

      mockConn.query.mockResolvedValueOnce([[item]]);

      const result = await service.findByUniqueId('item-uid-1');

      expect(result).toEqual(item);
    });

    it('throws NotFoundException when not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.findByUniqueId('uid-missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('throws NotFoundException when item not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.update('uid-missing', { name: 'X' } as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns existing item unchanged when dto is empty', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query.mockResolvedValueOnce([[{ unique_id: 'item-uid-1' }]]);
      mockFindOneConn.query.mockResolvedValueOnce([
        [{ id: 1, unique_id: 'item-uid-1', name: 'Handover Docs' }],
      ]);

      const result = await service.update('item-uid-1', {} as any);

      expect(result.name).toBe('Handover Docs');
      expect(mockConn.execute).not.toHaveBeenCalled();
    });

    it('maps departmentId to department column and updates', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query.mockResolvedValueOnce([[{ unique_id: 'item-uid-1' }]]);
      mockConn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockFindOneConn.query.mockResolvedValueOnce([
        [{ id: 1, unique_id: 'item-uid-1', name: 'Handover Docs', department: 'dept-uid-2' }],
      ]);

      const result = await service.update('item-uid-1', { departmentId: 'dept-uid-2' } as any);

      expect(result.department).toBe('dept-uid-2');
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('department = ?'),
        expect.arrayContaining(['dept-uid-2', 'item-uid-1']),
      );
    });

    it('updates name and returns updated item', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query.mockResolvedValueOnce([[{ unique_id: 'item-uid-1' }]]);
      mockConn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockFindOneConn.query.mockResolvedValueOnce([
        [{ id: 1, unique_id: 'item-uid-1', name: 'Updated Docs' }],
      ]);

      const result = await service.update('item-uid-1', { name: 'Updated Docs' } as any);

      expect(result.name).toBe('Updated Docs');
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE check_list_items SET'),
        expect.arrayContaining(['Updated Docs', 'item-uid-1']),
      );
    });
  });

  // ─── remove ──────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('throws NotFoundException when item not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.remove('uid-missing')).rejects.toThrow(NotFoundException);
    });

    it('soft-deletes item and returns confirmation message', async () => {
      mockConn.query.mockResolvedValueOnce([[{ unique_id: 'item-uid-1' }]]);
      mockConn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await service.remove('item-uid-1');

      expect(result).toEqual({ message: 'Check list item item-uid-1 deleted successfully' });
      expect(mockConn.execute).toHaveBeenCalledWith(
        'UPDATE check_list_items SET status = "Deleted" WHERE unique_id = ?',
        ['item-uid-1'],
      );
    });
  });
});