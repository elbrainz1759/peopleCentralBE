import { Test } from '@nestjs/testing';
import {
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ExitInterviewService } from './exit-interviews.service';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../utils/check-exit.util', () => ({
  ensureExists: jest.fn().mockResolvedValue(undefined),
}));

const makeConn = () => ({
  query: jest.fn(),
  execute: jest.fn().mockResolvedValue([{ affectedRows: 1 }]),
  beginTransaction: jest.fn().mockResolvedValue(undefined),
  commit: jest.fn().mockResolvedValue(undefined),
  rollback: jest.fn().mockResolvedValue(undefined),
  release: jest.fn(),
});

const buildService = async (conn: ReturnType<typeof makeConn>) => {
  const pool = { getConnection: jest.fn().mockResolvedValue(conn) };
  const module = await Test.createTestingModule({
    providers: [
      ExitInterviewService,
      { provide: 'MYSQL_POOL', useValue: pool },
    ],
  }).compile();
  return module.get(ExitInterviewService);
};

function q(conn: ReturnType<typeof makeConn>, responses: unknown[]): void {
  for (const r of responses) {
    conn.query.mockResolvedValueOnce(r);
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockUser: RequestUser = { email: 'hr@mc.org', sub: 1, role: 'hr' };

const baseInterview = {
  id: 1,
  unique_id: 'abc123',
  staff_id: 1001,
  department_id: 'dept-uid',
  supervisor_id: 'sup-uid',
  program_id: 'prog-uid',
  country_id: 'country-uid',
  location_id: 'loc-uid',
  resignation_date: '2026-07-01',
  reason_for_leaving: 'Better Opportunity',
  stage: 'Supervisor',
  status: 'Pending',
  supervisor_cleared: 'Pending',
  hr_cleared: 'Pending',
  operations_cleared: 'Pending',
  finance_cleared: 'Pending',
  hr_director_cleared: 'Pending',
  created_by: 'hr@mc.org',
  created_at: new Date(),
  updated_at: new Date(),
};

const baseDetail = {
  ...baseInterview,
  staff_first_name: 'John',
  staff_last_name: 'Doe',
  department_name: 'Finance',
  location_name: 'Abuja',
  country_name: 'Nigeria',
  program_name: 'NGA',
};

const baseClearance = {
  id: '1',
  unique_id: 'cl-uid',
  exit_interview_id: 'abc123',
  check_list_item_id: '1',
  department: 'HR',
  cleared_by: 'hr@mc.org',
  cleared_at: new Date(),
  notes: null,
  item_name: 'Return laptop',
};

// findOne() always does: SELECT detail + no extra queries (single conn)
// But findOne opens its OWN connection, so the same conn mock handles it
const findOneSeq = (detail = baseDetail) => [
  [[detail]], // SELECT ei.* + joins WHERE unique_id
];

const clearanceStatusSeq = (
  row = baseInterview,
  clearances = [baseClearance],
) => [
  [[row]], // SELECT stage, status, cleared flags
  [[...clearances]], // SELECT clearances
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ExitInterviewService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates an exit interview and returns detail', async () => {
      const conn = makeConn();
      q(conn, [
        [[{ id: 99 }]], // supervisor exists check
        [{ insertId: 1 }], // INSERT exit_interviews
        // writeAuditLog uses conn.execute (already mocked)
        [[baseDetail]], // findOne — SELECT detail
      ]);

      const service = await buildService(conn);
      const result = await service.create(
        {
          staffId: 1001,
          departmentId: 'dept-uid',
          supervisorId: 'sup-uid',
          programId: 'prog-uid',
          countryId: 'country-uid',
          locationId: 'loc-uid',
          resignationDate: '2026-07-01',
          reasonForLeaving: 'Better Opportunity',
        } as any,
        mockUser,
      );

      expect(result.unique_id).toBe('abc123');
      expect(conn.execute).toHaveBeenCalled(); // audit log
    });

    it('throws NotFoundException when supervisor not found', async () => {
      const conn = makeConn();
      q(conn, [
        [[]], // supervisor not found
      ]);

      const service = await buildService(conn);
      await expect(
        service.create(
          { supervisorId: 'bad-uid', staffId: 1 } as any,
          mockUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws InternalServerErrorException on db error', async () => {
      const conn = makeConn();
      conn.query.mockRejectedValueOnce(new Error('DB crash'));

      const service = await buildService(conn);
      await expect(
        service.create({ supervisorId: 'uid' } as any, mockUser),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ── findAll ──────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated results', async () => {
      const conn = makeConn();
      q(conn, [[[{ total: 1 }]], [[baseDetail]]]);

      const service = await buildService(conn);
      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('applies search filter', async () => {
      const conn = makeConn();
      q(conn, [[[{ total: 0 }]], [[]]]);

      const service = await buildService(conn);
      await service.findAll({ page: 1, limit: 10, search: 'John' });

      const sql = conn.query.mock.calls[0][0] as string;
      expect(sql).toContain('LIKE');
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
    it('returns interview detail', async () => {
      const conn = makeConn();
      q(conn, [[[baseDetail]]]);

      const service = await buildService(conn);
      const result = await service.findOne('abc123');

      expect(result.unique_id).toBe('abc123');
      expect(result.staff_first_name).toBe('John');
    });

    it('throws NotFoundException when not found', async () => {
      const conn = makeConn();
      q(conn, [[[]]]); // empty rows

      const service = await buildService(conn);
      await expect(service.findOne('bad')).rejects.toThrow(NotFoundException);
    });
  });

  // ── findByStaffId ────────────────────────────────────────────────────────────

  describe('findByStaffId', () => {
    it('returns interviews for a staff member', async () => {
      const conn = makeConn();
      q(conn, [[[baseDetail]]]);

      const service = await buildService(conn);
      const result = await service.findByStaffId(1001);

      expect(result).toHaveLength(1);
      expect(result[0].staff_id).toBe(1001);
    });

    it('returns empty array when none found', async () => {
      const conn = makeConn();
      q(conn, [[[]]]);

      const service = await buildService(conn);
      const result = await service.findByStaffId(999);
      expect(result).toHaveLength(0);
    });
  });

  // ── findBySupervisorId ────────────────────────────────────────────────────────

  describe('findBySupervisorId', () => {
    it('returns interviews for a supervisor', async () => {
      const conn = makeConn();
      q(conn, [[[baseDetail]]]);

      const service = await buildService(conn);
      const result = await service.findBySupervisorId('sup-uid');

      expect(result).toHaveLength(1);
    });
  });

  // ── findPendingByDepartment ───────────────────────────────────────────────────

  describe('findPendingByDepartment', () => {
    it('returns pending interviews for Operations', async () => {
      const conn = makeConn();
      q(conn, [[[{ total: 1 }]], [[baseDetail]]]);

      const service = await buildService(conn);
      const result = await service.findPendingByDepartment('Operations');

      expect(result.data).toHaveLength(1);
      const sql = conn.query.mock.calls[0][0] as string;
      expect(sql).toContain('operations_cleared');
      expect(sql).toContain("'Pending'");
    });

    it('returns pending interviews for HR_Director', async () => {
      const conn = makeConn();
      q(conn, [[[{ total: 0 }]], [[]]]);

      const service = await buildService(conn);
      const result = await service.findPendingByDepartment('HR_Director');

      expect(result.data).toHaveLength(0);
      const sql = conn.query.mock.calls[0][0] as string;
      expect(sql).toContain('hr_director_cleared');
    });
  });

  // ── clearDepartment ───────────────────────────────────────────────────────────

  describe('clearDepartment', () => {
    const setupClearConn = (department: string) => {
      const conn = makeConn();
      q(conn, [
        [[{ stage: department, status: 'Pending' }]], // existing check
        // getClearanceStatus after commit:
        [[{ ...baseInterview, stage: department }]], // row
        [[]], // clearances
      ]);
      return conn;
    };

    it('Supervisor clearance advances stage to Operations and status to Operations', async () => {
      const conn = setupClearConn('Supervisor');
      const service = await buildService(conn);

      await service.clearDepartment(
        'abc123',
        'Supervisor',
        'sup@mc.org',
        [1],
        'Done',
      );

      expect(conn.commit).toHaveBeenCalled();

      // Verify cleared flag set to Yes
      const flagUpdate = conn.execute.mock.calls.find((c) =>
        (c[0] as string).includes('supervisor_cleared'),
      );
      expect(flagUpdate).toBeDefined();
      expect(flagUpdate![0]).toContain("'Yes'");

      // Verify stage and status advanced
      const stageUpdate = conn.execute.mock.calls.find(
        (c) =>
          (c[0] as string).includes('stage = ?') &&
          (c[0] as string).includes('status = ?'),
      );
      expect(stageUpdate![1][0]).toBe('Operations');
      expect(stageUpdate![1][1]).toBe('Operations');
    });

    it('Operations clearance advances to Finance', async () => {
      const conn = setupClearConn('Operations');
      const service = await buildService(conn);

      await service.clearDepartment('abc123', 'Operations', 'ops@mc.org', [1]);

      const stageUpdate = conn.execute.mock.calls.find(
        (c) =>
          (c[0] as string).includes('stage = ?') &&
          (c[0] as string).includes('status = ?'),
      );
      expect(stageUpdate![1][0]).toBe('Finance');
      expect(stageUpdate![1][1]).toBe('Finance');
    });

    it('Finance clearance advances to HR', async () => {
      const conn = setupClearConn('Finance');
      const service = await buildService(conn);

      await service.clearDepartment('abc123', 'Finance', 'fin@mc.org', [1]);

      const stageUpdate = conn.execute.mock.calls.find(
        (c) =>
          (c[0] as string).includes('stage = ?') &&
          (c[0] as string).includes('status = ?'),
      );
      expect(stageUpdate![1][0]).toBe('HR');
      expect(stageUpdate![1][1]).toBe('HR');
    });

    it('HR clearance advances to HR_Director', async () => {
      const conn = setupClearConn('HR');
      const service = await buildService(conn);

      await service.clearDepartment('abc123', 'HR', 'hr@mc.org', [1]);

      const stageUpdate = conn.execute.mock.calls.find(
        (c) =>
          (c[0] as string).includes('stage = ?') &&
          (c[0] as string).includes('status = ?'),
      );
      expect(stageUpdate![1][0]).toBe('HR_Director');
      expect(stageUpdate![1][1]).toBe('HR_Director');
    });

    it('HR_Director clearance sets stage to Completed and status to Approved', async () => {
      const conn = setupClearConn('HR_Director');
      const service = await buildService(conn);

      await service.clearDepartment('abc123', 'HR_Director', 'dir@mc.org', [1]);

      const stageUpdate = conn.execute.mock.calls.find(
        (c) =>
          (c[0] as string).includes('stage = ?') &&
          (c[0] as string).includes('status = ?'),
      );
      expect(stageUpdate![1][0]).toBe('Completed');
      expect(stageUpdate![1][1]).toBe('Approved');
    });

    it('writes a single audit log entry per clearance', async () => {
      const conn = setupClearConn('Supervisor');
      const service = await buildService(conn);

      await service.clearDepartment('abc123', 'Supervisor', 'sup@mc.org', [1]);

      const auditCalls = conn.execute.mock.calls.filter((c) =>
        (c[0] as string).includes('exit_interview_audit_log'),
      );
      expect(auditCalls).toHaveLength(1); // single combined entry now
    });

    it('throws NotFoundException when interview not found', async () => {
      const conn = makeConn();
      q(conn, [[[]]]); // existing check returns empty

      const service = await buildService(conn);
      await expect(
        service.clearDepartment('bad', 'HR', 'hr@mc.org', [1]),
      ).rejects.toThrow(NotFoundException);
      expect(conn.rollback).toHaveBeenCalled();
    });

    it('rolls back on unexpected db error', async () => {
      const conn = makeConn();
      q(conn, [[[{ stage: 'HR', status: 'HR' }]]]);
      conn.execute.mockRejectedValueOnce(new Error('DB crash'));

      const service = await buildService(conn);
      await expect(
        service.clearDepartment('abc123', 'HR', 'hr@mc.org', [1]),
      ).rejects.toThrow(InternalServerErrorException);
      expect(conn.rollback).toHaveBeenCalled();
    });
  });

  // ── finalize ──────────────────────────────────────────────────────────────────

  describe('finalize', () => {
    it('finalizes when stage is HR_Director and sets status to Approved', async () => {
      const conn = makeConn();
      q(conn, [
        [[{ stage: 'HR_Director', status: 'HR_Director' }]], // SELECT stage check
        [[baseDetail]], // findOne after update
      ]);

      const service = await buildService(conn);
      const result = await service.finalize('abc123', mockUser);

      expect(result.unique_id).toBe('abc123');

      const updateCall = conn.execute.mock.calls.find((c) =>
        (c[0] as string).includes("status = 'Approved'"),
      );
      expect(updateCall).toBeDefined();

      const auditCall = conn.execute.mock.calls.find((c) =>
        (c[0] as string).includes('exit_interview_audit_log'),
      );
      expect(auditCall).toBeDefined();
      expect(auditCall![1]).toContain('Approved'); // toStatus
    });

    it('throws InternalServerErrorException when stage is not HR_Director', async () => {
      const conn = makeConn();
      q(conn, [[[{ stage: 'HR', status: 'HR' }]]]);

      const service = await buildService(conn);
      await expect(service.finalize('abc123', mockUser)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('throws NotFoundException when interview not found', async () => {
      const conn = makeConn();
      q(conn, [[[]]]); // [[row]] returns undefined

      const service = await buildService(conn);
      await expect(service.finalize('bad', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── getClearanceStatus ────────────────────────────────────────────────────────

  describe('getClearanceStatus', () => {
    it('returns hr_can_finalize=true only when stage is HR_Director', async () => {
      const conn = makeConn();
      q(conn, [
        [[{ ...baseInterview, stage: 'HR_Director', status: 'HR_Director' }]],
        [[]],
      ]);

      const service = await buildService(conn);
      const result = await service.getClearanceStatus('abc123');

      expect(result.hr_can_finalize).toBe(true);
      expect(result.status).toBe('HR_Director');
    });

    it('returns completed=true when stage is Completed', async () => {
      const conn = makeConn();
      q(conn, [
        [[{ ...baseInterview, stage: 'Completed', status: 'Approved' }]],
        [[]],
      ]);

      const service = await buildService(conn);
      const result = await service.getClearanceStatus('abc123');

      expect(result.completed).toBe(true);
      expect(result.status).toBe('Approved');
    });

    it('returns status field in the result', async () => {
      const conn = makeConn();
      q(conn, [
        [[{ ...baseInterview, stage: 'Finance', status: 'Finance' }]],
        [[]],
      ]);

      const service = await buildService(conn);
      const result = await service.getClearanceStatus('abc123');

      expect(result.status).toBe('Finance');
    });
  });

  // ── update ────────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates fields and writes audit log', async () => {
      const conn = makeConn();
      q(conn, [
        [[{ id: 1 }]], // existence check
        [[baseDetail]], // findOne after update
      ]);

      const service = await buildService(conn);
      const result = await service.update(
        'abc123',
        { stage: 'HR', status: 'In_Progress' },
        mockUser,
      );

      expect(result.unique_id).toBe('abc123');

      const updateCall = conn.execute.mock.calls.find((c) =>
        (c[0] as string).includes('UPDATE exit_interviews SET'),
      );
      expect(updateCall).toBeDefined();
      expect(updateCall![0]).toContain('stage = ?');

      const auditCall = conn.execute.mock.calls.find((c) =>
        (c[0] as string).includes('exit_interview_audit_log'),
      );
      expect(auditCall).toBeDefined();
      expect(auditCall![1][8]).toContain('stage, status');
    });

    it('returns existing record when dto is empty', async () => {
      const conn = makeConn();
      q(conn, [[[{ id: 1 }]], [[baseDetail]]]);

      const service = await buildService(conn);
      const result = await service.update('abc123', {}, mockUser);

      expect(result.unique_id).toBe('abc123');
      const updateCall = conn.execute.mock.calls.find((c) =>
        (c[0] as string).includes('UPDATE exit_interviews SET'),
      );
      expect(updateCall).toBeUndefined();
    });

    it('throws NotFoundException when not found', async () => {
      const conn = makeConn();
      q(conn, [[[]]]); // existence check

      const service = await buildService(conn);
      await expect(
        service.update('bad', { stage: 'HR' }, mockUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes and returns confirmation', async () => {
      const conn = makeConn();
      q(conn, [[[{ id: 1 }]]]);

      const service = await buildService(conn);
      const result = await service.remove('abc123');

      expect(result.message).toContain('deleted successfully');
      expect(conn.execute).toHaveBeenCalledWith(
        expect.stringContaining('DELETE'),
        ['abc123'],
      );
    });

    it('throws NotFoundException when not found', async () => {
      const conn = makeConn();
      q(conn, [[[]]]);

      const service = await buildService(conn);
      await expect(service.remove('bad')).rejects.toThrow(NotFoundException);
    });
  });

  // ── getAuditLog ───────────────────────────────────────────────────────────────

  describe('getAuditLog', () => {
    it('returns audit log entries for an interview', async () => {
      const conn = makeConn();
      q(conn, [
        [
          [
            {
              id: 1,
              unique_id: 'log-uid',
              interview_id: 'abc123',
              action: 'Exit interview submitted',
              from_stage: null,
              to_stage: 'Supervisor',
              performed_by: 'hr@mc.org',
              created_at: new Date(),
            },
          ],
        ],
      ]);

      const service = await buildService(conn);
      const result = await service.getAuditLog('abc123');

      expect(result).toHaveLength(1);
      expect(result[0].action).toBe('Exit interview submitted');
      expect(result[0].performed_by).toBe('hr@mc.org');
    });

    it('returns empty array when no logs exist', async () => {
      const conn = makeConn();
      q(conn, [[[]]]);

      const service = await buildService(conn);
      const result = await service.getAuditLog('abc123');
      expect(result).toHaveLength(0);
    });

    it('throws InternalServerErrorException on db error', async () => {
      const conn = makeConn();
      conn.query.mockRejectedValueOnce(new Error('DB error'));

      const service = await buildService(conn);
      await expect(service.getAuditLog('abc123')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ── getDashboard ──────────────────────────────────────────────────────────────

  describe('getDashboard', () => {
    it('returns all dashboard aggregates', async () => {
      const conn = makeConn();
      q(conn, [
        [[{ total: 5 }]], // total
        [[{ stage: 'HR', count: 3 }]], // by_stage
        [[{ status: 'Pending', count: 5 }]], // by_status
        [[{ department: 'Finance', count: 2 }]], // by_department
        [[{ location: 'Abuja', count: 3 }]], // by_location
        [[{ country: 'Nigeria', count: 5 }]], // by_country
        [[{ would_recommend: 'Yes', count: 4 }]], // would_recommend
        [[{ month: '2026-06', count: 2 }]], // monthly_trend
        [[{ year: 2026, count: 5 }]], // yearly_trend
      ]);

      const service = await buildService(conn);
      const result = await service.getDashboard();

      expect(result.total).toBe(5);
      expect(result.by_stage).toHaveLength(1);
      expect(result.by_status).toHaveLength(1);
      expect(result.monthly_trend).toHaveLength(1);
      expect(result.yearly_trend).toHaveLength(1);
    });

    it('throws InternalServerErrorException on db error', async () => {
      const conn = makeConn();
      conn.query.mockRejectedValueOnce(new Error('DB error'));

      const service = await buildService(conn);
      await expect(service.getDashboard()).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
