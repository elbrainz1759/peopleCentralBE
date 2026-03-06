import { CountriesService } from './countries.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('CountriesService', () => {
  let service: CountriesService;
  const mockPool: any = { getConnection: jest.fn() };
  const mockConn: any = { query: jest.fn(), execute: jest.fn(), release: jest.fn() };

  beforeEach(() => {
    jest.resetAllMocks();
    mockPool.getConnection.mockResolvedValue(mockConn);
    service = new CountriesService(mockPool as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('errors on duplicate', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]);
      await expect(service.create({ name: 'X' } as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('findOne', () => {
    it('not found', async () => {
      mockConn.query.mockResolvedValue([[]]);
      await expect(service.findOne(1)).rejects.toThrow(NotFoundException);
    });
  });
});
