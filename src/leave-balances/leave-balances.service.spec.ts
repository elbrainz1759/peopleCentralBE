import { LeaveBalancesService } from './leave-balances.service';
import { InternalServerErrorException } from '@nestjs/common';

describe('LeaveBalancesService', () => {
  let service: LeaveBalancesService;
  const mockPool: any = { getConnection: jest.fn() };
  const mockConn: any = {
    query: jest.fn(),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    mockPool.getConnection.mockResolvedValue(mockConn);
    service = new LeaveBalancesService(mockPool as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('bulkUpload', () => {
    it('skips existing entries and counts created', async () => {
      mockConn.query
        .mockResolvedValueOnce([[]]) // no existing
        .mockResolvedValueOnce([{ insertId: 2 }]) // insert
        .mockResolvedValueOnce([{}]); // transaction log
      const dto: any = { balances: [{ staffId: 1, leaveTypeId: 1, totalHours: 5 }] };
      mockConn.beginTransaction.mockResolvedValue(undefined);
      mockConn.commit.mockResolvedValue(undefined);
      const res = await service.bulkUpload(dto);
      expect(res).toEqual({ created: 1, skipped: 0 });
    });

    it('rolls back on error', async () => {
      mockConn.beginTransaction.mockResolvedValue(undefined);
      mockConn.query.mockRejectedValue(new Error('oops'));
      const dto: any = { balances: [{ staffId: 1, leaveTypeId: 1, totalHours: 5 }] };
      await expect(service.bulkUpload(dto)).rejects.toThrow(InternalServerErrorException);
      expect(mockConn.rollback).toHaveBeenCalled();
    });
  });

  describe('monthlyAccrue', () => {
    it('returns 0 when no balances', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);
      const result = await service.monthlyAccrue({ leave_type_id: 1, hours_to_accrue: 2, created_by: 'x' } as any);
      expect(result).toEqual({ accrued: 0 });
    });
  });

  describe('findByStaff', () => {
    it('returns rows', async () => {
      mockConn.query.mockResolvedValue([[{ id: 1 }]]);
      expect(await service.findByStaff(5)).toEqual([{ id: 1 }]);
    });
  });

  describe('findTransactionsByStaff', () => {
    it('returns paginated transactions', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ total: 3 }]])
        .mockResolvedValueOnce([[{ id: 1 }, { id: 2 }]]);
      const r = await service.findTransactionsByStaff(1, 1, 10);
      expect(r.meta.total).toBe(3);
      expect(r.data.length).toBe(2);
    });
  });
});
