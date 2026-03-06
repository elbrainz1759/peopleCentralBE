import { LocationsService } from './locations.service';
import { ConflictException, InternalServerErrorException, NotFoundException } from '@nestjs/common';

describe('LocationsService', () => {
  let service: LocationsService;
  const mockPool: any = { getConnection: jest.fn() };
  const mockConn: any = { query: jest.fn(), execute: jest.fn(), release: jest.fn() };

  beforeEach(() => {
    jest.resetAllMocks();
    mockPool.getConnection.mockResolvedValue(mockConn);
    service = new LocationsService(mockPool as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('throws conflict if name exists', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]);
      await expect(service.create({ name: 'a', countryId: 'c' } as any)).rejects.toThrow(ConflictException);
    });
    it('throws not found if country missing', async () => {
      mockConn.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);
      await expect(service.create({ name: 'a', countryId: 'c' } as any)).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('findAll', () => {
    it('returns empty pagination', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ total: 0 }]])
        .mockResolvedValueOnce([[]]);
      const r = await service.findAll({} as any);
      expect(r.meta.total).toBe(0);
    });
  });

  describe('findOne & findByUniqueId', () => {
    it('throws when not found', async () => {
      mockConn.query.mockResolvedValue([[]]);
      await expect(service.findOne(1)).rejects.toThrow(NotFoundException);
      await expect(service.findByUniqueId('u')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('throws not found when id missing on update', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);
      await expect(service.update(1, {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('throws when not present', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);
      await expect(service.remove(1)).rejects.toThrow(NotFoundException);
    });
  });
});
