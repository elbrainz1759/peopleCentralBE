import { LeaveBalancesService } from './leave-balances.service';
import {
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';

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
    mockConn.beginTransaction.mockResolvedValue(undefined);
    mockConn.commit.mockResolvedValue(undefined);
    mockConn.rollback.mockResolvedValue(undefined);
    mockConn.release.mockResolvedValue(undefined);
    service = new LeaveBalancesService(mockPool as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // -------------------------------------------------------------------------
  describe('bulkUpload', () => {
    const dto: any = {
      balances: [{ staffId: 1, leaveTypeId: 1, totalHours: 80 }],
    };

    it('creates a balance when none exists for staff + leaveType + year', async () => {
      mockConn.query
        .mockResolvedValueOnce([[]]) // uniqueness check → no existing row
        .mockResolvedValueOnce([{ insertId: 10 }]) // INSERT leave_balances
        .mockResolvedValueOnce([{}]); // INSERT leave_balance_transactions

      const result = await service.bulkUpload(dto);

      expect(result).toEqual({ created: 1, skipped: 0 });
      expect(mockConn.commit).toHaveBeenCalled();
      expect(mockConn.release).toHaveBeenCalled();
    });

    it('skips when a balance already exists for the current year', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 5 }]]); // uniqueness check → existing row found

      const result = await service.bulkUpload(dto);

      expect(result).toEqual({ created: 0, skipped: 1 });
      expect(mockConn.commit).toHaveBeenCalled();
    });

    it('handles multiple entries — mix of created and skipped', async () => {
      const multiDto: any = {
        balances: [
          { staffId: 1, leaveTypeId: 1, totalHours: 80 },
          { staffId: 2, leaveTypeId: 1, totalHours: 80 },
        ],
      };
      mockConn.query
        .mockResolvedValueOnce([[{ id: 5 }]]) // staff 1 → already exists
        .mockResolvedValueOnce([[]]) // staff 2 → no existing row
        .mockResolvedValueOnce([{ insertId: 11 }]) // INSERT leave_balances for staff 2
        .mockResolvedValueOnce([{}]); // INSERT transaction for staff 2

      const result = await service.bulkUpload(multiDto);

      expect(result).toEqual({ created: 1, skipped: 1 });
    });

    it('rolls back and throws InternalServerErrorException on unexpected error', async () => {
      mockConn.query.mockRejectedValue(new Error('db failure'));

      await expect(service.bulkUpload(dto)).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(mockConn.rollback).toHaveBeenCalled();
      expect(mockConn.release).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe('monthlyAccrue', () => {
    const leaveTypeId = 1;
    const createdBy = 'system-cron';

    it('returns { accrued: 0, skipped: 0 } when no balances exist for the year', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ cnt: 1 }]]) // accrual config exists
        .mockResolvedValueOnce([[]]); // no balance rows

      const result = await service.monthlyAccrue(leaveTypeId, createdBy);

      expect(result).toEqual({ accrued: 0, skipped: 0 });
      expect(mockConn.beginTransaction).not.toHaveBeenCalled();
    });

    it('accrues correct hours per staff using country-specific rate', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ cnt: 1 }]]) // config check
        .mockResolvedValueOnce([
          [{ balance_id: 10, staff_id: 1, monthly_accrual_hours: 10 }],
        ]) // balances
        .mockResolvedValueOnce([{}]) // UPDATE leave_balances
        .mockResolvedValueOnce([{}]); // INSERT transaction

      const result = await service.monthlyAccrue(leaveTypeId, createdBy);

      expect(result).toEqual({ accrued: 1, skipped: 0 });
      expect(mockConn.commit).toHaveBeenCalled();

      // Verify the UPDATE used the country-resolved rate (10hrs), not a DTO value
      const updateCall = mockConn.query.mock.calls[2];
      expect(updateCall[1]).toEqual([10, 10, 10]); // [hoursToAccrue, hoursToAccrue, balance_id]
    });

    it('skips staff whose country has no accrual rate configured', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ cnt: 1 }]])
        .mockResolvedValueOnce([
          [{ balance_id: 10, staff_id: 1, monthly_accrual_hours: null }],
        ]);

      const result = await service.monthlyAccrue(leaveTypeId, createdBy);

      expect(result).toEqual({ accrued: 0, skipped: 1 });
      expect(mockConn.commit).toHaveBeenCalled();
    });

    it('throws BadRequestException when leave type has no accrual config at all', async () => {
      mockConn.query.mockResolvedValueOnce([[{ cnt: 0 }]]); // no accrual config rows

      await expect(
        service.monthlyAccrue(leaveTypeId, createdBy),
      ).rejects.toThrow(BadRequestException);
      expect(mockConn.beginTransaction).not.toHaveBeenCalled();
    });

    it('rolls back and throws InternalServerErrorException on unexpected error', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ cnt: 1 }]])
        .mockResolvedValueOnce([
          [{ balance_id: 10, staff_id: 1, monthly_accrual_hours: 10 }],
        ])
        .mockRejectedValueOnce(new Error('db crash'));

      await expect(
        service.monthlyAccrue(leaveTypeId, createdBy),
      ).rejects.toThrow(InternalServerErrorException);
      expect(mockConn.rollback).toHaveBeenCalled();
      expect(mockConn.release).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe('rolloverYear', () => {
    const annualLeaveTypeId = 1;
    const createdBy = 'system-cron';

    it('returns { rolled: 0, skipped: 0 } when no closing-year balances exist', async () => {
      mockConn.query.mockResolvedValueOnce([[]]); // no closing balances

      const result = await service.rolloverYear(annualLeaveTypeId, createdBy);

      expect(result).toEqual({ rolled: 0, skipped: 0 });
      expect(mockConn.beginTransaction).not.toHaveBeenCalled();
    });

    it('seeds new-year balance capped at 80hrs', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ id: 1, staff_id: 1, remaining_hours: 120 }]]) // closing balance (120 > 80)
        .mockResolvedValueOnce([[]]) // no existing new-year row
        .mockResolvedValueOnce([{ insertId: 20 }]) // INSERT new balance
        .mockResolvedValueOnce([{}]); // INSERT transaction

      const result = await service.rolloverYear(annualLeaveTypeId, createdBy);

      expect(result).toEqual({ rolled: 1, skipped: 0 });

      // Verify the INSERT used 80 (capped), not 120
      const insertCall = mockConn.query.mock.calls[2];
      expect(insertCall[1]).toEqual(
        expect.arrayContaining([80]), // carryover capped at MAX_CARRYOVER_HOURS
      );
    });

    it('carries over exact hours when remaining is under the 80hr cap', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ id: 1, staff_id: 1, remaining_hours: 40 }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 21 }])
        .mockResolvedValueOnce([{}]);

      await service.rolloverYear(annualLeaveTypeId, createdBy);

      const insertCall = mockConn.query.mock.calls[2];
      expect(insertCall[1]).toEqual(expect.arrayContaining([40]));
    });

    it('skips staff who already have a new-year balance (idempotent)', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ id: 1, staff_id: 1, remaining_hours: 50 }]]) // closing balance
        .mockResolvedValueOnce([[{ id: 99 }]]); // new-year row already exists

      const result = await service.rolloverYear(annualLeaveTypeId, createdBy);

      expect(result).toEqual({ rolled: 0, skipped: 1 });
    });

    it('rolls back and throws InternalServerErrorException on unexpected error', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ id: 1, staff_id: 1, remaining_hours: 50 }]])
        .mockResolvedValueOnce([[]])
        .mockRejectedValueOnce(new Error('insert failed'));

      await expect(
        service.rolloverYear(annualLeaveTypeId, createdBy),
      ).rejects.toThrow(InternalServerErrorException);
      expect(mockConn.rollback).toHaveBeenCalled();
      expect(mockConn.release).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe('findByStaff', () => {
    it('returns balances for the current year', async () => {
      const fakeRows = [{ id: 1, leave_type_name: 'Annual Leave' }];
      mockConn.query.mockResolvedValueOnce([fakeRows]);

      const result = await service.findByStaff(5);

      expect(result).toEqual(fakeRows);

      // Verify the query includes a year filter
      const queryCall = mockConn.query.mock.calls[0];
      expect(queryCall[0]).toContain('lb.year = ?');
      expect(queryCall[1]).toContain(new Date().getFullYear());
    });

    it('throws InternalServerErrorException on db error', async () => {
      mockConn.query.mockRejectedValueOnce(new Error('fail'));

      await expect(service.findByStaff(5)).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(mockConn.release).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe('findTransactionsByStaff', () => {
    it('returns paginated transactions with correct meta', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ total: 3 }]])
        .mockResolvedValueOnce([[{ id: 1 }, { id: 2 }]]);

      const result = await service.findTransactionsByStaff(1, 1, 10);

      expect(result.meta).toEqual({
        total: 3,
        page: 1,
        limit: 10,
        last_page: 1,
      });
      expect(result.data).toHaveLength(2);
    });

    it('calculates last_page correctly across multiple pages', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ total: 45 }]])
        .mockResolvedValueOnce([[]]); // data not relevant here

      const result = await service.findTransactionsByStaff(1, 1, 20);

      expect(result.meta.last_page).toBe(3); // ceil(45/20)
    });

    it('throws InternalServerErrorException on db error', async () => {
      mockConn.query.mockRejectedValueOnce(new Error('fail'));

      await expect(service.findTransactionsByStaff(1, 1, 20)).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(mockConn.release).toHaveBeenCalled();
    });
  });
});
