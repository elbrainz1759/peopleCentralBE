import {
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { DepartmentsService } from './departments.service';

describe('DepartmentsService', () => {
  let service: DepartmentsService;
  const mockPool: any = { getConnection: jest.fn() };
  const mockConn: any = {
    query: jest.fn(),
    execute: jest.fn(),
    release: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    mockPool.getConnection.mockResolvedValue(mockConn);
    mockConn.release.mockResolvedValue(undefined);
    service = new DepartmentsService(mockPool as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // -------------------------------------------------------------------------
  describe('create', () => {
    const dto: any = { name: 'Engineering' };
    const savedRow = {
      id: 1,
      unique_id: 'abc123',
      name: 'Engineering',
      created_by: 'admin@example.com',
      created_at: new Date(),
    };

    it('creates a department and returns the saved record', async () => {
      mockConn.query
        .mockResolvedValueOnce([[]])                      // no conflict
        .mockResolvedValueOnce([{ insertId: 1 }])        // INSERT
        .mockResolvedValueOnce([[savedRow]]);             // findOne SELECT

      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)   // create() connection
        .mockResolvedValueOnce(mockConn);  // findOne() connection

      const result = await service.create(dto, 'admin@example.com');

      expect(result).toEqual(savedRow);
      expect(mockConn.release).toHaveBeenCalledTimes(2);

      const insertCall = mockConn.query.mock.calls[1];
      expect(insertCall[1]).toContain('admin@example.com');
    });

    it('defaults createdBy to "System" when not provided', async () => {
      mockConn.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 2 }])
        .mockResolvedValueOnce([[{ ...savedRow, created_by: 'System' }]]);

      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockConn);

      await service.create(dto);

      const insertCall = mockConn.query.mock.calls[1];
      expect(insertCall[1]).toContain('System');
    });

    it('throws ConflictException when department name already exists', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]); // conflict found

      await expect(service.create(dto, 'admin@example.com')).rejects.toThrow(
        ConflictException,
      );
      expect(mockConn.release).toHaveBeenCalled();
    });

    it('throws InternalServerErrorException on unexpected db error', async () => {
      mockConn.query.mockRejectedValueOnce(new Error('db failure'));

      await expect(service.create(dto, 'admin@example.com')).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(mockConn.release).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe('findAll', () => {
    const rows = [
      { id: 1, name: 'Engineering' },
      { id: 2, name: 'HR' },
    ];

    it('returns paginated result with defaults (page=1, limit=10)', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ total: 2 }]])   // COUNT
        .mockResolvedValueOnce([rows]);             // SELECT

      const result = await service.findAll({});

      expect(result).toEqual({
        data: rows,
        meta: { total: 2, page: 1, limit: 10, last_page: 1 },
      });
      expect(mockConn.release).toHaveBeenCalled();
    });

    it('applies page and limit correctly', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ total: 25 }]])
        .mockResolvedValueOnce([rows]);

      const result = await service.findAll({ page: 2, limit: 5 });

      expect(result.meta).toEqual({
        total: 25,
        page: 2,
        limit: 5,
        last_page: 5,
      });

      // OFFSET should be (2-1)*5 = 5
      const selectCall = mockConn.query.mock.calls[1];
      expect(selectCall[1]).toContain(5); // offset
    });

    it('applies search filter to both COUNT and SELECT queries', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[{ id: 1, name: 'Engineering' }]]);

      await service.findAll({ search: 'Eng' });

      const countSql = mockConn.query.mock.calls[0][0] as string;
      const selectSql = mockConn.query.mock.calls[1][0] as string;

      expect(countSql).toContain('WHERE name LIKE ? OR unique_id LIKE ?');
      expect(selectSql).toContain('WHERE name LIKE ? OR unique_id LIKE ?');

      const countParams = mockConn.query.mock.calls[0][1];
      expect(countParams).toEqual(['%Eng%', '%Eng%']);
    });

    it('returns empty data when no departments exist', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ total: 0 }]])
        .mockResolvedValueOnce([[]]);

      const result = await service.findAll({});

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(result.meta.last_page).toBe(0);
    });

    it('throws InternalServerErrorException on db error', async () => {
      mockConn.query.mockRejectedValueOnce(new Error('fail'));

      await expect(service.findAll({})).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(mockConn.release).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe('findOne', () => {
    const row = { id: 1, name: 'Engineering' };

    it('returns the department when found', async () => {
      mockConn.query.mockResolvedValueOnce([[row]]);

      const result = await service.findOne(1);

      expect(result).toEqual(row);
      const [sql, params] = mockConn.query.mock.calls[0];
      expect(sql).toContain('WHERE id = ?');
      expect(params).toEqual([1]);
    });

    it('throws NotFoundException when department does not exist', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
      expect(mockConn.release).toHaveBeenCalled();
    });

    it('throws InternalServerErrorException on db error', async () => {
      mockConn.query.mockRejectedValueOnce(new Error('fail'));

      await expect(service.findOne(1)).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(mockConn.release).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe('findByUniqueId', () => {
    const row = { id: 1, unique_id: 'abc123', name: 'Engineering' };

    it('returns the department when found', async () => {
      mockConn.query.mockResolvedValueOnce([[row]]);

      const result = await service.findByUniqueId('abc123');

      expect(result).toEqual(row);
      const [sql, params] = mockConn.query.mock.calls[0];
      expect(sql).toContain('WHERE unique_id = ?');
      expect(params).toEqual(['abc123']);
    });

    it('throws NotFoundException when unique_id does not exist', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.findByUniqueId('nope')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockConn.release).toHaveBeenCalled();
    });

    it('throws InternalServerErrorException on db error', async () => {
      mockConn.query.mockRejectedValueOnce(new Error('fail'));

      await expect(service.findByUniqueId('abc123')).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(mockConn.release).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe('update', () => {
    const existingRow = { id: 1, name: 'Engineering' };

    it('updates provided fields and returns the updated record', async () => {
      const updatedRow = { ...existingRow, name: 'Ops' };

      mockConn.query
        .mockResolvedValueOnce([[existingRow]])   // SELECT current
        .mockResolvedValueOnce([[updatedRow]]);   // findOne SELECT

      mockConn.execute.mockResolvedValueOnce([{}]); // UPDATE

      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)   // update() connection
        .mockResolvedValueOnce(mockConn);  // findOne() connection

      const result = await service.update(1, { name: 'Ops' });

      expect(result.name).toBe('Ops');

      const updateSql = mockConn.execute.mock.calls[0][0] as string;
      expect(updateSql).toContain('name = ?');
      expect(mockConn.release).toHaveBeenCalledTimes(2);
    });

    it('returns current record unchanged when dto has no fields', async () => {
      mockConn.query
        .mockResolvedValueOnce([[existingRow]])   // SELECT current
        .mockResolvedValueOnce([[existingRow]]);  // findOne SELECT

      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockConn);

      const result = await service.update(1, {});

      expect(mockConn.execute).not.toHaveBeenCalled();
      expect(result).toEqual(existingRow);
    });

    it('throws NotFoundException when department does not exist', async () => {
      mockConn.query.mockResolvedValueOnce([[]]); // not found

      await expect(service.update(999, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
      expect(mockConn.release).toHaveBeenCalled();
    });

    it('throws InternalServerErrorException on unexpected db error', async () => {
      mockConn.query.mockRejectedValueOnce(new Error('fail'));

      await expect(service.update(1, { name: 'X' })).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(mockConn.release).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe('remove', () => {
    it('deletes the department and returns confirmation message', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]); // exists check
      mockConn.execute.mockResolvedValueOnce([{}]);         // DELETE

      const result = await service.remove(1);

      expect(result).toEqual({ message: 'Department 1 deleted successfully' });

      const selectCall = mockConn.query.mock.calls[0];
      expect(selectCall[0]).toContain('WHERE id = ?');
      expect(selectCall[1]).toEqual([1]);

      const deleteSql = mockConn.execute.mock.calls[0][0] as string;
      expect(deleteSql).toContain('DELETE FROM departments WHERE id = ?');
    });

    it('throws NotFoundException when department does not exist', async () => {
      mockConn.query.mockResolvedValueOnce([[]]); // not found

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
      expect(mockConn.release).toHaveBeenCalled();
    });

    it('throws InternalServerErrorException on unexpected db error', async () => {
      mockConn.query.mockRejectedValueOnce(new Error('fail'));

      await expect(service.remove(1)).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(mockConn.release).toHaveBeenCalled();
    });
  });
});