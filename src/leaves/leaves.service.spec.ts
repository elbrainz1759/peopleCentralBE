import { Test } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { LeavesService } from './leaves.service';
import { MailService } from 'src/mail/mail.service';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../utils/leave-hours.util', () => ({
  calculateHoursForRange: jest.fn().mockReturnValue(8),
  findInternalOverlap: jest.fn().mockReturnValue(null),
  rangesOverlap: jest.fn().mockReturnValue(false),
}));

import {
  calculateHoursForRange,
  findInternalOverlap,
  rangesOverlap,
} from '../utils/leave-hours.util';

const makeConn = () => ({
  query: jest.fn(),
  execute: jest.fn().mockResolvedValue([{}]),
  beginTransaction: jest.fn().mockResolvedValue(undefined),
  commit: jest.fn().mockResolvedValue(undefined),
  rollback: jest.fn().mockResolvedValue(undefined),
  release: jest.fn(),
});

const mockMailService = {
  sendCaseNotification: jest.fn().mockResolvedValue(undefined),
  sendToMany: jest.fn().mockResolvedValue(undefined),
};

const buildService = async (conn: ReturnType<typeof makeConn>) => {
  const pool = { getConnection: jest.fn().mockResolvedValue(conn) };
  const module = await Test.createTestingModule({
    providers: [
      LeavesService,
      { provide: 'MYSQL_POOL', useValue: pool },
      { provide: MailService, useValue: mockMailService },
    ],
  }).compile();
  return module.get(LeavesService);
};

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockUser: RequestUser = { email: 'staff@example.com', sub: 1, role: 'staff' };

const baseLeave = {
  id: 1,
  unique_id: 'abc123',
  staff_id: 10,
  reason: 'Rest',
  handover_note: 'All clear',
  total_hours: 16,
  status: 'Pending' as const,
  created_by: 'staff@example.com',
  created_at: new Date('2025-01-15'),
};

const baseDuration = {
  id: 1,
  leave_id: 1,
  leave_type_id: 'lt-uid-001',
  leave_type_name: 'Annual Leave',
  start_date: '2025-02-01',
  end_date: '2025-02-02',
  hours: 16,
};

const baseDto = {
  staffId: 10,
  reason: 'Rest',
  handoverNote: 'All clear',
  leaveDuration: [
    { startDate: '2025-02-01', endDate: '2025-02-02', leaveTypeId: 'lt-uid-001' },
  ],
};

// Notification query sequence helpers
// After commit, findOne() is called internally — it opens a NEW connection.
// The pool mock always returns the same conn, so we need to account for
// findOne's query calls appended to the same mock sequence.
const findOneQueries = (leave = baseLeave, durations = [baseDuration]) => [
  [[leave]],        // SELECT l.* FROM leaves WHERE id = ?
  [[...durations]], // SELECT ld.*, lt.name FROM leave_durations WHERE leave_id = ?
];

