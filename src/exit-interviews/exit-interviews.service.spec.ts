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

const clearanceStatusSeq = (row = baseInterview, clearances = [baseClearance]) => [
  [[row]],         // SELECT stage, status, cleared flags
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
        [[{ id: 99 }]],       // supervisor exists check
        [{ insertId: 1 }],    // INSERT exit_interviews
        // writeAuditLog uses conn.execute (already mocked)
        [[baseDetail]],       // findOne — SELECT detail
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
        service.create({ supervisorId: 'bad-uid', staffId: 1 } as any, mockUser),
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
      q(conn, [
        [[{ total: 1 }]],
        [[baseDetail]],
      ]);

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
      q(conn, [
        [[{ total: 1 }]],
        [[baseDetail]],
      ]);

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

  // ── getClearanceStatus ────────────────────────────────────────────────────────

  describe('getClearanceStatus', () => {
    it('returns clearance status with all Pending flags', async () => {
      const conn = makeConn();
      q(conn, [...clearanceStatusSeq()]);

      const service = await buildService(conn);
      const result = await service.getClearanceStatus('abc123');

      expect(result.exit_interview_id).toBe('abc123');
      expect(result.operations_cleared).toBe('Pending');
      expect(result.hr_can_finalize).toBe(false);
      expect(result.completed).toBe(false);
    });

    it('returns hr_can_finalize=true when ops, finance and hr all Yes', async () => {
      const conn = makeConn();
      q(conn, [
        [[{
          ...baseInterview,
          supervisor_cleared:  'Yes',
          hr_cleared:          'Yes',
          operations_cleared:  'Yes',
          finance_cleared:     'Yes',
          hr_director_cleared: 'Pending',
        }]],
        [[]],
      ]);

      const service = await buildService(conn);
      const result = await service.getClearanceStatus('abc123');

      expect(result.hr_can_finalize).toBe(true);
      expect(result.completed).toBe(false);
    });

    it('returns completed=true when all Yes', async () => {
      const conn = makeConn();
      q(conn, [
        [[{
          ...baseInterview,
          supervisor_cleared:  'Yes',
          hr_cleared:          'Yes',
          operations_cleared:  'Yes',
          finance_cleared:     'Yes',
          hr_director_cleared: 'Yes',
        }]],
        [[]],
      ]);

      const service = await buildService(conn);
      const result = await service.getClearanceStatus('abc123');

      expect(result.completed).toBe(true);
    });

    it('throws NotFoundException when not found', async () => {
      const conn = makeConn();
      q(conn, [[[]]]); // [[row]] double-destructure returns undefined

      const service = await buildService(conn);
      await expect(service.getClearanceStatus('bad')).rejects.toThrow(NotFoundException);
    });
  });

  // ── clearDepartment ───────────────────────────────────────────────────────────

  describe('clearDepartment', () => {
    const setupClearConn = (
      department: string,
      overrideFlags: Record<string, string> = {},
    ) => {
      const conn = makeConn();
      q(conn, [
        // existing check
        [[{ ...baseInterview, stage: department, status: 'In_Progress', ...overrideFlags }]],
        // re-fetch flags after update
        [[{ operations_cleared: 'Pending', finance_cleared: 'Pending', ...overrideFlags }]],
        // getClearanceStatus — row
        [[{ ...baseInterview, stage: department, ...overrideFlags }]],
        // getClearanceStatus — clearances
        [[]],
      ]);
      return conn;
    };

    it('Supervisor clearance advances stage to HR', async () => {
      const conn = setupClearConn('Supervisor');
      const service = await buildService(conn);

      await service.clearDepartment('abc123', 'Supervisor', 'sup@mc.org', [1], 'All done');

      expect(conn.commit).toHaveBeenCalled();

      const updateCall = conn.execute.mock.calls.find(
        (c) => (c[0] as string).includes('supervisor_cleared'),
      );
      expect(updateCall).toBeDefined();
      expect(updateCall![0]).toContain("'Yes'");

      const stageUpdate = conn.execute.mock.calls.find(
        (c) => (c[0] as string).includes('stage = ?'),
      );
      expect(stageUpdate![1][0]).toBe('HR');
    });

    it('HR clearance advances stage to Operations', async () => {
      const conn = setupClearConn('HR');
      const service = await buildService(conn);

      await service.clearDepartment('abc123', 'HR', 'hr@mc.org', [1]);

      const stageUpdate = conn.execute.mock.calls.find(
        (c) => (c[0] as string).includes('stage = ?'),
      );
      expect(stageUpdate![1][0]).toBe('Operations');
    });

    it('Operations clearance advances to Finance when Finance not yet cleared', async () => {
      const conn = setupClearConn('Operations', { finance_cleared: 'Pending' });
      const service = await buildService(conn);

      await service.clearDepartment('abc123', 'Operations', 'ops@mc.org', [1]);

      const stageUpdate = conn.execute.mock.calls.find(
        (c) => (c[0] as string).includes('stage = ?'),
      );
      expect(stageUpdate![1][0]).toBe('Finance');
    });

    it('Operations clearance advances to HR_Director when Finance already cleared', async () => {
      const conn = setupClearConn('Operations', { finance_cleared: 'Yes' });
      // Override the re-fetch to show finance_cleared = Yes
      conn.query
        .mockResolvedValueOnce([[{ ...baseInterview, stage: 'Operations' }]])    // existing
        .mockResolvedValueOnce([[{ operations_cleared: 'Yes', finance_cleared: 'Yes' }]]) // re-fetch
        .mockResolvedValueOnce([[baseInterview]])  // getClearanceStatus row
        .mockResolvedValueOnce([[]]); // getClearanceStatus clearances

      const service = await buildService(conn);
      await service.clearDepartment('abc123', 'Operations', 'ops@mc.org', [1]);

      const stageUpdate = conn.execute.mock.calls.find(
        (c) => (c[0] as string).includes('stage = ?'),
      );
      expect(stageUpdate![1][0]).toBe('HR_Director');
    });

    it('HR_Director clearance sets stage and status to Completed', async () => {
      const conn = setupClearConn('HR_Director');
      const service = await buildService(conn);

      await service.clearDepartment('abc123', 'HR_Director', 'dir@mc.org', [1]);

      const stageUpdate = conn.execute.mock.calls.find(
        (c) => (c[0] as string).includes('stage = ?'),
      );
      expect(stageUpdate![1][0]).toBe('Completed');
      expect(stageUpdate![1][1]).toBe('Completed');
    });

    it('writes audit log on clearance and stage advance', async () => {
      const conn = setupClearConn('Supervisor');
      const service = await buildService(conn);

      await service.clearDepartment('abc123', 'Supervisor', 'sup@mc.org', [1]);

      const auditCalls = conn.execute.mock.calls.filter(
        (c) => (c[0] as string).includes('exit_interview_audit_log'),
      );
      expect(auditCalls.length).toBeGreaterThanOrEqual(2); // clearance + stage advance
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
      q(conn, [[[baseInterview]]]);
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
    const allClearedRow = {
      ...baseInterview,
      supervisor_cleared: 'Yes',
      hr_cleared:         'Yes',
      operations_cleared: 'Yes',
      finance_cleared:    'Yes',
      stage:              'HR_Director',
      status:             'In_Progress',
    };

    it('finalizes when all departments cleared', async () => {
      const conn = makeConn();
      q(conn, [
        [[allClearedRow]],   // SELECT flags check
        [[baseDetail]],      // findOne after update
      ]);

      const service = await buildService(conn);
      const result = await service.finalize('abc123', mockUser);

      expect(result.unique_id).toBe('abc123');

      const updateCall = conn.execute.mock.calls.find(
        (c) => (c[0] as string).includes("hr_director_cleared = 'Yes'"),
      );
      expect(updateCall).toBeDefined();

      const auditCall = conn.execute.mock.calls.find(
        (c) => (c[0] as string).includes('exit_interview_audit_log'),
      );
      expect(auditCall).toBeDefined();
    });

    it('throws InternalServerErrorException when not all cleared', async () => {
      const conn = makeConn();
      q(conn, [
        [[{ ...allClearedRow, hr_cleared: 'Pending' }]],
      ]);

      const service = await buildService(conn);
      await expect(service.finalize('abc123', mockUser)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('throws NotFoundException when interview not found', async () => {
      const conn = makeConn();
      q(conn, [[[]]]); // [[row]] returns undefined

      const service = await buildService(conn);
      await expect(service.finalize('bad', mockUser)).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ────────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates fields and writes audit log', async () => {
      const conn = makeConn();
      q(conn, [
        [[{ id: 1 }]],     // existence check
        [[baseDetail]],    // findOne after update
      ]);

      const service = await buildService(conn);
      const result = await service.update(
        'abc123',
        { stage: 'HR', status: 'In_Progress' },
        mockUser,
      );

      expect(result.unique_id).toBe('abc123');

      const updateCall = conn.execute.mock.calls.find(
        (c) => (c[0] as string).includes('UPDATE exit_interviews SET'),
      );
      expect(updateCall).toBeDefined();
      expect(updateCall![0]).toContain('stage = ?');

      const auditCall = conn.execute.mock.calls.find(
        (c) => (c[0] as string).includes('exit_interview_audit_log'),
      );
      expect(auditCall).toBeDefined();
      expect(auditCall![1][8]).toContain('stage, status');
    });

    it('returns existing record when dto is empty', async () => {
      const conn = makeConn();
      q(conn, [
        [[{ id: 1 }]],
        [[baseDetail]],
      ]);

      const service = await buildService(conn);
      const result = await service.update('abc123', {}, mockUser);

      expect(result.unique_id).toBe('abc123');
      const updateCall = conn.execute.mock.calls.find(
        (c) => (c[0] as string).includes('UPDATE exit_interviews SET'),
      );
      expect(updateCall).toBeUndefined();
    });

    it('throws NotFoundException when not found', async () => {
      const conn = makeConn();
      q(conn, [[[]]]); // existence check

      const service = await buildService(conn);
      await expect(service.update('bad', { stage: 'HR' }, mockUser)).rejects.toThrow(
        NotFoundException,
      );
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
        [[
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
        ]],
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
        [[{ total: 5 }]],                            // total
        [[{ stage: 'HR', count: 3 }]],               // by_stage
        [[{ status: 'Pending', count: 5 }]],          // by_status
        [[{ department: 'Finance', count: 2 }]],      // by_department
        [[{ location: 'Abuja', count: 3 }]],          // by_location
        [[{ country: 'Nigeria', count: 5 }]],         // by_country
        [[{ would_recommend: 'Yes', count: 4 }]],     // would_recommend
        [[{ month: '2026-06', count: 2 }]],           // monthly_trend
        [[{ year: 2026, count: 5 }]],                 // yearly_trend
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