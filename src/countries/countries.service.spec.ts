import { CountriesService } from './countries.service';
import { ConflictException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

describe('CountriesService', () => {
  let service: CountriesService;
  const mockPool: any = { getConnection: jest.fn() };
  const mockConn: any = {
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

  describe('create', () => {
    it('reactivates existing country instead of creating duplicate', async () => {
      // existing country found
      mockConn.query.mockResolvedValueOnce([[{ id: 5 }]]);
      // execute for UPDATE
      mockConn.execute.mockResolvedValueOnce([{}]);
      // findOne call inside create — getConnection again
      mockPool.getConnection.mockResolvedValueOnce(mockConn);
      mockConn.query.mockResolvedValueOnce([[{ id: 5, name: 'Nigeria', unique_id: 'abc', created_by: 'test@mercycorps.org', created_at: new Date() }]]);

      const result = await service.create({ name: 'Nigeria' } as any, mockUser);
      expect(result.id).toBe(5);
      expect(mockConn.execute).toHaveBeenCalledWith(
        'UPDATE countries SET status = "Active" WHERE id = ?',
        [5],
      );
    });

    it('creates a new country when none exists', async () => {
      // no existing country
      mockConn.query.mockResolvedValueOnce([[]]);
      // INSERT result
      mockConn.query.mockResolvedValueOnce([{ insertId: 10 }]);
      // findOne call — getConnection again
      mockPool.getConnection.mockResolvedValueOnce(mockConn);
      mockConn.query.mockResolvedValueOnce([[{ id: 10, name: 'Ghana', unique_id: 'xyz', created_by: 'test@mercycorps.org', created_at: new Date() }]]);

      const result = await service.create({ name: 'Ghana' } as any, mockUser);
      expect(result.id).toBe(10);
      expect(result.name).toBe('Ghana');
    });
  });

  describe('findOne', () => {
    it('returns country when found', async () => {
      const country = { id: 1, name: 'Nigeria', unique_id: 'abc', created_by: 'test@mercycorps.org', created_at: new Date() };
      mockConn.query.mockResolvedValueOnce([[country]]);
      const result = await service.findOne(1);
      expect(result).toEqual(country);
    });

    it('throws NotFoundException when not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);
      await expect(service.findOne(1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByUniqueId', () => {
    it('returns country when found', async () => {
      const country = { id: 1, name: 'Nigeria', unique_id: 'abc123' };
      mockConn.query.mockResolvedValueOnce([[country]]);
      const result = await service.findByUniqueId('abc123');
      expect(result).toEqual(country);
    });

    it('throws NotFoundException when not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);
      await expect(service.findByUniqueId('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('throws NotFoundException when country does not exist', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);
      await expect(service.update(1, { name: 'Updated' })).rejects.toThrow(NotFoundException);
    });

    it('returns existing country when no fields to update', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]);
      mockPool.getConnection.mockResolvedValueOnce(mockConn);
      mockConn.query.mockResolvedValueOnce([[{ id: 1, name: 'Nigeria' }]]);
      const result = await service.update(1, {});
      expect(result.id).toBe(1);
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when country does not exist', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);
      await expect(service.remove(1)).rejects.toThrow(NotFoundException);
    });

    it('deactivates country successfully', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]);
      mockConn.execute.mockResolvedValueOnce([{}]);
      const result = await service.remove(1);
      expect(result).toEqual({ message: 'Country 1 deactivated successfully' });
    });
  });
});