const notificationQueries = () => [
  // resolveEmailRecipients
  [[{ staff_email: 'staff@mc.org', supervisor_email: 'sup@mc.org' }]],
  [[{ email: 'hr@mc.org' }]],
  // resolveStaffName
  [[{ full_name: 'John Doe' }]],
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LeavesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (findInternalOverlap as jest.Mock).mockReturnValue(null);
    (rangesOverlap as jest.Mock).mockReturnValue(false);
    (calculateHoursForRange as jest.Mock).mockReturnValue(8);
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    const setupCreateConn = (overrides: any[] = []) => {
      const conn = makeConn();
      conn.query
        // 3. leave type existence check
        .mockResolvedValueOnce([[{ unique_id: 'lt-uid-001' }]])
        // 4. existing durations overlap check
        .mockResolvedValueOnce([[]])
        // 6a. validateBalanceForType — staff country
        .mockResolvedValueOnce([[{ country: 'Nigeria' }]])
        // 6b. validateBalanceForType — config
        .mockResolvedValueOnce([[{ annual_hours: 160, monthly_accrual_hours: null }]])
        // 6c. validateBalanceForType — used hours
        .mockResolvedValueOnce([[{ used_hours: 0 }]])
        // 7a. INSERT leaves
        .mockResolvedValueOnce([{ insertId: 1 }])
        // 7b. INSERT leave_durations
        .mockResolvedValueOnce([{ insertId: 1 }])
        // findOne — SELECT leaves
        .mockResolvedValueOnce([[baseLeave]])
        // findOne — SELECT durations
        .mockResolvedValueOnce([[baseDuration]])
        // notifications
        .mockResolvedValueOnce([[{ staff_email: 'staff@mc.org', supervisor_email: 'sup@mc.org' }]])
        .mockResolvedValueOnce([[{ email: 'hr@mc.org' }]])
        .mockResolvedValueOnce([[{ full_name: 'John Doe' }]]);

      for (const o of overrides) conn.query.mockResolvedValueOnce(o);
      return conn;
    };

    it('creates a leave with a single leave type', async () => {
      const conn = setupCreateConn();
      const service = await buildService(conn);
      const result = await service.create(baseDto, mockUser);

      expect(result.id).toBe(1);
      expect(result.durations).toHaveLength(1);
      expect(result.durations![0].leave_type_id).toBe('lt-uid-001');
      expect(conn.beginTransaction).toHaveBeenCalled();
      expect(conn.commit).toHaveBeenCalled();
    });

    it('creates a leave with multiple leave types', async () => {
      const conn = makeConn();
      const multiDuration = [
        { startDate: '2025-02-01', endDate: '2025-02-01', leaveTypeId: 'lt-uid-001' },
        { startDate: '2025-02-03', endDate: '2025-02-03', leaveTypeId: 'lt-uid-002' },
      ];
      const multiDurationRows = [
        { ...baseDuration, leave_type_id: 'lt-uid-001', hours: 8 },
        { ...baseDuration, id: 2, leave_type_id: 'lt-uid-002', leave_type_name: 'Exam Leave', hours: 8 },
      ];

      conn.query
        .mockResolvedValueOnce([[{ unique_id: 'lt-uid-001' }]]) // lt check 1
        .mockResolvedValueOnce([[{ unique_id: 'lt-uid-002' }]]) // lt check 2
        .mockResolvedValueOnce([[]])                             // overlap check
        // validateBalance for lt-uid-001
        .mockResolvedValueOnce([[{ country: 'Nigeria' }]])
        .mockResolvedValueOnce([[{ annual_hours: 160, monthly_accrual_hours: null }]])
        .mockResolvedValueOnce([[{ used_hours: 0 }]])
        // validateBalance for lt-uid-002
        .mockResolvedValueOnce([[{ country: 'Nigeria' }]])
        .mockResolvedValueOnce([[{ annual_hours: 80, monthly_accrual_hours: null }]])
        .mockResolvedValueOnce([[{ used_hours: 0 }]])
        // INSERT leaves
        .mockResolvedValueOnce([{ insertId: 1 }])
        // INSERT duration 1
        .mockResolvedValueOnce([{ insertId: 1 }])
        // INSERT duration 2
        .mockResolvedValueOnce([{ insertId: 2 }])
        // findOne
        .mockResolvedValueOnce([[baseLeave]])
        .mockResolvedValueOnce([multiDurationRows])
        // notifications
        .mockResolvedValueOnce([[{ staff_email: 'staff@mc.org', supervisor_email: null }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ full_name: 'John Doe' }]]);

      const service = await buildService(conn);
      const result = await service.create(
        { ...baseDto, leaveDuration: multiDuration },
        mockUser,
      );

      expect(result.id).toBe(1);
      expect(conn.commit).toHaveBeenCalled();
    });

    it('throws BadRequestException when internal date ranges overlap', async () => {
      (findInternalOverlap as jest.Mock).mockReturnValue({ a: 0, b: 1 });
      const conn = makeConn();
      const service = await buildService(conn);

      await expect(service.create(baseDto, mockUser)).rejects.toThrow(BadRequestException);
      expect(conn.beginTransaction).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when endDate is before startDate', async () => {
      const conn = makeConn();
      const service = await buildService(conn);
      const dto = {
        ...baseDto,
        leaveDuration: [{ startDate: '2025-02-05', endDate: '2025-02-01', leaveTypeId: 'lt-uid-001' }],
      };

      await expect(service.create(dto, mockUser)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when leave type does not exist', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[]]); // leave type not found

      const service = await buildService(conn);
      await expect(service.create(baseDto, mockUser)).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when date range overlaps existing leave', async () => {
      (rangesOverlap as jest.Mock).mockReturnValue(true);
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ unique_id: 'lt-uid-001' }]])
        .mockResolvedValueOnce([[{ start_date: '2025-02-01', end_date: '2025-02-02' }]]);

      const service = await buildService(conn);
      await expect(service.create(baseDto, mockUser)).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when total working hours is 0', async () => {
      (calculateHoursForRange as jest.Mock).mockReturnValue(0);
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ unique_id: 'lt-uid-001' }]])
        .mockResolvedValueOnce([[]]); // no existing durations

      const service = await buildService(conn);
      await expect(service.create(baseDto, mockUser)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when leave balance is insufficient', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ unique_id: 'lt-uid-001' }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ country: 'Nigeria' }]])
        .mockResolvedValueOnce([[{ annual_hours: 8, monthly_accrual_hours: null }]])
        .mockResolvedValueOnce([[{ used_hours: 8 }]]); // fully consumed

      const service = await buildService(conn);
      await expect(service.create(baseDto, mockUser)).rejects.toThrow(BadRequestException);
      expect(conn.beginTransaction).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when no leave policy is configured for country', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ unique_id: 'lt-uid-001' }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ country: 'Nigeria' }]])
        .mockResolvedValueOnce([[]]); // no config

      const service = await buildService(conn);
      await expect(service.create(baseDto, mockUser)).rejects.toThrow(BadRequestException);
    });

    it('commits and returns leave even if notification throws', async () => {
      const conn = setupCreateConn();
      mockMailService.sendCaseNotification.mockRejectedValueOnce(new Error('SMTP down'));

      const service = await buildService(conn);
      const result = await service.create(baseDto, mockUser);

      expect(result.id).toBe(1);
      expect(conn.commit).toHaveBeenCalled();
    });

    it('rolls back and throws InternalServerErrorException on unexpected db error', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ unique_id: 'lt-uid-001' }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ country: 'Nigeria' }]])
        .mockResolvedValueOnce([[{ annual_hours: 160, monthly_accrual_hours: null }]])
        .mockResolvedValueOnce([[{ used_hours: 0 }]])
        .mockRejectedValueOnce(new Error('DB crash')); // INSERT leaves fails

      const service = await buildService(conn);
      await expect(service.create(baseDto, mockUser)).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(conn.rollback).toHaveBeenCalled();
    });
  });

  // ── findAll ──────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated leaves with durations attached', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[baseLeave]])
        .mockResolvedValueOnce([[baseDuration]]);

      const service = await buildService(conn);
      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].durations).toHaveLength(1);
      expect(result.data[0].durations![0].leave_type_id).toBe('lt-uid-001');
      expect(result.meta.total).toBe(1);
    });

    it('filters by status', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ total: 0 }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);

      const service = await buildService(conn);
      await service.findAll({ page: 1, limit: 10, status: 'Approved' });

      const countSql = conn.query.mock.calls[0][0] as string;
      expect(countSql).toContain('WHERE');
    });

    it('filters by staffId', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ total: 0 }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);

      const service = await buildService(conn);
      await service.findAll({ page: 1, limit: 10, staffId: 10 });

      const countArgs = conn.query.mock.calls[0][1] as any[];
      expect(countArgs).toContain(10);
    });

    it('skips duration query when no leaves returned', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ total: 0 }]])
        .mockResolvedValueOnce([[]]); // empty page

      const service = await buildService(conn);
      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(0);
      // duration query should NOT be called (leaveIds is empty)
      expect(conn.query).toHaveBeenCalledTimes(2);
    });

    it('throws InternalServerErrorException on db error', async () => {
      const conn = makeConn();
      conn.query.mockRejectedValueOnce(new Error('DB error'));

      const service = await buildService(conn);
      await expect(service.findAll({ page: 1, limit: 10 })).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ── findOne ──────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns leave with durations and leave_type_name', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[baseLeave]])
        .mockResolvedValueOnce([[baseDuration]]);

      const service = await buildService(conn);
      const result = await service.findOne(1);

      expect(result.id).toBe(1);
      expect(result.durations![0].leave_type_name).toBe('Annual Leave');
    });

    it('throws NotFoundException when leave not found', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[]]);

      const service = await buildService(conn);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });

    it('throws InternalServerErrorException on db error', async () => {
      const conn = makeConn();
      conn.query.mockRejectedValueOnce(new Error('DB error'));

      const service = await buildService(conn);
      await expect(service.findOne(1)).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ── review ───────────────────────────────────────────────────────────────────

  describe('review', () => {
    it('transitions Pending → Reviewed and notifies staff and supervisor', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[baseLeave]])                                          // fetch leave
        .mockResolvedValueOnce([{ affectedRows: 1 }])                                 // UPDATE
        .mockResolvedValueOnce([[baseLeave]])                                          // findOne — leave
        .mockResolvedValueOnce([[baseDuration]])                                       // findOne — durations
        .mockResolvedValueOnce([[{ staff_email: 'staff@mc.org', supervisor_email: 'sup@mc.org' }]]) // recipients
        .mockResolvedValueOnce([[{ email: 'hr@mc.org' }]])
        .mockResolvedValueOnce([[{ full_name: 'John Doe' }]]);                         // staff name

      const service = await buildService(conn);
      const result = await service.review(1, 'hr@mc.org');

      expect(result.id).toBe(1);
      expect(mockMailService.sendCaseNotification).toHaveBeenCalledTimes(2); // staff + supervisor
    });

    it('throws BadRequestException when leave is not Pending', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[{ ...baseLeave, status: 'Approved' }]]);

      const service = await buildService(conn);
      await expect(service.review(1, 'hr@mc.org')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when leave not found', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[]]);

      const service = await buildService(conn);
      await expect(service.review(99, 'hr@mc.org')).rejects.toThrow(NotFoundException);
    });
  });

  // ── approve ──────────────────────────────────────────────────────────────────

  describe('approve', () => {
    const reviewedLeave = { ...baseLeave, status: 'Reviewed' as const };

    const setupApproveConn = () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[reviewedLeave]])                    // fetch leave
        .mockResolvedValueOnce([[baseDuration]])                     // load durations
        // beginTransaction (no query)
        .mockResolvedValueOnce([[{ id: 5, remaining_hours: 100 }]]) // FOR UPDATE balance
        // validateBalanceForType
        .mockResolvedValueOnce([[{ country: 'Nigeria' }]])
        .mockResolvedValueOnce([[{ annual_hours: 160, monthly_accrual_hours: null }]])
        .mockResolvedValueOnce([[{ used_hours: 0 }]])
        // UPDATE leaves status
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        // UPDATE leave_balances
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        // INSERT leave_balance_transactions
        .mockResolvedValueOnce([{ insertId: 1 }])
        // findOne after commit
        .mockResolvedValueOnce([[reviewedLeave]])
        .mockResolvedValueOnce([[baseDuration]])
        // notifications
        .mockResolvedValueOnce([[{ staff_email: 'staff@mc.org', supervisor_email: null }]])
        .mockResolvedValueOnce([[{ email: 'hr@mc.org' }]])
        .mockResolvedValueOnce([[{ full_name: 'John Doe' }]]);
      return conn;
    };

    it('approves a Reviewed leave and deducts balance per leave type', async () => {
      const conn = setupApproveConn();
      const service = await buildService(conn);
      const result = await service.approve(1, 'sup@mc.org');

      expect(result.id).toBe(1);
      expect(conn.commit).toHaveBeenCalled();

      // Verify balance deduction UPDATE was called
      const updateBalanceCall = conn.query.mock.calls.find(
        (c) => (c[0] as string).includes('used_hours = used_hours +'),
      );
      expect(updateBalanceCall).toBeDefined();
    });

    it('deducts balance separately for each leave type on multi-type leave', async () => {
      const multiDurations = [
        { ...baseDuration, leave_type_id: 'lt-uid-001', hours: 8 },
        { ...baseDuration, id: 2, leave_type_id: 'lt-uid-002', leave_type_name: 'Exam Leave', hours: 8 },
      ];

      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[reviewedLeave]])
        .mockResolvedValueOnce([multiDurations])
        // FOR UPDATE — lt-uid-001 (sorted first)
        .mockResolvedValueOnce([[{ id: 5, remaining_hours: 80 }]])
        // FOR UPDATE — lt-uid-002
        .mockResolvedValueOnce([[{ id: 6, remaining_hours: 40 }]])
        // validateBalance for lt-uid-001
        .mockResolvedValueOnce([[{ country: 'Nigeria' }]])
        .mockResolvedValueOnce([[{ annual_hours: 160, monthly_accrual_hours: null }]])
        .mockResolvedValueOnce([[{ used_hours: 0 }]])
        // validateBalance for lt-uid-002
        .mockResolvedValueOnce([[{ country: 'Nigeria' }]])
        .mockResolvedValueOnce([[{ annual_hours: 80, monthly_accrual_hours: null }]])
        .mockResolvedValueOnce([[{ used_hours: 0 }]])
        // UPDATE status
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        // UPDATE balance lt-uid-001
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        // INSERT transaction lt-uid-001
        .mockResolvedValueOnce([{ insertId: 1 }])
        // UPDATE balance lt-uid-002
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        // INSERT transaction lt-uid-002
        .mockResolvedValueOnce([{ insertId: 2 }])
        // findOne
        .mockResolvedValueOnce([[reviewedLeave]])
        .mockResolvedValueOnce([multiDurations])
        // notifications
        .mockResolvedValueOnce([[{ staff_email: 'staff@mc.org', supervisor_email: null }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ full_name: 'John Doe' }]]);

      const service = await buildService(conn);
      await service.approve(1, 'sup@mc.org');

      const balanceUpdateCalls = conn.query.mock.calls.filter(
        (c) => (c[0] as string).includes('used_hours = used_hours +'),
      );
      expect(balanceUpdateCalls).toHaveLength(2); // one per leave type
    });

    it('throws BadRequestException when leave is not Reviewed', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[baseLeave]]); // status = Pending

      const service = await buildService(conn);
      await expect(service.approve(1, 'sup@mc.org')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when balance record not found', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[reviewedLeave]])
        .mockResolvedValueOnce([[baseDuration]])
        .mockResolvedValueOnce([[]]); // no balance row

      const service = await buildService(conn);
      await expect(service.approve(1, 'sup@mc.org')).rejects.toThrow(BadRequestException);
      expect(conn.rollback).toHaveBeenCalled();
    });

    it('throws BadRequestException when remaining hours insufficient', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[reviewedLeave]])
        .mockResolvedValueOnce([[baseDuration]])                    // durations: 16 hrs
        .mockResolvedValueOnce([[{ id: 5, remaining_hours: 4 }]]); // only 4 left

      const service = await buildService(conn);
      await expect(service.approve(1, 'sup@mc.org')).rejects.toThrow(BadRequestException);
      expect(conn.rollback).toHaveBeenCalled();
    });

    it('throws NotFoundException when leave not found', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[]]);

      const service = await buildService(conn);
      await expect(service.approve(99, 'sup@mc.org')).rejects.toThrow(NotFoundException);
    });

    it('rolls back on unexpected db error', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[reviewedLeave]])
        .mockResolvedValueOnce([[baseDuration]])
        .mockRejectedValueOnce(new Error('DB crash'));

      const service = await buildService(conn);
      await expect(service.approve(1, 'sup@mc.org')).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(conn.rollback).toHaveBeenCalled();
    });
  });

  // ── reject ───────────────────────────────────────────────────────────────────

  describe('reject', () => {
    it('rejects a Pending leave without touching balances', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[baseLeave]])                // fetch — status Pending
        .mockResolvedValueOnce([{ affectedRows: 1 }])       // UPDATE status
        // findOne
        .mockResolvedValueOnce([[baseLeave]])
        .mockResolvedValueOnce([[baseDuration]])
        // notifications
        .mockResolvedValueOnce([[{ staff_email: 'staff@mc.org', supervisor_email: null }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ full_name: 'John Doe' }]]);

      const service = await buildService(conn);
      const result = await service.reject(1, 'hr@mc.org');

      expect(result.id).toBe(1);
      expect(conn.commit).toHaveBeenCalled();

      // No balance UPDATE for non-approved leave
      const balanceUpdate = conn.query.mock.calls.find(
        (c) => (c[0] as string).includes('used_hours = used_hours -'),
      );
      expect(balanceUpdate).toBeUndefined();
    });

    it('restores balance per leave type when rejecting an Approved leave', async () => {
      const approvedLeave = { ...baseLeave, status: 'Approved' as const };
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[approvedLeave]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])   // UPDATE status
        // load durations for reversal
        .mockResolvedValueOnce([[baseDuration]])
        // FOR UPDATE balance
        .mockResolvedValueOnce([[{ id: 5 }]])
        // UPDATE balance (restore)
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        // INSERT reversal transaction
        .mockResolvedValueOnce([{ insertId: 1 }])
        // findOne
        .mockResolvedValueOnce([[approvedLeave]])
        .mockResolvedValueOnce([[baseDuration]])
        // notifications
        .mockResolvedValueOnce([[{ staff_email: 'staff@mc.org', supervisor_email: null }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ full_name: 'John Doe' }]]);

      const service = await buildService(conn);
      await service.reject(1, 'hr@mc.org');

      const restoreCall = conn.query.mock.calls.find(
        (c) => (c[0] as string).includes('used_hours = used_hours -'),
      );
      expect(restoreCall).toBeDefined();

      const insertReversal = conn.query.mock.calls.find(
        (c) => (c[0] as string).includes("'reversal'"),
      );
      expect(insertReversal).toBeDefined();
    });

    it('throws BadRequestException for invalid status transition', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[{ ...baseLeave, status: 'Cancelled' }]]);

      const service = await buildService(conn);
      await expect(service.reject(1, 'hr@mc.org')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when leave not found', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[]]);

      const service = await buildService(conn);
      await expect(service.reject(99, 'hr@mc.org')).rejects.toThrow(NotFoundException);
    });

    it('rolls back on unexpected db error', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[baseLeave]])
        .mockRejectedValueOnce(new Error('DB crash'));

      const service = await buildService(conn);
      await expect(service.reject(1, 'hr@mc.org')).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(conn.rollback).toHaveBeenCalled();
    });
  });

  // ── cancel ───────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('cancels a Pending leave and writes a cancellation audit record', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[baseLeave]])          // fetch
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE status
        .mockResolvedValueOnce([{ insertId: 1 }])     // INSERT leave_cancellations
        // findOne
        .mockResolvedValueOnce([[baseLeave]])
        .mockResolvedValueOnce([[baseDuration]])
        // notifications
        .mockResolvedValueOnce([[{ staff_email: 'staff@mc.org', supervisor_email: 'sup@mc.org' }]])
        .mockResolvedValueOnce([[{ email: 'hr@mc.org' }]])
        .mockResolvedValueOnce([[{ full_name: 'John Doe' }]]);

      const service = await buildService(conn);
      const result = await service.cancel(1, 'staff@mc.org', 'Personal reasons');

      expect(result.id).toBe(1);
      expect(conn.commit).toHaveBeenCalled();

      const cancellationInsert = conn.query.mock.calls.find(
        (c) => (c[0] as string).includes('leave_cancellations'),
      );
      expect(cancellationInsert).toBeDefined();
    });

    it('cancels a Reviewed leave', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ ...baseLeave, status: 'Reviewed' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ insertId: 1 }])
        .mockResolvedValueOnce([[baseLeave]])
        .mockResolvedValueOnce([[baseDuration]])
        .mockResolvedValueOnce([[{ staff_email: 'staff@mc.org', supervisor_email: null }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ full_name: 'John Doe' }]]);

      const service = await buildService(conn);
      const result = await service.cancel(1, 'staff@mc.org');
      expect(result.id).toBe(1);
    });

    it('throws ForbiddenException when trying to self-cancel an Approved leave', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[{ ...baseLeave, status: 'Approved' }]]);

      const service = await buildService(conn);
      await expect(service.cancel(1, 'staff@mc.org')).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when leave is already Rejected', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[{ ...baseLeave, status: 'Rejected' }]]);

      const service = await buildService(conn);
      await expect(service.cancel(1, 'staff@mc.org')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when leave not found', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[]]);

      const service = await buildService(conn);
      await expect(service.cancel(99, 'staff@mc.org')).rejects.toThrow(NotFoundException);
    });

    it('rolls back on unexpected db error', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[baseLeave]])
        .mockRejectedValueOnce(new Error('DB crash'));

      const service = await buildService(conn);
      await expect(service.cancel(1, 'staff@mc.org')).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(conn.rollback).toHaveBeenCalled();
    });
  });

  // ── findCancellation ──────────────────────────────────────────────────────────

  describe('findCancellation', () => {
    it('returns the cancellation audit record with staff name', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[
        { id: 1, leave_id: 1, staff_id: 10, reason: 'Personal', staff_name: 'John Doe' },
      ]]);

      const service = await buildService(conn);
      const result = await service.findCancellation(1);

      expect(result.staff_name).toBe('John Doe');
      expect(result.leave_id).toBe(1);
    });

    it('throws NotFoundException when no cancellation record exists', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[]]);

      const service = await buildService(conn);
      await expect(service.findCancellation(99)).rejects.toThrow(NotFoundException);
    });

    it('throws InternalServerErrorException on db error', async () => {
      const conn = makeConn();
      conn.query.mockRejectedValueOnce(new Error('DB error'));

      const service = await buildService(conn);
      await expect(service.findCancellation(1)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});