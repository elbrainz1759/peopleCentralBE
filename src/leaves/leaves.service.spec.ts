import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LeavesService } from './leaves.service';
import { MailService } from 'src/mail/mail.service';
import * as leaveHoursUtil from '../utils/leave-hours.util';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const POOL_TOKEN = 'MYSQL_POOL';

const mockUser = { email: 'staff@mercycorps.org', id: 10, role: 'staff' };

const mockLeaveRow = {
  id: 1,
  unique_id: 'abc123',
  staff_id: 10,
  leave_type_id: 'lt-uid-001',
  leave_type_name: 'Annual Leave',
  reason: 'Vacation',
  handover_note: 'John covers',
  total_hours: 40,
  status: 'Pending',
  created_by: 'staff@mercycorps.org',
  created_at: new Date('2026-01-10'),
  reviewed_by: null,
  approved_by: null,
  rejected_by: null,
  cancelled_by: null,
};

const mockDurationRow = {
  id: 1,
  leave_id: 1,
  start_date: '2026-02-03',
  end_date: '2026-02-07',
  hours: 40,
};

const mockLeave = { ...mockLeaveRow, durations: [mockDurationRow] };

// ─── Connection mock factory ──────────────────────────────────────────────────
// Each test can override individual query responses via conn.query.mockResolvedValueOnce().

function makeConn(defaultRows: unknown[][] = []) {
  let callIndex = 0;
  const query = jest.fn().mockImplementation(() => {
    const response = defaultRows[callIndex] ?? [[]];
    callIndex++;
    return Promise.resolve(response);
  });

  return {
    query,
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit:           jest.fn().mockResolvedValue(undefined),
    rollback:         jest.fn().mockResolvedValue(undefined),
    release:          jest.fn(),
  };
}

function makePool(conn: ReturnType<typeof makeConn>) {
  return { getConnection: jest.fn().mockResolvedValue(conn) };
}

// ─── Mail mock ────────────────────────────────────────────────────────────────

const mockMailService = {
  sendCaseNotification: jest.fn().mockResolvedValue(undefined),
  sendToMany:           jest.fn().mockResolvedValue(undefined),
};

// ─── Helper: build a TestingModule with a custom pool ─────────────────────────

