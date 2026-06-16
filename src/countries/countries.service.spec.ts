import { NotFoundException } from '@nestjs/common';
import { CountriesService } from './countries.service';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

describe('CountriesService', () => {
  let service: CountriesService;

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
    email: 'test@mercycorps.org',
    role: 'Admin',
    unique_id: 'abc123',
    first_name: 'Test',
    last_name: 'User',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    mockPool.getConnection.mockResolvedValue(mockConn);
    service = new CountriesService(mockPool as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('reactivates existing country and returns it', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query.mockResolvedValueOnce([[{ unique_id: 'uid-1' }]]); // name lookup → found
      mockConn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);    // UPDATE status Active

      mockFindOneConn.query.mockResolvedValueOnce([
        [{ id: 1, unique_id: 'uid-1', name: 'Nigeria', created_by: mockUser.email, status: 'Active' }],
      ]);

      const result = await service.create({ name: 'Nigeria' } as any, mockUser);

      expect(mockConn.execute).toHaveBeenCalledWith(
        'UPDATE countries SET status = "Active" WHERE unique_id = ?',
        ['uid-1'],
      );
      expect(result.unique_id).toBe('uid-1');
      expect(result.name).toBe('Nigeria');
    });

    it('creates a new country when none exists', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query
        .mockResolvedValueOnce([[]])               // no existing country
        .mockResolvedValueOnce([{ insertId: 1 }]); // INSERT

      mockFindOneConn.query.mockResolvedValueOnce([
        [{ id: 1, unique_id: 'uid-new', name: 'Ghana', created_by: mockUser.email, status: 'Active' }],
      ]);

      const result = await service.create({ name: 'Ghana' } as any, mockUser);

      expect(result.name).toBe('Ghana');
      expect(result.unique_id).toBe('uid-new');
      // INSERT should use normalizedName and user email
      expect(mockConn.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO countries'),
        expect.arrayContaining(['Ghana', mockUser.email, 'Active']),
      );
    });

    it('trims whitespace from name before lookup and insert', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 1 }]);

      mockFindOneConn.query.mockResolvedValueOnce([
        [{ id: 1, unique_id: 'uid-new', name: 'Ghana', created_by: mockUser.email }],
      ]);

      await service.create({ name: '  Ghana  ' } as any, mockUser);

      expect(mockConn.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('LOWER(TRIM(name))'),
        ['Ghana'], // trimmed
      );
    });
  });

  // ─── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated countries without search', async () => {
      const rows = [{ id: 1, unique_id: 'uid-1', name: 'Nigeria' }];

      mockConn.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([rows]);

      const result = await service.findAll({ page: 1, limit: 10 } as any);

      expect(result.data).toEqual(rows);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 10, last_page: 1 });
    });

    it('returns paginated countries with search term', async () => {
      const rows = [{ id: 1, unique_id: 'uid-1', name: 'Nigeria' }];

      mockConn.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([rows]);

      const result = await service.findAll({ page: 1, limit: 10, search: 'Nigeria' } as any);

      expect(result.data).toEqual(rows);
      expect(mockConn.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('WHERE'),
        ['%Nigeria%', '%Nigeria%'],
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
    it('returns country when found', async () => {
      const country = { id: 1, unique_id: 'uid-1', name: 'Nigeria' };

      mockConn.query.mockResolvedValueOnce([[country]]);

      const result = await service.findOne('uid-1');

      expect(result).toEqual(country);
      expect(mockConn.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE unique_id = ?'),
        ['uid-1'],
      );
    });

    it('throws NotFoundException when not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.findOne('uid-missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── findByUniqueId ──────────────────────────────────────────────────────────

  describe('findByUniqueId', () => {
    it('returns country by unique_id', async () => {
      const country = { id: 1, unique_id: 'uid-1', name: 'Nigeria' };

      mockConn.query.mockResolvedValueOnce([[country]]);

      const result = await service.findByUniqueId('uid-1');

      expect(result).toEqual(country);
    });

    it('throws NotFoundException when not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.findByUniqueId('uid-missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('throws NotFoundException when country does not exist', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.update('uid-missing', { name: 'Updated' } as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns existing country unchanged when dto is empty', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query.mockResolvedValueOnce([[{ unique_id: 'uid-1' }]]);
      mockFindOneConn.query.mockResolvedValueOnce([
        [{ id: 1, unique_id: 'uid-1', name: 'Nigeria' }],
      ]);

      const result = await service.update('uid-1', {} as any);

      expect(result.name).toBe('Nigeria');
      expect(mockConn.execute).not.toHaveBeenCalled();
    });

    it('updates country fields and returns updated country', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query.mockResolvedValueOnce([[{ unique_id: 'uid-1' }]]);
      mockConn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockFindOneConn.query.mockResolvedValueOnce([
        [{ id: 1, unique_id: 'uid-1', name: 'Updated Nigeria' }],
      ]);

      const result = await service.update('uid-1', { name: 'Updated Nigeria' } as any);

      expect(result.name).toBe('Updated Nigeria');
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE countries SET'),
        expect.arrayContaining(['Updated Nigeria', 'uid-1']),
      );
    });
  });

  // ─── remove ──────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('throws NotFoundException when country does not exist', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.remove('uid-missing')).rejects.toThrow(NotFoundException);
    });

    it('soft-deletes country and returns confirmation message', async () => {
      mockConn.query.mockResolvedValueOnce([[{ unique_id: 'uid-1' }]]);
      mockConn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await service.remove('uid-1');

      expect(result).toEqual({ message: 'Country uid-1 deleted successfully' });
      expect(mockConn.execute).toHaveBeenCalledWith(
        'UPDATE countries SET status = "Deleted" WHERE unique_id = ?',
        ['uid-1'],
      );
    });
  });
});