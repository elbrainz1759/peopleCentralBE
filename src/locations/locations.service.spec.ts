import {
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { LocationsService } from './locations.service';

describe('LocationsService', () => {
  let service: LocationsService;

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

  beforeEach(() => {
    jest.resetAllMocks();
    mockPool.getConnection.mockResolvedValue(mockConn);
    service = new LocationsService(mockPool as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto: any = { name: 'Abuja', countryId: 'country-uid-1' };

    it('throws ConflictException when location name exists and is Active', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1, status: 'Active' }]]);

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });

    it('restores a soft-deleted location and returns it', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ id: 1, status: 'Deleted' }]]) // name lookup
        .mockResolvedValueOnce([[{ id: 1, unique_id: 'loc-uid-1', name: 'Abuja', country: 'Nigeria', status: 'Active' }]]); // SELECT after UPDATE

      mockConn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await service.create(dto);

      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE locations SET country'),
        [dto.countryId, dto.name],
      );
      expect(result.name).toBe('Abuja');
      expect(result.status).toBe('Active');
    });

    it('throws NotFoundException when country does not exist', async () => {
      mockConn.query
        .mockResolvedValueOnce([[]])  // no existing location
        .mockResolvedValueOnce([[]]); // country not found

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    });

    it('creates a new location and returns it', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query
        .mockResolvedValueOnce([[]])                   // no existing location
        .mockResolvedValueOnce([[{ id: 1 }]])          // country found
        .mockResolvedValueOnce([{ insertId: 1 }]);     // INSERT

      mockFindOneConn.query.mockResolvedValueOnce([
        [{ id: 1, unique_id: 'loc-uid-1', name: 'Abuja', country: 'Nigeria', status: 'Active' }],
      ]);

      const result = await service.create(dto);

      expect(result.name).toBe('Abuja');
      expect(result.unique_id).toBe('loc-uid-1');
    });
  });

  // ─── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated locations without search', async () => {
      const rows = [{ id: 1, name: 'Abuja', country: 'Nigeria' }];

      mockConn.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([rows]);

      const result = await service.findAll({ page: 1, limit: 10 } as any);

      expect(result.data).toEqual(rows);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 10, last_page: 1 });
    });

    it('returns paginated locations with search term', async () => {
      const rows = [{ id: 1, name: 'Abuja', country: 'Nigeria' }];

      mockConn.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([rows]);

      const result = await service.findAll({ page: 1, limit: 10, search: 'Abuja' } as any);

      expect(result.data).toEqual(rows);
      expect(mockConn.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('WHERE'),
        ['%Abuja%', '%Abuja%'],
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
    it('returns location when found', async () => {
      const location = { id: 1, unique_id: 'loc-uid-1', name: 'Abuja', country: 'Nigeria' };

      mockConn.query.mockResolvedValueOnce([[location]]);

      const result = await service.findOne('loc-uid-1');

      expect(result).toEqual(location);
      expect(mockConn.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE a.unique_id = ?'),
        ['loc-uid-1'],
      );
    });

    it('throws NotFoundException when location not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.findOne('loc-missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── findByUniqueId ──────────────────────────────────────────────────────────

  describe('findByUniqueId', () => {
    it('returns location by unique_id', async () => {
      const location = { id: 1, unique_id: 'loc-uid-1', name: 'Abuja', country: 'Nigeria' };

      mockConn.query.mockResolvedValueOnce([[location]]);

      const result = await service.findByUniqueId('loc-uid-1');

      expect(result).toEqual(location);
    });

    it('throws NotFoundException when unique_id not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.findByUniqueId('loc-missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('throws NotFoundException when location not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.update('loc-missing', { name: 'Lagos' } as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns existing location unchanged when dto is empty', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query.mockResolvedValueOnce([[{ unique_id: 'loc-uid-1' }]]);
      mockFindOneConn.query.mockResolvedValueOnce([
        [{ id: 1, unique_id: 'loc-uid-1', name: 'Abuja', country: 'Nigeria' }],
      ]);

      const result = await service.update('loc-uid-1', {} as any);

      expect(result.name).toBe('Abuja');
      expect(mockConn.execute).not.toHaveBeenCalled();
    });

    it('updates fields and returns updated location', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query.mockResolvedValueOnce([[{ unique_id: 'loc-uid-1' }]]);
      mockConn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockFindOneConn.query.mockResolvedValueOnce([
        [{ id: 1, unique_id: 'loc-uid-1', name: 'Lagos', country: 'Nigeria' }],
      ]);

      const result = await service.update('loc-uid-1', { name: 'Lagos' } as any);

      expect(result.name).toBe('Lagos');
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE locations SET'),
        expect.arrayContaining(['Lagos', 'loc-uid-1']),
      );
    });
  });

  // ─── remove ──────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('throws NotFoundException when location not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.remove('loc-missing')).rejects.toThrow(NotFoundException);
    });

    it('soft-deletes location and returns confirmation message', async () => {
      mockConn.query.mockResolvedValueOnce([[{ unique_id: 'loc-uid-1' }]]);
      mockConn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await service.remove('loc-uid-1');

      expect(result).toEqual({ message: 'Location loc-uid-1 deleted successfully' });
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining("SET status='Deleted'"),
        ['loc-uid-1'],
      );
    });
  });
});