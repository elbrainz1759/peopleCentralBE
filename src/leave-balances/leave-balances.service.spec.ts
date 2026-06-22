import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LeaveBalancesService } from './leave-balances.service';

// ─── Pool / connection mock ───────────────────────────────────────────────────
//
// mysql2/promise query() always returns a tuple: [rows_or_header, fields].
// The service destructures:
//   const [rows]   = await conn.query(...)  →  mock returns [ rowArray ]
//   const [result] = await conn.query(...)  →  mock returns [ ResultSetHeader ]
//
// So every mockResolvedValueOnce value is an ARRAY whose first element is the
// actual data:
//   rows array    → [ [{...}, {...}] ]
//   single row    → [ [{...}] ]
//   empty result  → [ [] ]
//   ResultHeader  → [ { insertId, affectedRows, ... } ]

function makeConn() {
  return {
    query:            jest.fn(),
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit:           jest.fn().mockResolvedValue(undefined),
    rollback:         jest.fn().mockResolvedValue(undefined),
    release:          jest.fn(),
  };
}

const POOL_TOKEN = 'MYSQL_POOL';

async function buildService(conn: ReturnType<typeof makeConn>) {
  const pool = { getConnection: jest.fn().mockResolvedValue(conn) };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      LeaveBalancesService,
      { provide: POOL_TOKEN, useValue: pool },
    ],
  }).compile();

  return module.get<LeaveBalancesService>(LeaveBalancesService);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LeaveBalancesService', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── bulkUpload ───────────────────────────────────────────────────────────────

  describe('bulkUpload()', () => {
    const mockUser = { email: 'hr@mc.org' } as any;

    it('creates balances for new staff and skips existing ones', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[]])                    // no existing → staff 1001
        .mockResolvedValueOnce([{ insertId: 10 }])      // INSERT leave_balances → staff 1001
        .mockResolvedValueOnce([{}])                    // INSERT transaction
        .mockResolvedValueOnce([[{ id: 99 }]]);          // existing → staff 1002 (skip)

      const service = await buildService(conn);
      const result  = await service.bulkUpload(
        { balances: [
          { staffId: 1001, leaveTypeId: 'lt1', totalHours: 160 },
          { staffId: 1002, leaveTypeId: 'lt1', totalHours: 160 },
        ]},
        mockUser,
      );

      expect(result.created).toBe(1);
      expect(result.skipped).toBe(1);
      expect(conn.commit).toHaveBeenCalled();
    });

    it('skips zero-balance records and returns zeroed count', async () => {
      const conn = makeConn();
      const service = await buildService(conn);

      const result = await service.bulkUpload(
        { balances: [{ staffId: 1001, leaveTypeId: 'lt1', totalHours: 0 }] },
        mockUser,
      );

      expect(result).toEqual({ created: 0, skipped: 0, zeroed: 1 });
      expect(conn.query).not.toHaveBeenCalled(); // zero skipped before any DB touch
    });

    it('throws BadRequestException when totalHours is negative', async () => {
      const conn = makeConn();
      const service = await buildService(conn);

      await expect(
        service.bulkUpload(
          { balances: [{ staffId: 1001, leaveTypeId: 'lt1', totalHours: -8 }] },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(conn.beginTransaction).not.toHaveBeenCalled(); // pre-flight, no tx opened
    });

    it('rolls back on unexpected DB error', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[]])                          // no existing
        .mockRejectedValueOnce(new Error('DB failure'));      // INSERT explodes

      const service = await buildService(conn);
      await expect(
        service.bulkUpload(
          { balances: [{ staffId: 1001, leaveTypeId: 'lt1', totalHours: 80 }] },
          mockUser,
        ),
      ).rejects.toThrow(InternalServerErrorException);

      expect(conn.rollback).toHaveBeenCalled();
    });
  });

  // ── monthlyAccrue ────────────────────────────────────────────────────────────

  describe('monthlyAccrue()', () => {
    it('throws BadRequestException when leave type has no accrual config', async () => {
      const conn = makeConn();
      // typeCheck COUNT(*) returns 0
      conn.query.mockResolvedValueOnce([[{ cnt: 0 }]]);

      const service = await buildService(conn);
      await expect(service.monthlyAccrue('lt-uid-001', 'system')).rejects.toThrow(
        BadRequestException,
      );
      expect(conn.rollback).toHaveBeenCalled();
    });

    it('throws ConflictException when this month was already accrued', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ cnt: 1 }]])   // typeCheck: has accrual config
        .mockResolvedValueOnce([{ affectedRows: 0, insertId: 0 }]); // INSERT IGNORE → already exists

      const service = await buildService(conn);
      await expect(service.monthlyAccrue('lt-uid-001', 'system')).rejects.toThrow(
        ConflictException,
      );
      expect(conn.rollback).toHaveBeenCalled();
    });

    it('returns zero accrued when no balances found (commits guard row)', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ cnt: 1 }]])                    // typeCheck
        .mockResolvedValueOnce([{ affectedRows: 1, insertId: 7 }]) // INSERT accrual_log
        .mockResolvedValueOnce([[]])                               // no balances
        .mockResolvedValueOnce([{}]);                              // UPDATE accrual_log counts

      const service = await buildService(conn);
      const result  = await service.monthlyAccrue('lt-uid-001', 'system');

      expect(result.accrued).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.month).toBeGreaterThan(0);
      expect(result.year).toBeGreaterThan(2020);
      expect(conn.commit).toHaveBeenCalled();
    });

    it('accrues hours for each balance with a configured rate', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ cnt: 1 }]])                     // typeCheck
        .mockResolvedValueOnce([{ affectedRows: 1, insertId: 7 }]) // INSERT accrual_log
        // 2 balance rows
        .mockResolvedValueOnce([[
          { balance_id: 1, staff_id: 101, monthly_accrual_hours: 13.33 },
          { balance_id: 2, staff_id: 102, monthly_accrual_hours: 13.33 },
        ]])
        // For balance 1: UPDATE + INSERT transaction
        .mockResolvedValueOnce([{}])
        .mockResolvedValueOnce([{}])
        // For balance 2: UPDATE + INSERT transaction
        .mockResolvedValueOnce([{}])
        .mockResolvedValueOnce([{}])
        // UPDATE accrual_log final counts
        .mockResolvedValueOnce([{}]);

      const service = await buildService(conn);
      const result  = await service.monthlyAccrue('lt-uid-001', 'system');

      expect(result.accrued).toBe(2);
      expect(result.skipped).toBe(0);
      expect(conn.commit).toHaveBeenCalled();
    });

    it('skips balances with zero accrual rate', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ cnt: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1, insertId: 7 }])
        .mockResolvedValueOnce([[
          { balance_id: 1, staff_id: 101, monthly_accrual_hours: 0 },    // skipped
          { balance_id: 2, staff_id: 102, monthly_accrual_hours: 13.33 }, // accrued
        ]])
        .mockResolvedValueOnce([{}])   // UPDATE for balance 2
        .mockResolvedValueOnce([{}])   // INSERT transaction for balance 2
        .mockResolvedValueOnce([{}]);  // UPDATE accrual_log

      const service = await buildService(conn);
      const result  = await service.monthlyAccrue('lt-uid-001', 'system');

      expect(result.accrued).toBe(1);
      expect(result.skipped).toBe(1);
    });
  });

  // ── rolloverYear ─────────────────────────────────────────────────────────────

  describe('rolloverYear()', () => {
    it('returns zero when no closing balances found', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[]]); // no closing balances

      const service = await buildService(conn);
      const result  = await service.rolloverYear('lt-uid-001', 'system');

      expect(result.rolled).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.closingYear).toBeDefined();
      expect(result.newYear).toBeDefined();
    });

    it('skips staff who already have a new-year balance', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ id: 1, staff_id: 101, remaining_hours: 40 }]]) // closing balance
        .mockResolvedValueOnce([[{ id: 99 }]]);                                    // new year already exists → skip

      const service = await buildService(conn);
      const result  = await service.rolloverYear('lt-uid-001', 'system');

      expect(result.rolled).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.closingYear).toBeDefined();
      expect(result.newYear).toBeDefined();
    });

    it('caps carryover at MAX_CARRYOVER_HOURS (80) and seeds new balance', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ id: 1, staff_id: 101, remaining_hours: 200 }]]) // over cap
        .mockResolvedValueOnce([[]])                                                 // no new-year row yet
        .mockResolvedValueOnce([{ insertId: 50 }])                                  // INSERT leave_balances
        .mockResolvedValueOnce([{}]);                                                // INSERT transaction

      const service = await buildService(conn);
      const result  = await service.rolloverYear('lt-uid-001', 'system');

      expect(result.rolled).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.closingYear).toBeDefined();
      expect(result.newYear).toBeDefined();

      // Verify the INSERT used 80 (capped), not 200
      const insertCall = conn.query.mock.calls[2]; // 3rd query = INSERT leave_balances
      const params     = insertCall[1] as unknown[];
      // total_hours and remaining_hours are both `carryover` = 80
      expect(params).toContain(80);
      expect(params).not.toContain(200);
    });

    it('sets carryover to 0 when remaining_hours is negative', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ id: 1, staff_id: 101, remaining_hours: -5 }]]) // negative
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 50 }])
        .mockResolvedValueOnce([{}]);

      const service = await buildService(conn);
      await service.rolloverYear('lt-uid-001', 'system');

      const insertParams = conn.query.mock.calls[2][1] as unknown[];
      expect(insertParams).toContain(0);   // capped to 0, not -5
      expect(insertParams).not.toContain(-5);
    });

    it('rolls back on unexpected DB error', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ id: 1, staff_id: 101, remaining_hours: 40 }]])
        .mockResolvedValueOnce([[]])                             // no new-year row
        .mockRejectedValueOnce(new Error('DB failure'));         // INSERT explodes

      const service = await buildService(conn);
      await expect(service.rolloverYear('lt-uid-001', 'system')).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(conn.rollback).toHaveBeenCalled();
    });
  });

  // ── findByStaff ──────────────────────────────────────────────────────────────

  describe('findByStaff()', () => {
    it('returns balances for the current year', async () => {
      const mockBalance = {
        id: 1, staff_id: 101, leave_type_id: 'lt1',
        year: new Date().getFullYear(),
        total_hours: 160, used_hours: 40, remaining_hours: 120,
        leave_type_name: 'Annual Leave',
      };
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[mockBalance]]);

      const service = await buildService(conn);
      const result  = await service.findByStaff(101);

      expect(result).toHaveLength(1);
      expect(result[0].staff_id).toBe(101);
      expect(result[0].remaining_hours).toBe(120);
    });

    it('returns empty array when no balances found', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[]]); // empty

      const service = await buildService(conn);
      const result  = await service.findByStaff(999);

      expect(result).toHaveLength(0);
    });
  });

  // ── findTransactionsByStaff ──────────────────────────────────────────────────

  describe('findTransactionsByStaff()', () => {
    it('returns paginated transactions', async () => {
      const mockTx = {
        id: 1, staff_id: 101, balance_id: 1,
        type: 'credit', hours: 13.33, note: 'Monthly accrual',
        leave_type_name: 'Annual Leave',
      };
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ total: 1 }]])  // COUNT(*)
        .mockResolvedValueOnce([[mockTx]]);         // SELECT transactions

      const service = await buildService(conn);
      const result  = await service.findTransactionsByStaff(101, 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
      expect(result.meta.last_page).toBe(1);
    });

    it('calculates last_page correctly for multiple pages', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ total: 45 }]])
        .mockResolvedValueOnce([[]]);

      const service = await buildService(conn);
      const result  = await service.findTransactionsByStaff(101, 1, 20);

      expect(result.meta.last_page).toBe(3); // ceil(45/20) = 3
    });
  });

  // ── findAccrualLog ───────────────────────────────────────────────────────────

  describe('findAccrualLog()', () => {
    it('returns all accrual log entries with no filters', async () => {
      const mockLog = {
        id: 1, leave_type_id: 'lt1', year: 2026, month: 5,
        accrued_count: 10, skipped_count: 0,
        run_by: 'system', leave_type_name: 'Annual Leave',
      };
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[mockLog]]);

      const service = await buildService(conn);
      const result  = await service.findAccrualLog();

      expect(result).toHaveLength(1);
      expect(result[0].month).toBe(5);
    });

    it('filters by leaveTypeId when provided', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[{ id: 1, leave_type_id: 'lt1', year: 2026, month: 4 }]]);

      const service = await buildService(conn);
      await service.findAccrualLog('lt1');

      const queryParams = conn.query.mock.calls[0][1] as unknown[];
      expect(queryParams).toContain('lt1');
    });

    it('filters by year when provided', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[{ id: 1, leave_type_id: 'lt1', year: 2026, month: 3 }]]);

      const service = await buildService(conn);
      await service.findAccrualLog(undefined, 2026);

      const queryParams = conn.query.mock.calls[0][1] as unknown[];
      expect(queryParams).toContain(2026);
    });
  });
});