async function buildModule(pool: ReturnType<typeof makePool>) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      LeavesService,
      { provide: POOL_TOKEN,   useValue: pool },
      { provide: MailService,  useValue: mockMailService },
    ],
  }).compile();

  return module.get<LeavesService>(LeavesService);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LeavesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(leaveHoursUtil, 'findInternalOverlap').mockReturnValue(null);
    jest.spyOn(leaveHoursUtil, 'rangesOverlap').mockReturnValue(false);
    jest.spyOn(leaveHoursUtil, 'calculateTotalHours').mockReturnValue(40);
    jest.spyOn(leaveHoursUtil, 'calculateHoursForRange').mockReturnValue(40);
  });

  // ── findOne ──────────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('returns a leave with its durations', async () => {
      const conn = makeConn([
        [[mockLeaveRow]],          // SELECT leaves + leave_types
        [[mockDurationRow]],       // SELECT leave_durations
      ]);
      const service = await buildModule(makePool(conn));

      const result = await service.findOne(1);

      expect(result.id).toBe(1);
      expect(result.durations).toHaveLength(1);
      expect(result.durations![0].start_date).toBe('2026-02-03');
    });

    it('throws NotFoundException when leave does not exist', async () => {
      const conn = makeConn([[[]]]);   // empty result
      const service = await buildModule(makePool(conn));

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });

    it('wraps unexpected DB error in InternalServerErrorException', async () => {
      const conn = makeConn();
      conn.query.mockRejectedValueOnce(new Error('DB down'));
      const service = await buildModule(makePool(conn));

      await expect(service.findOne(1)).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ── findAll ──────────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('returns paginated results with default page/limit', async () => {
      const conn = makeConn([
        [[[{ total: 1 }]]],           // COUNT(*)
        [[mockLeaveRow]],             // SELECT leaves
      ]);
      const service = await buildModule(makePool(conn));

      const result = await service.findAll({});

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
    });

    it('applies status filter', async () => {
      const conn = makeConn([
        [[[{ total: 0 }]]],
        [[]],
      ]);
      const service = await buildModule(makePool(conn));

      const result = await service.findAll({ status: 'Pending' });

      // Verify the WHERE clause was included — the query call contains 'Pending'
      const queryCall = conn.query.mock.calls[1];
      expect(JSON.stringify(queryCall)).toContain('Pending');
      expect(result.data).toHaveLength(0);
    });

    it('applies staffId filter', async () => {
      const conn = makeConn([
        [[[{ total: 1 }]]],
        [[mockLeaveRow]],
      ]);
      const service = await buildModule(makePool(conn));

      await service.findAll({ staffId: 10 });

      const queryCall = conn.query.mock.calls[1];
      expect(JSON.stringify(queryCall)).toContain('10');
    });
  });

  // ── create ───────────────────────────────────────────────────────────────────

  describe('create()', () => {
    const dto = {
      staffId:       10,
      leaveTypeId:   'lt-uid-001',
      reason:        'Vacation',
      handoverNote:  'John covers',
      leaveDuration: [{ startDate: '2026-02-03', endDate: '2026-02-07' }],
    };

    function buildCreateConn() {
      return makeConn([
        // validateAndComputeBalance
        [[{ country: 'NGA' }]],                           // employee country
        [[{ annual_hours: 160, monthly_accrual_hours: null }]], // config
        [[[{ used_hours: 0 }]]],                          // used hours
        // no overlap check
        [[]],                                             // existingDurations
        // INSERT leaves
        [[{ insertId: 1 }]],
        // INSERT leave_durations
        [[]],
        // findOne (after commit)
        [[mockLeaveRow]],
        [[mockDurationRow]],
        // email helpers
        [[{ staff_email: 'staff@mc.org', supervisor_email: 'sup@mc.org' }]],
        [[{ email: 'hr@mc.org' }]],
        [[[{ full_name: 'John Doe' }]]],
        [[[{ name: 'Annual Leave' }]]],
      ]);
    }

    it('creates a leave and returns it', async () => {
      const conn    = buildCreateConn();
      const service = await buildModule(makePool(conn));

      const result = await service.create(dto, mockUser as any);

      expect(conn.beginTransaction).toHaveBeenCalled();
      expect(conn.commit).toHaveBeenCalled();
      expect(result.id).toBe(1);
    });

    it('throws BadRequestException when internal date ranges overlap', async () => {
      jest.spyOn(leaveHoursUtil, 'findInternalOverlap').mockReturnValue({ a: 0, b: 1 });

      const conn    = makeConn();
      const service = await buildModule(makePool(conn));

      await expect(service.create(dto, mockUser as any)).rejects.toThrow(BadRequestException);
      expect(conn.beginTransaction).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when endDate is before startDate', async () => {
      jest.spyOn(leaveHoursUtil, 'findInternalOverlap').mockReturnValue(null);

      const badDto = {
        ...dto,
        leaveDuration: [{ startDate: '2026-02-07', endDate: '2026-02-03' }],
      };
      const conn    = makeConn();
      const service = await buildModule(makePool(conn));

      await expect(service.create(badDto, mockUser as any)).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when dates overlap an existing leave', async () => {
      jest.spyOn(leaveHoursUtil, 'rangesOverlap').mockReturnValue(true);

      const conn = makeConn([
        [[{ country: 'NGA' }]],
        [[{ annual_hours: 160, monthly_accrual_hours: null }]],
        [[[{ used_hours: 0 }]]],
        [[{ start_date: '2026-02-03', end_date: '2026-02-07' }]],  // existing duration
      ]);
      const service = await buildModule(makePool(conn));

      await expect(service.create(dto, mockUser as any)).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when total working hours is zero', async () => {
      jest.spyOn(leaveHoursUtil, 'calculateTotalHours').mockReturnValue(0);

      const conn = makeConn([
        [[{ country: 'NGA' }]],
        [[{ annual_hours: 160, monthly_accrual_hours: null }]],
        [[[{ used_hours: 0 }]]],
        [[]],
      ]);
      const service = await buildModule(makePool(conn));

      await expect(service.create(dto, mockUser as any)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when balance is insufficient', async () => {
      const conn = makeConn([
        [[{ country: 'NGA' }]],
        [[{ annual_hours: 10, monthly_accrual_hours: null }]],  // only 10 hrs allowed
        [[[{ used_hours: 0 }]]],
        [[]],
      ]);
      jest.spyOn(leaveHoursUtil, 'calculateTotalHours').mockReturnValue(40);
      const service = await buildModule(makePool(conn));

      await expect(service.create(dto, mockUser as any)).rejects.toThrow(BadRequestException);
    });

    it('rolls back on DB error during insert', async () => {
      const conn = makeConn([
        [[{ country: 'NGA' }]],
        [[{ annual_hours: 160, monthly_accrual_hours: null }]],
        [[[{ used_hours: 0 }]]],
        [[]],
      ]);
      conn.query
        .mockResolvedValueOnce([[{ country: 'NGA' }]])
        .mockResolvedValueOnce([[{ annual_hours: 160, monthly_accrual_hours: null }]])
        .mockResolvedValueOnce([[[{ used_hours: 0 }]]])
        .mockResolvedValueOnce([[]])
        .mockRejectedValueOnce(new Error('DB insert failed'));

      const service = await buildModule(makePool(conn));

      await expect(service.create(dto, mockUser as any)).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(conn.rollback).toHaveBeenCalled();
    });
  });

  // ── review ───────────────────────────────────────────────────────────────────

  describe('review()', () => {
    it('transitions Pending → Reviewed and returns updated leave', async () => {
      const reviewedRow = { ...mockLeaveRow, status: 'Reviewed' };
      const conn = makeConn([
        [[mockLeaveRow]],             // SELECT leave
        [[]],                         // UPDATE
        [[reviewedRow]],              // findOne — SELECT
        [[mockDurationRow]],          // findOne — durations
        // email helpers
        [[{ staff_email: 'staff@mc.org', supervisor_email: 'sup@mc.org' }]],
        [[{ email: 'hr@mc.org' }]],
        [[[{ full_name: 'John Doe' }]]],
        [[[{ name: 'Annual Leave' }]]],
      ]);
      const service = await buildModule(makePool(conn));

      const result = await service.review(1, 'hr@mercycorps.org');

      expect(result.status).toBe('Reviewed');
    });

    it('throws NotFoundException when leave does not exist', async () => {
      const conn    = makeConn([[[]]]); // empty
      const service = await buildModule(makePool(conn));

      await expect(service.review(999, 'hr@mc.org')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when leave is not Pending', async () => {
      const conn = makeConn([
        [[{ ...mockLeaveRow, status: 'Approved' }]],
      ]);
      const service = await buildModule(makePool(conn));

      await expect(service.review(1, 'hr@mc.org')).rejects.toThrow(BadRequestException);
    });
  });

  // ── approve ──────────────────────────────────────────────────────────────────

  describe('approve()', () => {
    function buildApproveConn(remainingHours = 80) {
      const reviewedRow  = { ...mockLeaveRow, status: 'Reviewed' };
      const approvedRow  = { ...mockLeaveRow, status: 'Approved' };
      const balanceRow   = { id: 5, remaining_hours: remainingHours };

      const conn = makeConn();
      conn.query
        // SELECT leave
        .mockResolvedValueOnce([[reviewedRow]])
        // BEGIN TRANSACTION (not a query)
        // SELECT leave_balances FOR UPDATE
        .mockResolvedValueOnce([[balanceRow]])
        // validateAndComputeBalance
        .mockResolvedValueOnce([[{ country: 'NGA' }]])
        .mockResolvedValueOnce([[{ annual_hours: 160, monthly_accrual_hours: null }]])
        .mockResolvedValueOnce([[[{ used_hours: 0 }]]])
        // UPDATE leaves
        .mockResolvedValueOnce([[]])
        // UPDATE leave_balances
        .mockResolvedValueOnce([[]])
        // INSERT leave_balance_transactions
        .mockResolvedValueOnce([[]])
        // findOne
        .mockResolvedValueOnce([[approvedRow]])
        .mockResolvedValueOnce([[mockDurationRow]])
        // email helpers
        .mockResolvedValueOnce([[{ staff_email: 'staff@mc.org', supervisor_email: null }]])
        .mockResolvedValueOnce([[{ email: 'hr@mc.org' }]])
        .mockResolvedValueOnce([[[{ full_name: 'John Doe' }]]])
        .mockResolvedValueOnce([[[{ name: 'Annual Leave' }]]]);

      return conn;
    }

    it('transitions Reviewed → Approved and deducts balance', async () => {
      const conn    = buildApproveConn(80);
      const service = await buildModule(makePool(conn));

      const result = await service.approve(1, 'supervisor@mc.org');

      expect(conn.beginTransaction).toHaveBeenCalled();
      expect(conn.commit).toHaveBeenCalled();
      expect(result.status).toBe('Approved');
    });

    it('throws NotFoundException when leave does not exist', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[]]); // empty
      const service = await buildModule(makePool(conn));

      await expect(service.approve(999, 'sup@mc.org')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when leave is not Reviewed', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[{ ...mockLeaveRow, status: 'Pending' }]]);
      const service = await buildModule(makePool(conn));

      await expect(service.approve(1, 'sup@mc.org')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when balance record not found', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ ...mockLeaveRow, status: 'Reviewed' }]])
        .mockResolvedValueOnce([[]]); // no balance row
      const service = await buildModule(makePool(conn));

      await expect(service.approve(1, 'sup@mc.org')).rejects.toThrow(BadRequestException);
      expect(conn.rollback).toHaveBeenCalled();
    });

    it('throws BadRequestException when remaining hours are insufficient (locked value)', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ ...mockLeaveRow, status: 'Reviewed', total_hours: 40 }]])
        .mockResolvedValueOnce([[{ id: 5, remaining_hours: 10 }]]); // only 10 hrs left
      const service = await buildModule(makePool(conn));

      await expect(service.approve(1, 'sup@mc.org')).rejects.toThrow(BadRequestException);
      expect(conn.rollback).toHaveBeenCalled();
    });

    it('rolls back on unexpected error and rethrows as InternalServerErrorException', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ ...mockLeaveRow, status: 'Reviewed' }]])
        .mockResolvedValueOnce([[{ id: 5, remaining_hours: 80 }]])
        .mockRejectedValueOnce(new Error('DB failure'));
      const service = await buildModule(makePool(conn));

      await expect(service.approve(1, 'sup@mc.org')).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(conn.rollback).toHaveBeenCalled();
    });
  });

  // ── reject ───────────────────────────────────────────────────────────────────

  describe('reject()', () => {
    it('rejects a Pending leave without touching the balance', async () => {
      const rejectedRow = { ...mockLeaveRow, status: 'Rejected' };
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[mockLeaveRow]])           // SELECT leave (Pending)
        .mockResolvedValueOnce([[]])                       // UPDATE leaves
        // no balance restore because it was Pending
        .mockResolvedValueOnce([[rejectedRow]])             // findOne SELECT
        .mockResolvedValueOnce([[mockDurationRow]])         // findOne durations
        .mockResolvedValueOnce([[{ staff_email: 'x@mc.org', supervisor_email: null }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[[{ full_name: 'John' }]]])
        .mockResolvedValueOnce([[[{ name: 'Annual Leave' }]]]);
      const service = await buildModule(makePool(conn));

      const result = await service.reject(1, 'hr@mc.org');

      expect(result.status).toBe('Rejected');
    });

    it('restores balance when rejecting an Approved leave', async () => {
      const approvedLeave = { ...mockLeaveRow, status: 'Approved', total_hours: 40 };
      const rejectedRow   = { ...mockLeaveRow, status: 'Rejected' };
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[approvedLeave]])           // SELECT leave
        .mockResolvedValueOnce([[]])                        // UPDATE leaves
        .mockResolvedValueOnce([[{ id: 5 }]])               // SELECT balance FOR UPDATE
        .mockResolvedValueOnce([[]])                        // UPDATE leave_balances (restore)
        .mockResolvedValueOnce([[]])                        // INSERT reversal transaction
        .mockResolvedValueOnce([[rejectedRow]])              // findOne SELECT
        .mockResolvedValueOnce([[mockDurationRow]])          // findOne durations
        .mockResolvedValueOnce([[{ staff_email: 'x@mc.org', supervisor_email: null }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[[{ full_name: 'John' }]]])
        .mockResolvedValueOnce([[[{ name: 'Annual Leave' }]]]);
      const service = await buildModule(makePool(conn));

      await service.reject(1, 'hr@mc.org');

      // 5th query call should be the UPDATE leave_balances (restore)
      const updateCall = conn.query.mock.calls[3][0] as string;
      expect(updateCall).toContain('remaining_hours = remaining_hours +');
    });

    it('throws NotFoundException when leave does not exist', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[]]); // empty
      const service = await buildModule(makePool(conn));

      await expect(service.reject(999, 'hr@mc.org')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when leave is already Rejected or Cancelled', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[{ ...mockLeaveRow, status: 'Cancelled' }]]);
      const service = await buildModule(makePool(conn));

      await expect(service.reject(1, 'hr@mc.org')).rejects.toThrow(BadRequestException);
    });
  });

  // ── cancel ───────────────────────────────────────────────────────────────────

  describe('cancel()', () => {
    it('cancels a Pending leave and writes audit record', async () => {
      const cancelledRow = { ...mockLeaveRow, status: 'Cancelled' };
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[mockLeaveRow]])              // SELECT leave (Pending)
        .mockResolvedValueOnce([[]])                          // UPDATE leaves
        .mockResolvedValueOnce([[]])                          // INSERT leave_cancellations
        .mockResolvedValueOnce([[cancelledRow]])               // findOne SELECT
        .mockResolvedValueOnce([[mockDurationRow]])            // findOne durations
        .mockResolvedValueOnce([[{ staff_email: 'x@mc.org', supervisor_email: 'sup@mc.org' }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[[{ full_name: 'John' }]]])
        .mockResolvedValueOnce([[[{ name: 'Annual Leave' }]]]);
      const service = await buildModule(makePool(conn));

      const result = await service.cancel(1, 'staff@mc.org', 'Change of plans');

      expect(conn.beginTransaction).toHaveBeenCalled();
      expect(conn.commit).toHaveBeenCalled();
      expect(result.status).toBe('Cancelled');
    });

    it('also cancels a Reviewed leave', async () => {
      const reviewedLeave = { ...mockLeaveRow, status: 'Reviewed' };
      const cancelledRow  = { ...mockLeaveRow, status: 'Cancelled' };
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[reviewedLeave]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[cancelledRow]])
        .mockResolvedValueOnce([[mockDurationRow]])
        .mockResolvedValueOnce([[{ staff_email: 'x@mc.org', supervisor_email: null }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[[{ full_name: 'John' }]]])
        .mockResolvedValueOnce([[[{ name: 'Annual Leave' }]]]);
      const service = await buildModule(makePool(conn));

      const result = await service.cancel(1, 'staff@mc.org');

      expect(result.status).toBe('Cancelled');
    });

    it('throws ForbiddenException when leave is Approved', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[{ ...mockLeaveRow, status: 'Approved' }]]);
      const service = await buildModule(makePool(conn));

      await expect(service.cancel(1, 'staff@mc.org')).rejects.toThrow(ForbiddenException);
      expect(conn.beginTransaction).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when leave is already Rejected', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[{ ...mockLeaveRow, status: 'Rejected' }]]);
      const service = await buildModule(makePool(conn));

      await expect(service.cancel(1, 'staff@mc.org')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when leave is already Cancelled', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[{ ...mockLeaveRow, status: 'Cancelled' }]]);
      const service = await buildModule(makePool(conn));

      await expect(service.cancel(1, 'staff@mc.org')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when leave does not exist', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[]]); // empty
      const service = await buildModule(makePool(conn));

      await expect(service.cancel(999, 'staff@mc.org')).rejects.toThrow(NotFoundException);
    });

    it('rolls back and rethrows on unexpected error during insert', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[mockLeaveRow]])
        .mockResolvedValueOnce([[]])                          // UPDATE leaves
        .mockRejectedValueOnce(new Error('DB failure'));      // INSERT cancellations
      const service = await buildModule(makePool(conn));

      await expect(service.cancel(1, 'staff@mc.org')).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(conn.rollback).toHaveBeenCalled();
    });

    it('does NOT restore balance (hours only deducted at approval)', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[mockLeaveRow]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ ...mockLeaveRow, status: 'Cancelled' }]])
        .mockResolvedValueOnce([[mockDurationRow]])
        .mockResolvedValueOnce([[{ staff_email: 'x@mc.org', supervisor_email: null }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[[{ full_name: 'John' }]]])
        .mockResolvedValueOnce([[[{ name: 'Annual Leave' }]]]);
      const service = await buildModule(makePool(conn));

      await service.cancel(1, 'staff@mc.org');

      // Verify no UPDATE leave_balances call was made
      const allSql = conn.query.mock.calls.map((c) => c[0] as string);
      expect(allSql.some((sql) => sql.includes('UPDATE leave_balances'))).toBe(false);
    });
  });

  // ── findCancellation ─────────────────────────────────────────────────────────

  describe('findCancellation()', () => {
    it('returns the cancellation audit record', async () => {
      const mockRecord = {
        id: 1, leave_id: 1, staff_id: 10,
        staff_name: 'John Doe', reason: 'Change of plans',
        cancelled_by: 'staff@mc.org', cancelled_at: new Date(),
      };
      const conn = makeConn([[[mockRecord]]]);
      const service = await buildModule(makePool(conn));

      const result = await service.findCancellation(1);

      expect(result).toEqual(mockRecord);
    });

    it('throws NotFoundException when no record exists', async () => {
      const conn    = makeConn([[[]]]); // empty
      const service = await buildModule(makePool(conn));

      await expect(service.findCancellation(1)).rejects.toThrow(NotFoundException);
    });
  });

  // ── email failures are non-fatal ──────────────────────────────────────────────

  describe('email fault tolerance', () => {
    it('create() still returns the leave even when mail throws', async () => {
      mockMailService.sendCaseNotification.mockRejectedValue(new Error('SMTP down'));

      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ country: 'NGA' }]])
        .mockResolvedValueOnce([[{ annual_hours: 160, monthly_accrual_hours: null }]])
        .mockResolvedValueOnce([[[{ used_hours: 0 }]]])
        .mockResolvedValueOnce([[]])                        // existing durations
        .mockResolvedValueOnce([[{ insertId: 1 }]])         // INSERT leave
        .mockResolvedValueOnce([[]])                        // INSERT duration
        .mockResolvedValueOnce([[mockLeaveRow]])             // findOne
        .mockResolvedValueOnce([[mockDurationRow]])
        .mockResolvedValueOnce([[{ staff_email: 'x@mc.org', supervisor_email: null }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[[{ full_name: 'John' }]]])
        .mockResolvedValueOnce([[[{ name: 'Annual Leave' }]]]);

      const service = await buildModule(makePool(conn));
      const dto = {
        staffId: 10, leaveTypeId: 'lt-uid-001', reason: 'r',
        handoverNote: 'h', leaveDuration: [{ startDate: '2026-02-03', endDate: '2026-02-07' }],
      };

      // Should NOT throw even though mail failed
      const result = await service.create(dto, mockUser as any);
      expect(result.id).toBe(1);
    });
  });

  // ── validateAndComputeBalance (indirectly via create) ─────────────────────────

  describe('validateAndComputeBalance() — accrual mode', () => {
    it('uses carryover + accrued hours for annual leave balance check', async () => {
      // 6 months elapsed, 13.33 hrs/month accrual, 0 carryover = 79.98 available
      // request is 40 hrs → should pass
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ country: 'NGA' }]])
        .mockResolvedValueOnce([[{ annual_hours: 160, monthly_accrual_hours: 13.33 }]])
        .mockResolvedValueOnce([[[{ used_hours: 0 }]]])
        .mockResolvedValueOnce([[{ remaining_hours: 0 }]])   // carryover = 0
        .mockResolvedValueOnce([[]])                         // existing durations
        .mockResolvedValueOnce([[{ insertId: 1 }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[mockLeaveRow]])
        .mockResolvedValueOnce([[mockDurationRow]])
        .mockResolvedValueOnce([[{ staff_email: 'x', supervisor_email: null }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[[{ full_name: 'J' }]]])
        .mockResolvedValueOnce([[[{ name: 'AL' }]]]);

      jest.spyOn(Date.prototype, 'getMonth').mockReturnValue(5);  // month index 5 = June (currentMonth = 6)
      const service = await buildModule(makePool(conn));
      const dto = {
        staffId: 10, leaveTypeId: 'lt-uid-001', reason: 'r',
        handoverNote: 'h', leaveDuration: [{ startDate: '2026-06-01', endDate: '2026-06-05' }],
      };

      const result = await service.create(dto, mockUser as any);
      expect(result.id).toBe(1);

      jest.restoreAllMocks();
    });

    it('throws BadRequestException when staff country has no leave policy', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ country: 'LBR' }]])
        .mockResolvedValueOnce([[]])  // no config row for LBR
        .mockResolvedValueOnce([[]]); // existing durations (not reached but needs mock)
      const service = await buildModule(makePool(conn));
      const dto = {
        staffId: 10, leaveTypeId: 'lt-uid-001', reason: 'r',
        handoverNote: 'h', leaveDuration: [{ startDate: '2026-02-03', endDate: '2026-02-07' }],
      };

      await expect(service.create(dto, mockUser as any)).rejects.toThrow(BadRequestException);
    });
  });
});