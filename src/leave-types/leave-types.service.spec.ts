import { LeaveTypesService } from './leave-types.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('LeaveTypesService', () => {
  let service: LeaveTypesService;
  const mockPool: any = { getConnection: jest.fn() };
  const mockConn: any = {
    query: jest.fn(),
    execute: jest.fn(),
    release: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    mockPool.getConnection.mockResolvedValue(mockConn);
    service = new LeaveTypesService(mockPool as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('throws on duplicate name', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]);
      await expect(
        service.create({ name: 'a', description: '', country: '' } as any),
      ).rejects.toThrow(ConflictException);
    });
    it('inserts and returns record', async () => {
      mockConn.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 7 }]);
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 7 } as any);
      const res = await service.create({
        name: 'a',
        description: '',
        country: '',
      } as any);
      expect(res.id).toBe(7);
    });
  });

  describe('findAll', () => {
    it('returns correct pagination', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[{ id: 1 }]]);
      const r = await service.findAll({ page: 1, limit: 5 } as any);
      expect(r.meta.total).toBe(1);
      expect(r.data[0].id).toBe(1);
    });
  });

  describe('findOne', () => {
    it('errors when not found', async () => {
      mockConn.query.mockResolvedValue([[]]);
      await expect(service.findOne(1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('errors when missing', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);
      await expect(service.update(1, {} as any)).rejects.toThrow(
        NotFoundException,
      );
    });
    it('returns unchanged when dto empty', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]);
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1 } as any);
      const res = await service.update(1, {} as any);
      expect(res.id).toBe(1);
    });
  });

  describe('remove', () => {
    it('throws if not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);
      await expect(service.remove(2)).rejects.toThrow(NotFoundException);
    });
  });
});
