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
import { S3Service } from '../s3/s3.service';
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

const mockS3Service = {
  uploadLeavePdf: jest.fn().mockResolvedValue('leaves/1/test.pdf'),
  getPresignedUrl: jest.fn().mockResolvedValue('https://s3.example.com/signed'),
  deleteFile: jest.fn().mockResolvedValue(undefined),
};

const buildService = async (conn: ReturnType<typeof makeConn>) => {
  const pool = { getConnection: jest.fn().mockResolvedValue(conn) };
  const module = await Test.createTestingModule({
    providers: [
      LeavesService,
      { provide: 'MYSQL_POOL', useValue: pool },
      { provide: MailService, useValue: mockMailService },
      { provide: S3Service, useValue: mockS3Service },
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
  total_hours: 8,
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
  end_date: '2025-02-01',
  hours: 8,
};

const baseHandoverNote = {
  id: 1,
  unique_id: 'hn-uid-001',
  leave_id: 1,
  staff_email: 'colleague@mc.org',
  note: 'Please cover the Monday standup',
  created_at: new Date(),
};

const baseDto = {
  staffId: 10,
  reason: 'Rest',
  handoverNotes: [
    { staffEmail: 'colleague@mc.org', note: 'Please cover the Monday standup' },
  ],
  leaveDuration: [
    { startDate: '2025-02-01', endDate: '2025-02-01', leaveTypeId: 'lt-uid-001' },
  ],
};

// ─── Mock shape rules ─────────────────────────────────────────────────────────
//
// mysql2 pool.query() always resolves to a tuple: [rows, fields]
// The service destructures: const [rows] = await conn.query(...)
//
// SELECT → mockResolvedValueOnce([[row1, row2, ...]])   outer array = tuple wrapper
// INSERT/UPDATE → mockResolvedValueOnce([{ insertId/affectedRows }])
//
// queueMocks applies these values in order via mockResolvedValueOnce.

function queueMocks(conn: ReturnType<typeof makeConn>, responses: unknown[]): void {
  for (const r of responses) {
    conn.query.mockResolvedValueOnce(r);
  }
}

// ─── Standard sequences ───────────────────────────────────────────────────────
//
// create() — single leave type, one handover note:
//   [0]  [[{ unique_id }]]          leave type existence check
//   [1]  [[]]                       existing durations overlap check
//   [2]  [[{ country }]]            validateBalanceForType — country
//   [3]  [[{ annual_hours, ... }]]  validateBalanceForType — config
//   [4]  [[{ used_hours }]]         validateBalanceForType — used hours
//   [5]  [{ insertId }]             INSERT leaves
//   [6]  [{ insertId }]             INSERT leave_durations
//   [7]  [{ insertId }]             INSERT handover_notes
//   [8]  [[leave]]                  findOne — SELECT leaves
//   [9]  [[duration]]               findOne — SELECT leave_durations
//   [10] [[handoverNote]]           findOne — SELECT handover_notes
//   [11] [[{ staff_email, ... }]]   resolveEmailRecipients — staff/supervisor
//   [12] [[{ email }]]              resolveEmailRecipients — HR list
//   [13] [[{ full_name }]]          resolveStaffName

function setupCreateMocks(conn: ReturnType<typeof makeConn>): void {
  queueMocks(conn, [
    [[{ unique_id: 'lt-uid-001' }]],                                        // [0]
    [[]],                                                                    // [1]
    [[{ country: 'Nigeria' }]],                                             // [2]
    [[{ annual_hours: 160, monthly_accrual_hours: null }]],                 // [3]
    [[{ used_hours: 0 }]],                                                  // [4]
    [{ insertId: 1 }],                                                       // [5]
    [{ insertId: 1 }],                                                       // [6]
    [{ insertId: 1 }],                                                       // [7]
    [[baseLeave]],                                                           // [8]
    [[baseDuration]],                                                        // [9]
    [[baseHandoverNote]],                                                    // [10]
    [[{ staff_email: 'staff@mc.org', supervisor_email: 'sup@mc.org' }]],   // [11]
    [[{ email: 'hr@mc.org' }]],                                             // [12]
    [[{ full_name: 'John Doe' }]],                                          // [13]
  ]);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LeavesService', () => {
beforeEach(() => {
  jest.clearAllMocks();
  (findInternalOverlap as jest.Mock).mockReturnValue(null);
  (rangesOverlap as jest.Mock).mockReturnValue(false);
  (calculateHoursForRange as jest.Mock).mockReturnValue(8);
  mockS3Service.uploadLeavePdf.mockResolvedValue('leaves/1/test.pdf');
});

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a leave, persists durations and handover notes, commits', async () => {
      const conn = makeConn();
      setupCreateMocks(conn);

      const service = await buildService(conn);
      const result = await service.create(baseDto, mockUser);

      expect(result.id).toBe(1);
      expect(result.durations).toHaveLength(1);
      expect(result.handoverNotes).toHaveLength(1);
      expect(result.handoverNotes![0].staff_email).toBe('colleague@mc.org');
      expect(conn.beginTransaction).toHaveBeenCalled();
      expect(conn.commit).toHaveBeenCalled();

      const handoverInsert = conn.query.mock.calls.find(
        (c) => (c[0] as string).includes('INSERT INTO handover_notes'),
      );
      expect(handoverInsert).toBeDefined();
      expect(handoverInsert![1]).toContain('colleague@mc.org');
      expect(handoverInsert![1]).toContain('Please cover the Monday standup');
    });

    it('inserts one handover_notes row per entry', async () => {
      const dto = {
        ...baseDto,
        handoverNotes: [
          { staffEmail: 'a@mc.org', note: 'Task A' },
          { staffEmail: 'b@mc.org', note: 'Task B' },
        ],
      };

      const conn = makeConn();
      queueMocks(conn, [
        [[{ unique_id: 'lt-uid-001' }]],
        [[]],
        [[{ country: 'Nigeria' }]],
        [[{ annual_hours: 160, monthly_accrual_hours: null }]],
        [[{ used_hours: 0 }]],
        [{ insertId: 1 }],   // INSERT leaves
        [{ insertId: 1 }],   // INSERT leave_durations
        [{ insertId: 1 }],   // INSERT handover_notes a@
        [{ insertId: 2 }],   // INSERT handover_notes b@
        [[baseLeave]],
        [[baseDuration]],
        [[baseHandoverNote]],
        [[{ staff_email: 'staff@mc.org', supervisor_email: null }]],
        [[]],
        [[{ full_name: 'John Doe' }]],
      ]);

      const service = await buildService(conn);
      await service.create(dto, mockUser);

      const handoverInserts = conn.query.mock.calls.filter(
        (c) => (c[0] as string).includes('INSERT INTO handover_notes'),
      );
      expect(handoverInserts).toHaveLength(2);
      expect(handoverInserts[0][1]).toContain('a@mc.org');
      expect(handoverInserts[1][1]).toContain('b@mc.org');
    });

    it('sends a handover notification email to each assignee', async () => {
      const dto = {
        ...baseDto,
        handoverNotes: [
          { staffEmail: 'a@mc.org', note: 'Task A' },
          { staffEmail: 'b@mc.org', note: 'Task B' },
        ],
      };

      const conn = makeConn();
      queueMocks(conn, [
        [[{ unique_id: 'lt-uid-001' }]],
        [[]],
        [[{ country: 'Nigeria' }]],
        [[{ annual_hours: 160, monthly_accrual_hours: null }]],
        [[{ used_hours: 0 }]],
        [{ insertId: 1 }],
        [{ insertId: 1 }],
        [{ insertId: 1 }],   // handover a@
        [{ insertId: 2 }],   // handover b@
        [[baseLeave]],
        [[baseDuration]],
        [[baseHandoverNote]],
        [[{ staff_email: 'staff@mc.org', supervisor_email: 'sup@mc.org' }]],
        [[{ email: 'hr@mc.org' }]],
        [[{ full_name: 'John Doe' }]],
      ]);

      const service = await buildService(conn);
      await service.create(dto, mockUser);

      const handoverCalls = mockMailService.sendCaseNotification.mock.calls.filter(
        (c) => c[0].subjectFull === 'Handover Task Assigned',
      );
      expect(handoverCalls).toHaveLength(2);
      expect(handoverCalls[0][0].to).toBe('a@mc.org');
      expect(handoverCalls[1][0].to).toBe('b@mc.org');
    });

    it('creates leave with no handover notes (empty array)', async () => {
      const dto = { ...baseDto, handoverNotes: [] };

      const conn = makeConn();
      queueMocks(conn, [
        [[{ unique_id: 'lt-uid-001' }]],
        [[]],
        [[{ country: 'Nigeria' }]],
        [[{ annual_hours: 160, monthly_accrual_hours: null }]],
        [[{ used_hours: 0 }]],
        [{ insertId: 1 }],   // INSERT leaves
        [{ insertId: 1 }],   // INSERT leave_durations
        [[baseLeave]],
        [[baseDuration]],
        [[]],                // empty handover_notes
        [[{ staff_email: 'staff@mc.org', supervisor_email: null }]],
        [[]],
        [[{ full_name: 'John Doe' }]],
      ]);

      const service = await buildService(conn);
      const result = await service.create(dto, mockUser);

      expect(result.handoverNotes).toHaveLength(0);

      const handoverInserts = conn.query.mock.calls.filter(
        (c) => (c[0] as string).includes('INSERT INTO handover_notes'),
      );
      expect(handoverInserts).toHaveLength(0);

      const handoverEmails = mockMailService.sendCaseNotification.mock.calls.filter(
        (c) => c[0].subjectFull === 'Handover Task Assigned',
      );
      expect(handoverEmails).toHaveLength(0);
    });

    it('creates a leave with multiple leave types', async () => {
      const dto = {
        ...baseDto,
        leaveDuration: [
          { startDate: '2025-02-01', endDate: '2025-02-01', leaveTypeId: 'lt-uid-001' },
          { startDate: '2025-02-03', endDate: '2025-02-03', leaveTypeId: 'lt-uid-002' },
        ],
      };

      const conn = makeConn();
      queueMocks(conn, [
        [[{ unique_id: 'lt-uid-001' }]],
        [[{ unique_id: 'lt-uid-002' }]],
        [[]],
        [[{ country: 'Nigeria' }]],
        [[{ annual_hours: 160, monthly_accrual_hours: null }]],
        [[{ used_hours: 0 }]],
        [[{ country: 'Nigeria' }]],
        [[{ annual_hours: 80, monthly_accrual_hours: null }]],
        [[{ used_hours: 0 }]],
        [{ insertId: 1 }],   // INSERT leaves
        [{ insertId: 1 }],   // INSERT duration 1
        [{ insertId: 2 }],   // INSERT duration 2
        [{ insertId: 1 }],   // INSERT handover_notes
        [[baseLeave]],
        [[baseDuration]],
        [[baseHandoverNote]],
        [[{ staff_email: 'staff@mc.org', supervisor_email: null }]],
        [[]],
        [[{ full_name: 'John Doe' }]],
      ]);

      const service = await buildService(conn);
      const result = await service.create(dto, mockUser);

      expect(result.id).toBe(1);
      expect(conn.commit).toHaveBeenCalled();
    });

    it('throws BadRequestException on internal date range overlap', async () => {
      (findInternalOverlap as jest.Mock).mockReturnValue({ a: 0, b: 1 });
      const conn = makeConn();
      const service = await buildService(conn);

      await expect(service.create(baseDto, mockUser)).rejects.toThrow(BadRequestException);
      expect(conn.beginTransaction).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when endDate is before startDate', async () => {
      const dto = {
        ...baseDto,
        leaveDuration: [
          { startDate: '2025-02-05', endDate: '2025-02-01', leaveTypeId: 'lt-uid-001' },
        ],
      };
      const conn = makeConn();
      const service = await buildService(conn);

      await expect(service.create(dto, mockUser)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when leave type does not exist', async () => {
      const conn = makeConn();
      queueMocks(conn, [
        [[]], // leave type query returns empty rows → not found
      ]);

      const service = await buildService(conn);
      await expect(service.create(baseDto, mockUser)).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when range overlaps existing leave', async () => {
      (rangesOverlap as jest.Mock).mockReturnValue(true);
      const conn = makeConn();
      queueMocks(conn, [
        [[{ unique_id: 'lt-uid-001' }]],
        [[{ start_date: '2025-02-01', end_date: '2025-02-01' }]],
      ]);

      const service = await buildService(conn);
      await expect(service.create(baseDto, mockUser)).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when all ranges produce 0 working hours', async () => {
      (calculateHoursForRange as jest.Mock).mockReturnValue(0);
      const conn = makeConn();
      queueMocks(conn, [
        [[{ unique_id: 'lt-uid-001' }]],
        [[]],
      ]);

      const service = await buildService(conn);
      await expect(service.create(baseDto, mockUser)).rejects.toThrow(BadRequestException);
    });



    it('throws BadRequestException when no leave policy configured for country', async () => {
      const conn = makeConn();
      queueMocks(conn, [
        [[{ unique_id: 'lt-uid-001' }]],
        [[]],
        [[{ country: 'Nigeria' }]],
        [[]], // no config row
      ]);

      const service = await buildService(conn);
      await expect(service.create(baseDto, mockUser)).rejects.toThrow(BadRequestException);
    });

    it('commits and returns leave even when notification throws', async () => {
      mockMailService.sendCaseNotification.mockRejectedValueOnce(new Error('SMTP down'));

      const conn = makeConn();
      setupCreateMocks(conn);

      const service = await buildService(conn);
      const result = await service.create(baseDto, mockUser);

      expect(result.id).toBe(1);
      expect(conn.commit).toHaveBeenCalled();
    });

    it('rolls back and throws InternalServerErrorException on unexpected db error', async () => {
      const conn = makeConn();
      queueMocks(conn, [
        [[{ unique_id: 'lt-uid-001' }]],
        [[]],
        [[{ country: 'Nigeria' }]],
        [[{ annual_hours: 160, monthly_accrual_hours: null }]],
        [[{ used_hours: 0 }]],
      ]);
      conn.query.mockRejectedValueOnce(new Error('DB crash')); // INSERT leaves fails

      const service = await buildService(conn);
      await expect(service.create(baseDto, mockUser)).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(conn.rollback).toHaveBeenCalled();
    });
  });

  // ── findAll ──────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated leaves with durations and handover notes attached', async () => {
      const conn = makeConn();
      queueMocks(conn, [
        [[{ total: 1 }]],
        [[baseLeave]],
        [[baseDuration]],
        [[baseHandoverNote]],
      ]);

      const service = await buildService(conn);
      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].durations).toHaveLength(1);
      expect(result.data[0].handoverNotes).toHaveLength(1);
      expect(result.data[0].handoverNotes![0].staff_email).toBe('colleague@mc.org');
      expect(result.meta.total).toBe(1);
    });

    it('groups handover notes correctly across multiple leaves', async () => {
      const leave2 = { ...baseLeave, id: 2 };
      const hn2 = { ...baseHandoverNote, id: 2, leave_id: 2, staff_email: 'other@mc.org' };

      const conn = makeConn();
      queueMocks(conn, [
        [[{ total: 2 }]],
        [[baseLeave, leave2]],
        [[baseDuration, { ...baseDuration, id: 2, leave_id: 2 }]],
        [[baseHandoverNote, hn2]],
      ]);

      const service = await buildService(conn);
      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data[0].handoverNotes![0].staff_email).toBe('colleague@mc.org');
      expect(result.data[1].handoverNotes![0].staff_email).toBe('other@mc.org');
    });

    it('returns empty handoverNotes array when leave has none', async () => {
      const conn = makeConn();
      queueMocks(conn, [
        [[{ total: 1 }]],
        [[baseLeave]],
        [[baseDuration]],
        [[]], // no handover notes
      ]);

      const service = await buildService(conn);
      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data[0].handoverNotes).toEqual([]);
    });

    it('skips duration and handover queries when page is empty', async () => {
      const conn = makeConn();
      queueMocks(conn, [
        [[{ total: 0 }]],
        [[]], // empty page
      ]);

      const service = await buildService(conn);
      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(0);
      expect(conn.query).toHaveBeenCalledTimes(2);
    });

    it('filters by status', async () => {
      const conn = makeConn();
      queueMocks(conn, [[[{ total: 0 }]], [[]], [[]], [[]]]);

      const service = await buildService(conn);
      await service.findAll({ page: 1, limit: 10, status: 'Approved' });

      expect((conn.query.mock.calls[0][0] as string)).toContain('WHERE');
      expect(conn.query.mock.calls[0][1]).toContain('Approved');
    });

    it('filters by staffId', async () => {
      const conn = makeConn();
      queueMocks(conn, [[[{ total: 0 }]], [[]], [[]], [[]]]);

      const service = await buildService(conn);
      await service.findAll({ page: 1, limit: 10, staffId: 10 });

      expect(conn.query.mock.calls[0][1]).toContain(10);
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
    it('returns leave with durations and handover notes', async () => {
      const conn = makeConn();
      queueMocks(conn, [
        [[baseLeave]],
        [[baseDuration]],
        [[baseHandoverNote]],
      ]);

      const service = await buildService(conn);
      const result = await service.findOne(1);

      expect(result.id).toBe(1);
      expect(result.durations![0].leave_type_name).toBe('Annual Leave');
      expect(result.handoverNotes![0].staff_email).toBe('colleague@mc.org');
      expect(result.handoverNotes![0].note).toBe('Please cover the Monday standup');
    });

    it('returns empty handoverNotes when none exist', async () => {
      const conn = makeConn();
      queueMocks(conn, [[[baseLeave]], [[baseDuration]], [[]]]);

      const service = await buildService(conn);
      const result = await service.findOne(1);

      expect(result.handoverNotes).toEqual([]);
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
      queueMocks(conn, [
        [[baseLeave]],
        [{ affectedRows: 1 }],
        [[baseLeave]],
        [[baseDuration]],
        [[baseHandoverNote]],
        [[{ staff_email: 'staff@mc.org', supervisor_email: 'sup@mc.org' }]],
        [[{ email: 'hr@mc.org' }]],
        [[{ full_name: 'John Doe' }]],
      ]);

      const service = await buildService(conn);
      const result = await service.review(1, 'hr@mc.org');

      expect(result.id).toBe(1);
      expect(mockMailService.sendCaseNotification).toHaveBeenCalledTimes(2);
      const subjects = mockMailService.sendCaseNotification.mock.calls.map(
        (c) => c[0].subjectFull,
      );
      expect(subjects.every((s: string) => s === 'Leave Request Reviewed')).toBe(true);
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

    it('approves a Reviewed leave and deducts balance', async () => {
      const conn = makeConn();
      queueMocks(conn, [
        [[reviewedLeave]],
        [[baseDuration]],
        [[{ id: 5, remaining_hours: 100 }]],
        [[{ country: 'Nigeria' }]],
        [[{ annual_hours: 160, monthly_accrual_hours: null }]],
        [[{ used_hours: 0 }]],
        [{ affectedRows: 1 }],   // UPDATE leaves
        [{ affectedRows: 1 }],   // UPDATE leave_balances
        [{ insertId: 1 }],       // INSERT transaction
        [[reviewedLeave]],
        [[baseDuration]],
        [[baseHandoverNote]],
        [[{ staff_email: 'staff@mc.org', supervisor_email: null }]],
        [[{ email: 'hr@mc.org' }]],
        [[{ full_name: 'John Doe' }]],
      ]);

      const service = await buildService(conn);
      const result = await service.approve(1, 'sup@mc.org');

      expect(result.id).toBe(1);
      expect(conn.commit).toHaveBeenCalled();

      const deductCall = conn.query.mock.calls.find(
        (c) => (c[0] as string).includes('used_hours = used_hours +'),
      );
      expect(deductCall).toBeDefined();
    });

    it('deducts balance separately for each leave type', async () => {
      const multiDurations = [
        { ...baseDuration, leave_type_id: 'lt-uid-001', hours: 8 },
        { ...baseDuration, id: 2, leave_type_id: 'lt-uid-002', leave_type_name: 'Exam Leave', hours: 8 },
      ];

      const conn = makeConn();
      queueMocks(conn, [
        [[reviewedLeave]],
        [multiDurations],
        [[{ id: 5, remaining_hours: 80 }]],
        [[{ id: 6, remaining_hours: 40 }]],
        [[{ country: 'Nigeria' }]],
        [[{ annual_hours: 160, monthly_accrual_hours: null }]],
        [[{ used_hours: 0 }]],
        [[{ country: 'Nigeria' }]],
        [[{ annual_hours: 80, monthly_accrual_hours: null }]],
        [[{ used_hours: 0 }]],
        [{ affectedRows: 1 }],   // UPDATE leaves
        [{ affectedRows: 1 }],   // UPDATE balance lt-uid-001
        [{ insertId: 1 }],       // INSERT txn lt-uid-001
        [{ affectedRows: 1 }],   // UPDATE balance lt-uid-002
        [{ insertId: 2 }],       // INSERT txn lt-uid-002
        [[reviewedLeave]],
        [multiDurations],
        [[baseHandoverNote]],
        [[{ staff_email: 'staff@mc.org', supervisor_email: null }]],
        [[]],
        [[{ full_name: 'John Doe' }]],
      ]);

      const service = await buildService(conn);
      await service.approve(1, 'sup@mc.org');

      const deductCalls = conn.query.mock.calls.filter(
        (c) => (c[0] as string).includes('used_hours = used_hours +'),
      );
      expect(deductCalls).toHaveLength(2);
    });

    it('throws BadRequestException when leave is not Reviewed', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[baseLeave]]);

      const service = await buildService(conn);
      await expect(service.approve(1, 'sup@mc.org')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when balance record not found', async () => {
      const conn = makeConn();
      queueMocks(conn, [
        [[reviewedLeave]],
        [[baseDuration]],
        [[]], // no balance row
      ]);

      const service = await buildService(conn);
      await expect(service.approve(1, 'sup@mc.org')).rejects.toThrow(BadRequestException);
      expect(conn.rollback).toHaveBeenCalled();
    });

    it('throws BadRequestException when remaining hours insufficient', async () => {
      const conn = makeConn();
      queueMocks(conn, [
        [[reviewedLeave]],
        [[baseDuration]],
        [[{ id: 5, remaining_hours: 4 }]],
      ]);

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
      queueMocks(conn, [[[reviewedLeave]], [[baseDuration]]]);
      conn.query.mockRejectedValueOnce(new Error('DB crash'));

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
      queueMocks(conn, [
        [[baseLeave]],
        [{ affectedRows: 1 }],
        [[baseLeave]],
        [[baseDuration]],
        [[baseHandoverNote]],
        [[{ staff_email: 'staff@mc.org', supervisor_email: null }]],
        [[]],
        [[{ full_name: 'John Doe' }]],
      ]);

      const service = await buildService(conn);
      await service.reject(1, 'hr@mc.org');

      expect(conn.commit).toHaveBeenCalled();
      const balanceUpdate = conn.query.mock.calls.find(
        (c) => (c[0] as string).includes('used_hours = used_hours -'),
      );
      expect(balanceUpdate).toBeUndefined();
    });

    it('restores balance per leave type when rejecting an Approved leave', async () => {
      const approvedLeave = { ...baseLeave, status: 'Approved' as const };

      const conn = makeConn();
      queueMocks(conn, [
        [[approvedLeave]],
        [{ affectedRows: 1 }],
        [[baseDuration]],
        [[{ id: 5 }]],
        [{ affectedRows: 1 }],
        [{ insertId: 1 }],
        [[approvedLeave]],
        [[baseDuration]],
        [[baseHandoverNote]],
        [[{ staff_email: 'staff@mc.org', supervisor_email: null }]],
        [[]],
        [[{ full_name: 'John Doe' }]],
      ]);

      const service = await buildService(conn);
      await service.reject(1, 'hr@mc.org');

      const restoreCall = conn.query.mock.calls.find(
        (c) => (c[0] as string).includes('used_hours = used_hours -'),
      );
      expect(restoreCall).toBeDefined();

      const reversalInsert = conn.query.mock.calls.find(
        (c) => (c[0] as string).includes("'reversal'"),
      );
      expect(reversalInsert).toBeDefined();
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
      queueMocks(conn, [[[baseLeave]]]);
      conn.query.mockRejectedValueOnce(new Error('DB crash'));

      const service = await buildService(conn);
      await expect(service.reject(1, 'hr@mc.org')).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(conn.rollback).toHaveBeenCalled();
    });
  });

  // ── cancel ───────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('cancels a Pending leave and writes cancellation audit record', async () => {
      const conn = makeConn();
      queueMocks(conn, [
        [[baseLeave]],
        [{ affectedRows: 1 }],
        [{ insertId: 1 }],
        [[baseLeave]],
        [[baseDuration]],
        [[baseHandoverNote]],
        [[{ staff_email: 'staff@mc.org', supervisor_email: 'sup@mc.org' }]],
        [[{ email: 'hr@mc.org' }]],
        [[{ full_name: 'John Doe' }]],
      ]);

      const service = await buildService(conn);
      const result = await service.cancel(1, 'staff@mc.org', 'Personal reasons');

      expect(result.id).toBe(1);
      expect(conn.commit).toHaveBeenCalled();

      const cancellationInsert = conn.query.mock.calls.find(
        (c) => (c[0] as string).includes('leave_cancellations'),
      );
      expect(cancellationInsert).toBeDefined();
      expect(cancellationInsert![1]).toContain('Personal reasons');
    });

    it('cancels a Reviewed leave', async () => {
      const conn = makeConn();
      queueMocks(conn, [
        [[{ ...baseLeave, status: 'Reviewed' }]],
        [{ affectedRows: 1 }],
        [{ insertId: 1 }],
        [[baseLeave]],
        [[baseDuration]],
        [[baseHandoverNote]],
        [[{ staff_email: 'staff@mc.org', supervisor_email: null }]],
        [[]],
        [[{ full_name: 'John Doe' }]],
      ]);

      const service = await buildService(conn);
      const result = await service.cancel(1, 'staff@mc.org');
      expect(result.id).toBe(1);
    });

    it('passes null reason to cancellation record when not provided', async () => {
      const conn = makeConn();
      queueMocks(conn, [
        [[baseLeave]],
        [{ affectedRows: 1 }],
        [{ insertId: 1 }],
        [[baseLeave]],
        [[baseDuration]],
        [[baseHandoverNote]],
        [[{ staff_email: 'staff@mc.org', supervisor_email: null }]],
        [[]],
        [[{ full_name: 'John Doe' }]],
      ]);

      const service = await buildService(conn);
      await service.cancel(1, 'staff@mc.org');

      const cancellationInsert = conn.query.mock.calls.find(
        (c) => (c[0] as string).includes('leave_cancellations'),
      );
      expect(cancellationInsert![1]).toContain(null);
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
      queueMocks(conn, [[[baseLeave]]]);
      conn.query.mockRejectedValueOnce(new Error('DB crash'));

      const service = await buildService(conn);
      await expect(service.cancel(1, 'staff@mc.org')).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(conn.rollback).toHaveBeenCalled();
    });
  });

  // ── findCancellation ──────────────────────────────────────────────────────────

  describe('findCancellation', () => {
    it('returns the cancellation record with staff name', async () => {
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

it('throws BadRequestException when balance is insufficient', async () => {
  const conn = makeConn();
  queueMocks(conn, [
    [[{ unique_id: 'lt-uid-001' }]],                       // leave type check
    [[]],                                                   // overlap check
    [[{ country: 'Nigeria' }]],                            // validateBalance — country
    [[{ annual_hours: 8, monthly_accrual_hours: null }]],  // validateBalance — config
    [[{ used_hours: 8 }]],                                 // validateBalance — used hours
    [[[{ name: 'Annual Leave' }]]],                        // leave type name (double-destructured)
  ]);

  const service = await buildService(conn);
  await expect(service.create(baseDto, mockUser)).rejects.toThrow(BadRequestException);
  expect(conn.beginTransaction).not.toHaveBeenCalled();
});
  
});