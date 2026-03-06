import { ProgramsService } from './programs.service';
import { ConflictException, NotFoundException, InternalServerErrorException } from '@nestjs/common';

describe('ProgramsService', () => {
  let service: ProgramsService;
  const mockPool: any = { getConnection: jest.fn() };
  const mockConn: any = {
    query: jest.fn(),
    execute: jest.fn(),
    release: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    mockPool.getConnection.mockResolvedValue(mockConn);
    service = new ProgramsService(mockPool as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('throws when fund code already exists', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]);
      await expect(service.create({ name: 'x', fundCode: 123, startDate: 'a', endDate: 'b' } as any)).rejects.toThrow(ConflictException);
    });

    it('creates and returns program', async () => {
      mockConn.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 5 }]);
      // findOne called inside create
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 5, unique_id: 'u', name: 'x', fund_code: 123, start_date: 'a', end_date: 'b', created_by: 'System', created_at: new Date() } as any);
      const res = await service.create({ name: 'x', fundCode: 123, startDate: 'a', endDate: 'b' } as any);
      expect(res.id).toBe(5);
    });
  });

  describe('findAll', () => {
    it('returns paginated result', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ total: 2 }]])
        .mockResolvedValueOnce([[{ id: 1 }, { id: 2 }]]);
      const result = await service.findAll({ page: 1, limit: 10 } as any);
      expect(result.meta.total).toBe(2);
      expect(result.data.length).toBe(2);
    });
    it('handles search param', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ total: 0 }]])
        .mockResolvedValueOnce([[ ]]);
      await service.findAll({ search: 'abc' } as any);
      expect(mockConn.query).toHaveBeenCalledWith(expect.stringContaining('WHERE name LIKE'), expect.any(Array));
    });
  });

  describe('findOne', () => {
    it('throws when not found', async () => {
      mockConn.query.mockResolvedValue([[]]);
      await expect(service.findOne(1)).rejects.toThrow(NotFoundException);
    });
    it('returns program when found', async () => {
      const prog = { id: 1 };
      mockConn.query.mockResolvedValue([[prog]]);
      const res = await service.findOne(1);
      expect(res).toEqual(prog);
    });
  });

  describe('findByUniqueId', () => {
    it('throws when not exist', async () => {
      mockConn.query.mockResolvedValue([[]]);
      await expect(service.findByUniqueId('u')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('throws when missing', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);
      await expect(service.update(1, {} as any)).rejects.toThrow(NotFoundException);
    });
    it('returns existing when dto empty', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ id: 1 }]])
      ;
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1 } as any);
      const res = await service.update(1, {} as any);
      expect(res.id).toBe(1);
    });
  });

  describe('remove', () => {
    it('throws if not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);
      await expect(service.remove(1)).rejects.toThrow(NotFoundException);
    });
    it('deletes and returns message', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]);
      const res = await service.remove(1);
      expect(res).toEqual({ message: 'Program 1 deleted successfully' });
    });
  });
});
