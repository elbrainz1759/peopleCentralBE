import { CheckListItemsService } from './check-list-items.service';
import { ConflictException, InternalServerErrorException, NotFoundException } from '@nestjs/common';

describe('CheckListItemsService', () => {
  let service: CheckListItemsService;
  const mockPool: any = { getConnection: jest.fn() };
  const mockConn: any = { query: jest.fn(), execute: jest.fn(), release: jest.fn() };

  beforeEach(() => {
    jest.resetAllMocks();
    mockPool.getConnection.mockResolvedValue(mockConn);
    service = new CheckListItemsService(mockPool as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('conflicts when duplicate in department', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]);
      await expect(service.create({ name: 'a', departmentId: 'd' } as any)).rejects.toThrow(ConflictException);
    });
    it('throws when department not found', async () => {
      mockConn.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);
      await expect(service.create({ name: 'a', departmentId: 'd' } as any)).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('findOne', () => {
    it('not found', async () => {
      mockConn.query.mockResolvedValue([[]]);
      await expect(service.findOne(1)).rejects.toThrow(NotFoundException);
    });
  });
});
