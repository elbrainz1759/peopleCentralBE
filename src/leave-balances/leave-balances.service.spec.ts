import { LeaveBalancesService } from './leave-balances.service';
import { BadRequestException } from '@nestjs/common';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

describe('LeaveBalancesService', () => {
  let service: LeaveBalancesService;

  const mockPool: any = { getConnection: jest.fn() };
  const mockConn: any = {
    query: jest.fn(),
    execute: jest.fn(),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
  };

  const mockUser: RequestUser = {
    id: 1,
    email: 'hr@mercycorps.org',
    role: 'Admin',
    unique_id: 'abc123',
    first_name: 'HR',
    last_name: 'User',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    mockPool.getConnection.mockResolvedValue(mockConn);
    mockConn.beginTransaction.mockResolvedValue(undefined);
    mockConn.commit.mockResolvedValue(undefined);
    mockConn.rollback.mockResolvedValue(undefined);
    service = new LeaveBalancesService(mockPool as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('bulkUpload', () => {
    it('creates balances and skips existing ones', async () => {
      const dto = {
        balances: [
          { staffId: 1, leaveTypeId: 1, totalHours: 160 },
          { staffId: 2, leaveTypeId: 1, totalHours: 160 },
        ],
      };

      // staff 1 — no existing balance
      mockConn.query.mockResolvedValueOnce([[]]); // no existing
      mockConn.query.mockResolvedValueOnce([{ insertId: 10 }]); // INSERT balance
      mockConn.query.mockResolvedValueOnce([{}]); // INSERT transaction

      // staff 2 — already has balance
      mockConn.query.mockResolvedValueOnce([[{ id: 5 }]]); // existing found

      const result = await service.bulkUpload(dto as any, mockUser);
      expect(result).toEqual({ created: 1, skipped: 1 });
      expect(mockConn.commit).toHaveBeenCalled();
    });

    it('rolls back on error', async () => {
      mockConn.query.mockRejectedValueOnce(new Error('DB error'));
      await expect(
        service.bulkUpload({ balances: [{ staffId: 1, leaveTypeId: 1, totalHours: 80 }] } as any, mockUser),
      ).rejects.toThrow();
      expect(mockConn.rollback).toHaveBeenCalled();
    });
  });

  describe('monthlyAccrue', () => {
    it('throws BadRequestException when leave type has no accrual config', async () => {
      mockConn.query.mockResolvedValueOnce([[{ cnt: 0 }]]);
      await expect(service.monthlyAccrue(1, 'system')).rejects.toThrow(BadRequestException);
    });

    it('returns zero accrued when no balances found', async () => {
      mockConn.query.mockResolvedValueOnce([[{ cnt: 1 }]]); // type check passes
      mockConn.query.mockResolvedValueOnce([[]]); // no balances
      const result = await service.monthlyAccrue(1, 'system');
      expect(result).toEqual({ accrued: 0, skipped: 0 });
    });

    it('accrues hours for each balance', async () => {
      mockConn.query.mockResolvedValueOnce([[{ cnt: 1 }]]); // type check
      mockConn.query.mockResolvedValueOnce([[
        { balance_id: 1, staff_id: 1, monthly_accrual_hours: 13.33 },
        { balance_id: 2, staff_id: 2, monthly_accrual_hours: 13.33 },
      ]]);
      mockConn.query.mockResolvedValue([{}]); // UPDATE + INSERT for each

      const result = await service.monthlyAccrue(1, 'system');
      expect(result.accrued).toBe(2);
      expect(result.skipped).toBe(0);
      expect(mockConn.commit).toHaveBeenCalled();
    });

    it('skips balances with zero accrual rate', async () => {
      mockConn.query.mockResolvedValueOnce([[{ cnt: 1 }]]);
      mockConn.query.mockResolvedValueOnce([[
        { balance_id: 1, staff_id: 1, monthly_accrual_hours: 0 },
      ]]);

      const result = await service.monthlyAccrue(1, 'system');
      expect(result.accrued).toBe(0);
      expect(result.skipped).toBe(1);
    });
  });

  describe('rolloverYear', () => {
    it('returns zero when no closing balances found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]); // no closing balances
      const result = await service.rolloverYear(1, 'system');
      expect(result).toEqual({ rolled: 0, skipped: 0 });
    });

    it('skips already seeded new year balances', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1, staff_id: 1, remaining_hours: 100 }]]);
      mockConn.query.mockResolvedValueOnce([[{ id: 99 }]]); // new year already exists
      const result = await service.rolloverYear(1, 'system');
      expect(result).toEqual({ rolled: 0, skipped: 1 });
    });

    it('caps carryover at MAX_CARRYOVER_HOURS and seeds new balance', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1, staff_id: 1, remaining_hours: 200 }]]);
      mockConn.query.mockResolvedValueOnce([[]]); // no existing new year
      mockConn.query.mockResolvedValueOnce([{ insertId: 20 }]); // INSERT balance
      mockConn.query.mockResolvedValueOnce([{}]); // INSERT transaction

      const result = await service.rolloverYear(1, 'system');
      expect(result).toEqual({ rolled: 1, skipped: 0 });

      // Verify the INSERT used capped hours (80 not 200)
      const insertCall = mockConn.query.mock.calls[2];
      expect(insertCall[1]).toContain(80);
    });
  });

  describe('findByStaff', () => {
    it('returns leave balances for a staff member', async () => {
      const balances = [{ id: 1, staff_id: 1, leave_type_id: 1, total_hours: 160 }];
      mockConn.query.mockResolvedValueOnce([balances]);
      const result = await service.findByStaff(1);
      expect(result).toEqual(balances);
    });
  });

  describe('findTransactionsByStaff', () => {
    it('returns paginated transactions', async () => {
      mockConn.query.mockResolvedValueOnce([[{ total: 5 }]]);
      mockConn.query.mockResolvedValueOnce([[{ id: 1 }, { id: 2 }]]);
      const result = await service.findTransactionsByStaff(1, 1, 20);
      expect(result.meta.total).toBe(5);
      expect(result.data).toHaveLength(2);
    });
  });
});