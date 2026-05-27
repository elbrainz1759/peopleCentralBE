import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LeavesService } from './leaves.service';
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
};

const mockDurationRow = {
  id: 1,
  leave_id: 1,
  start_date: '2026-02-03',
  end_date: '2026-02-07',
  hours: 40,
};

// ─── MailService mock (avoids src/ path resolution entirely) ─────────────────

const mockMailService = {
  sendCaseNotification: jest.fn().mockResolvedValue(undefined),
  sendToMany:           jest.fn().mockResolvedValue(undefined),
};

// ─── Connection mock ──────────────────────────────────────────────────────────
// mysql2/promise query() returns [rows, fields].
// Each mockResolvedValueOnce call must match the exact destructuring the
// service uses, e.g.:
//   const [rows] = await conn.query(...)   → mock returns [ rowsArray ]
//   const [[row]] = await conn.query(...)  → mock returns [ [ rowObject ] ]
//   const [result] = await conn.query(...) → mock returns [ resultSetHeader ]

function makeConn() {
  return {
    query:            jest.fn(),
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit:           jest.fn().mockResolvedValue(undefined),
    rollback:         jest.fn().mockResolvedValue(undefined),
    release:          jest.fn(),
  };
}

async function buildService(conn: ReturnType<typeof makeConn>) {
  const pool = { getConnection: jest.fn().mockResolvedValue(conn) };

  // Provide MailService by value so Jest never tries to resolve 'src/mail/...'
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      LeavesService,
      { provide: POOL_TOKEN,  useValue: pool },
      { provide: 'MailService', useValue: mockMailService },
    ],
  })
    .overrideProvider('MailService')
    .useValue(mockMailService)
    .compile();

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

  afterEach(() => jest.restoreAllMocks());

  // ── findOne ──────────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('returns leave with durations', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[mockLeaveRow]])      // SELECT leaves JOIN leave_types
        .mockResolvedValueOnce([[mockDurationRow]]);  // SELECT leave_durations

      const service = await buildService(conn);
      const result  = await service.findOne(1);

      expect(result.id).toBe(1);
      expect(result.durations).toHaveLength(1);
      expect(result.durations![0].start_date).toBe('2026-02-03');
      expect(conn.release).toHaveBeenCalled();
    });

    it('throws NotFoundException when leave does not exist', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[]]); // empty rows

      const service = await buildService(conn);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });

    it('wraps unexpected DB error in InternalServerErrorException', async () => {
      const conn = makeConn();
      conn.query.mockRejectedValueOnce(new Error('DB down'));

      const service = await buildService(conn);
      await expect(service.findOne(1)).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ── findAll ──────────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('returns paginated results with defaults', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ total: 1 }]])   // COUNT(*) — note: [[]] double-wrap
        .mockResolvedValueOnce([[mockLeaveRow]]);   // SELECT rows

      // The service uses [[countRow]] = await conn.query() so mock must be [[{ total: 1 }]]
      // then wraps again: [[[{ total: 1 }]]] — let's match the actual destructuring:
      // const [[countRow]] = await conn.query(...)
      // This means conn.query returns [ [ {total:1} ] ]  (one array wrap)
      const conn2 = makeConn();
      conn2.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[mockLeaveRow]]);

      const service = await buildService(conn2);
      const result  = await service.findAll({});

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
      expect(result.meta.last_page).toBe(1);
    });

    it('applies status filter in WHERE clause', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ total: 0 }]])
        .mockResolvedValueOnce([[]]);

      const service = await buildService(conn);
      await service.findAll({ status: 'Pending' });

      // Second query should contain the status param
      const params = conn.query.mock.calls[1][1] as unknown[];
      expect(params).toContain('Pending');
    });

    it('applies staffId filter', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[mockLeaveRow]]);

      const service = await buildService(conn);
      await service.findAll({ staffId: 10 });

      const params = conn.query.mock.calls[1][1] as unknown[];
      expect(params).toContain(10);
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

    function seedCreateConn(conn: ReturnType<typeof makeConn>) {
      conn.query
        // validateAndComputeBalance
        .mockResolvedValueOnce([[{ country: 'NGA' }]])                              // employee
        .mockResolvedValueOnce([[{ annual_hours: 160, monthly_accrual_hours: null }]]) // config
        .mockResolvedValueOnce([[{ used_hours: 0 }]])                               // used hours
        // existing durations overlap check
        .mockResolvedValueOnce([[]])                                                 // no existing
        // INSERT leaves
        .mockResolvedValueOnce([{ insertId: 1 }])                                   // ResultSetHeader
        // INSERT leave_durations
        .mockResolvedValueOnce([{}])
        // findOne (post-commit)
        .mockResolvedValueOnce([[mockLeaveRow]])
        .mockResolvedValueOnce([[mockDurationRow]])
        // email resolution (swallowed if it throws)
        .mockResolvedValue([[]]); // catch-all for email helpers
    }

    it('persists the leave and returns it', async () => {
      const conn = makeConn();
      seedCreateConn(conn);

      const service = await buildService(conn);
      const result  = await service.create(dto, mockUser as any);

      expect(conn.beginTransaction).toHaveBeenCalled();
      expect(conn.commit).toHaveBeenCalled();
      expect(result.id).toBe(1);
    });

    it('throws BadRequestException on internal date overlap', async () => {
      jest.spyOn(leaveHoursUtil, 'findInternalOverlap').mockReturnValue({ a: 0, b: 1 });

      const conn    = makeConn();
      const service = await buildService(conn);

      await expect(service.create(dto, mockUser as any)).rejects.toThrow(BadRequestException);
      expect(conn.beginTransaction).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when endDate before startDate', async () => {
      const badDto  = { ...dto, leaveDuration: [{ startDate: '2026-02-07', endDate: '2026-02-03' }] };
      const conn    = makeConn();
      const service = await buildService(conn);

      await expect(service.create(badDto, mockUser as any)).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException on overlap with existing leave', async () => {
      jest.spyOn(leaveHoursUtil, 'rangesOverlap').mockReturnValue(true);

      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ country: 'NGA' }]])
        .mockResolvedValueOnce([[{ annual_hours: 160, monthly_accrual_hours: null }]])
        .mockResolvedValueOnce([[{ used_hours: 0 }]])
        .mockResolvedValueOnce([[{ start_date: '2026-02-03', end_date: '2026-02-07' }]]); // existing

      const service = await buildService(conn);
      await expect(service.create(dto, mockUser as any)).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when zero working hours', async () => {
      jest.spyOn(leaveHoursUtil, 'calculateTotalHours').mockReturnValue(0);

      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ country: 'NGA' }]])
        .mockResolvedValueOnce([[{ annual_hours: 160, monthly_accrual_hours: null }]])
        .mockResolvedValueOnce([[{ used_hours: 0 }]])
        .mockResolvedValueOnce([[]]); // no existing

      const service = await buildService(conn);
      await expect(service.create(dto, mockUser as any)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException on insufficient balance', async () => {
      jest.spyOn(leaveHoursUtil, 'calculateTotalHours').mockReturnValue(40);

      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ country: 'NGA' }]])
        .mockResolvedValueOnce([[{ annual_hours: 10, monthly_accrual_hours: null }]]) // only 10 hrs
        .mockResolvedValueOnce([[{ used_hours: 0 }]])
        .mockResolvedValueOnce([[]]); // existing

      const service = await buildService(conn);
      await expect(service.create(dto, mockUser as any)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when no leave policy for staff country', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ country: 'LBR' }]])
        .mockResolvedValueOnce([[]]); // no config row

      const service = await buildService(conn);
      await expect(service.create(dto, mockUser as any)).rejects.toThrow(BadRequestException);
    });

    it('rolls back and throws InternalServerErrorException on DB failure', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ country: 'NGA' }]])
        .mockResolvedValueOnce([[{ annual_hours: 160, monthly_accrual_hours: null }]])
        .mockResolvedValueOnce([[{ used_hours: 0 }]])
        .mockResolvedValueOnce([[]])
        .mockRejectedValueOnce(new Error('DB insert failed')); // INSERT leaves

      const service = await buildService(conn);
      await expect(service.create(dto, mockUser as any)).rejects.toThrow(InternalServerErrorException);
      expect(conn.rollback).toHaveBeenCalled();
    });

    it('still returns the leave when email sending fails', async () => {
      mockMailService.sendCaseNotification.mockRejectedValueOnce(new Error('SMTP down'));

      const conn = makeConn();
      seedCreateConn(conn);

      const service = await buildService(conn);
      const result  = await service.create(dto, mockUser as any);

      expect(result.id).toBe(1); // committed successfully
    });
  });

  // ── review ───────────────────────────────────────────────────────────────────

  describe('review()', () => {
    it('transitions Pending → Reviewed', async () => {
      const reviewedRow = { ...mockLeaveRow, status: 'Reviewed' };
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[mockLeaveRow]])       // SELECT leave
        .mockResolvedValueOnce([{}])                   // UPDATE
        .mockResolvedValueOnce([[reviewedRow]])         // findOne SELECT
        .mockResolvedValueOnce([[mockDurationRow]])     // findOne durations
        .mockResolvedValue([[]]); // email helpers

      const service = await buildService(conn);
      const result  = await service.review(1, 'hr@mc.org');

      expect(result.status).toBe('Reviewed');
    });

    it('throws NotFoundException when leave does not exist', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[]]); // no rows

      const service = await buildService(conn);
      await expect(service.review(999, 'hr@mc.org')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when leave is not Pending', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[{ ...mockLeaveRow, status: 'Approved' }]]);

      const service = await buildService(conn);
      await expect(service.review(1, 'hr@mc.org')).rejects.toThrow(BadRequestException);
    });
  });

  // ── approve ──────────────────────────────────────────────────────────────────

  describe('approve()', () => {
    function seedApproveConn(conn: ReturnType<typeof makeConn>, remainingHours = 80) {
      const reviewedRow  = { ...mockLeaveRow, status: 'Reviewed', total_hours: 40 };
      const approvedRow  = { ...mockLeaveRow, status: 'Approved' };

      conn.query
        .mockResolvedValueOnce([[reviewedRow]])                                         // SELECT leave
        .mockResolvedValueOnce([[{ id: 5, remaining_hours: remainingHours }]])          // FOR UPDATE balance
        .mockResolvedValueOnce([[{ country: 'NGA' }]])                                 // validateBalance: employee
        .mockResolvedValueOnce([[{ annual_hours: 160, monthly_accrual_hours: null }]]) // validateBalance: config
        .mockResolvedValueOnce([[{ used_hours: 0 }]])                                  // validateBalance: used
        .mockResolvedValueOnce([{}])                                                   // UPDATE leaves
        .mockResolvedValueOnce([{}])                                                   // UPDATE leave_balances
        .mockResolvedValueOnce([{}])                                                   // INSERT transactions
        .mockResolvedValueOnce([[approvedRow]])                                         // findOne SELECT
        .mockResolvedValueOnce([[mockDurationRow]])                                     // findOne durations
        .mockResolvedValue([[]]); // email helpers
    }

    it('transitions Reviewed → Approved and deducts balance', async () => {
      const conn = makeConn();
      seedApproveConn(conn);

      const service = await buildService(conn);
      const result  = await service.approve(1, 'supervisor@mc.org');

      expect(conn.beginTransaction).toHaveBeenCalled();
      expect(conn.commit).toHaveBeenCalled();
      expect(result.status).toBe('Approved');
    });

    it('throws NotFoundException when leave does not exist', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[]]); // no rows

      const service = await buildService(conn);
      await expect(service.approve(999, 'sup@mc.org')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when leave is not Reviewed', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[{ ...mockLeaveRow, status: 'Pending' }]]);

      const service = await buildService(conn);
      await expect(service.approve(1, 'sup@mc.org')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when balance row not found', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ ...mockLeaveRow, status: 'Reviewed', total_hours: 40 }]])
        .mockResolvedValueOnce([[]]); // no balance row

      const service = await buildService(conn);
      await expect(service.approve(1, 'sup@mc.org')).rejects.toThrow(BadRequestException);
      expect(conn.rollback).toHaveBeenCalled();
    });

    it('throws BadRequestException when remaining_hours insufficient (locked value)', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ ...mockLeaveRow, status: 'Reviewed', total_hours: 40 }]])
        .mockResolvedValueOnce([[{ id: 5, remaining_hours: 10 }]]); // only 10 hrs left

      const service = await buildService(conn);
      await expect(service.approve(1, 'sup@mc.org')).rejects.toThrow(BadRequestException);
      expect(conn.rollback).toHaveBeenCalled();
    });

    it('rolls back on unexpected DB error', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ ...mockLeaveRow, status: 'Reviewed', total_hours: 40 }]])
        .mockResolvedValueOnce([[{ id: 5, remaining_hours: 80 }]])
        .mockRejectedValueOnce(new Error('DB failure')); // validateBalance explodes

      const service = await buildService(conn);
      await expect(service.approve(1, 'sup@mc.org')).rejects.toThrow(InternalServerErrorException);
      expect(conn.rollback).toHaveBeenCalled();
    });
  });

  // ── reject ───────────────────────────────────────────────────────────────────

  describe('reject()', () => {
    it('rejects a Pending leave without touching the balance', async () => {
      const rejectedRow = { ...mockLeaveRow, status: 'Rejected' };
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[mockLeaveRow]])       // SELECT leave (Pending)
        .mockResolvedValueOnce([{}])                   // UPDATE leaves
        .mockResolvedValueOnce([[rejectedRow]])         // findOne SELECT
        .mockResolvedValueOnce([[mockDurationRow]])     // findOne durations
        .mockResolvedValue([[]]); // email helpers

      const service = await buildService(conn);
      const result  = await service.reject(1, 'hr@mc.org');

      expect(result.status).toBe('Rejected');
      // Verify no UPDATE leave_balances was called (no balance restore for Pending)
      const allSql = conn.query.mock.calls.map((c: any[]) => c[0] as string);
      expect(allSql.some((s) => s.includes('UPDATE leave_balances'))).toBe(false);
    });

    it('restores balance when rejecting an Approved leave', async () => {
      const approvedLeave = { ...mockLeaveRow, status: 'Approved', total_hours: 40 };
      const rejectedRow   = { ...mockLeaveRow, status: 'Rejected' };
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[approvedLeave]])       // SELECT leave
        .mockResolvedValueOnce([{}])                   // UPDATE leaves → Rejected
        .mockResolvedValueOnce([[{ id: 5 }]])          // SELECT balance FOR UPDATE
        .mockResolvedValueOnce([{}])                   // UPDATE leave_balances (restore)
        .mockResolvedValueOnce([{}])                   // INSERT reversal transaction
        .mockResolvedValueOnce([[rejectedRow]])         // findOne SELECT
        .mockResolvedValueOnce([[mockDurationRow]])     // findOne durations
        .mockResolvedValue([[]]); // email helpers

      const service = await buildService(conn);
      await service.reject(1, 'hr@mc.org');

      // The 4th query (index 3) must be UPDATE leave_balances with restoration
      const restoreCall = conn.query.mock.calls[3][0] as string;
      expect(restoreCall).toContain('remaining_hours = remaining_hours +');
    });

    it('throws NotFoundException when leave does not exist', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[]]); // no rows

      const service = await buildService(conn);
      await expect(service.reject(999, 'hr@mc.org')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when leave is already Cancelled', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[{ ...mockLeaveRow, status: 'Cancelled' }]]);

      const service = await buildService(conn);
      await expect(service.reject(1, 'hr@mc.org')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when leave is already Rejected', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[{ ...mockLeaveRow, status: 'Rejected' }]]);

      const service = await buildService(conn);
      await expect(service.reject(1, 'hr@mc.org')).rejects.toThrow(BadRequestException);
    });
  });

  // ── cancel ───────────────────────────────────────────────────────────────────

  describe('cancel()', () => {
    function seedCancelConn(
      conn: ReturnType<typeof makeConn>,
      initialStatus: string = 'Pending',
    ) {
      const cancelledRow = { ...mockLeaveRow, status: 'Cancelled' };
      conn.query
        .mockResolvedValueOnce([[{ ...mockLeaveRow, status: initialStatus }]]) // SELECT leave
        .mockResolvedValueOnce([{}])                                            // UPDATE leaves
        .mockResolvedValueOnce([{}])                                            // INSERT cancellations
        .mockResolvedValueOnce([[cancelledRow]])                                 // findOne SELECT
        .mockResolvedValueOnce([[mockDurationRow]])                              // findOne durations
        .mockResolvedValue([[]]); // email helpers
    }

    it('cancels a Pending leave and inserts audit record', async () => {
      const conn = makeConn();
      seedCancelConn(conn, 'Pending');

      const service = await buildService(conn);
      const result  = await service.cancel(1, 'staff@mc.org', 'Change of plans');

      expect(conn.beginTransaction).toHaveBeenCalled();
      expect(conn.commit).toHaveBeenCalled();
      expect(result.status).toBe('Cancelled');
    });

    it('also cancels a Reviewed leave', async () => {
      const conn = makeConn();
      seedCancelConn(conn, 'Reviewed');

      const service = await buildService(conn);
      const result  = await service.cancel(1, 'staff@mc.org');

      expect(result.status).toBe('Cancelled');
    });

    it('throws ForbiddenException when leave is Approved', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[{ ...mockLeaveRow, status: 'Approved' }]]);

      const service = await buildService(conn);
      await expect(service.cancel(1, 'staff@mc.org')).rejects.toThrow(ForbiddenException);
      expect(conn.beginTransaction).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when leave is Rejected', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[{ ...mockLeaveRow, status: 'Rejected' }]]);

      const service = await buildService(conn);
      await expect(service.cancel(1, 'staff@mc.org')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when leave is already Cancelled', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[{ ...mockLeaveRow, status: 'Cancelled' }]]);

      const service = await buildService(conn);
      await expect(service.cancel(1, 'staff@mc.org')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when leave does not exist', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[]]); // no rows

      const service = await buildService(conn);
      await expect(service.cancel(999, 'staff@mc.org')).rejects.toThrow(NotFoundException);
    });

    it('never calls UPDATE leave_balances (balance only deducted at approval)', async () => {
      const conn = makeConn();
      seedCancelConn(conn, 'Pending');

      const service = await buildService(conn);
      await service.cancel(1, 'staff@mc.org');

      const allSql = conn.query.mock.calls.map((c: any[]) => c[0] as string);
      expect(allSql.some((s) => s.includes('UPDATE leave_balances'))).toBe(false);
    });

    it('rolls back and throws InternalServerErrorException on DB failure', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[mockLeaveRow]])
        .mockResolvedValueOnce([{}])                     // UPDATE leaves
        .mockRejectedValueOnce(new Error('DB failure')); // INSERT cancellations

      const service = await buildService(conn);
      await expect(service.cancel(1, 'staff@mc.org')).rejects.toThrow(InternalServerErrorException);
      expect(conn.rollback).toHaveBeenCalled();
    });
  });

  // ── findCancellation ─────────────────────────────────────────────────────────

  describe('findCancellation()', () => {
    it('returns the cancellation audit record', async () => {
      const record = {
        id: 1, leave_id: 1, staff_id: 10,
        staff_name: 'John Doe', reason: 'Change of plans',
        cancelled_by: 'staff@mc.org', cancelled_at: new Date(),
      };
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[record]]);

      const service = await buildService(conn);
      const result  = await service.findCancellation(1);

      expect(result).toEqual(record);
    });

    it('throws NotFoundException when no cancellation record exists', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[]]); // empty

      const service = await buildService(conn);
      await expect(service.findCancellation(1)).rejects.toThrow(NotFoundException);
    });
  });
});