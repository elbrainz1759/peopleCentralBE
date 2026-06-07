import { Test } from '@nestjs/testing';
import { LeaveTypesService } from './leave-types.service';
import {
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeConn = () => ({
  query: jest.fn(),
  execute: jest.fn().mockResolvedValue([{}]),
  release: jest.fn(),
});

const buildService = async (conn: ReturnType<typeof makeConn>) => {
  const pool = { getConnection: jest.fn().mockResolvedValue(conn) };
  const module = await Test.createTestingModule({
    providers: [
      LeaveTypesService,
      { provide: 'MYSQL_POOL', useValue: pool },
    ],
  }).compile();
  return module.get(LeaveTypesService);
};

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockUser: RequestUser = { email: 'admin@example.com', sub: 1, role: 'admin' };

const baseLeaveType = {
  id: 1,
  unique_id: 'abc123',
  name: 'Annual Leave',
  description: 'Yearly leave',
  country: 'Nigeria',
  require_document: 'No' as const,
  trigger_value: 0,
  created_by: 'admin@example.com',
  created_at: new Date(),
};

const leaveTypeWithDoc = {
  ...baseLeaveType,
  require_document: 'Yes' as const,
  trigger_value: 5,
};

const leaveTypeWithDocZeroTrigger = {
  ...baseLeaveType,
  require_document: 'Yes' as const,
  trigger_value: 0,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LeaveTypesService', () => {
  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a leave type with defaults (requireDocument=No, trigger=0)', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[]])                   // name check
        .mockResolvedValueOnce([{ insertId: 1 }])      // INSERT
        .mockResolvedValueOnce([[baseLeaveType]]);      // findOne

      const service = await buildService(conn);
      const result = await service.create(
        { name: 'Annual Leave', description: 'Yearly leave', country: 'Nigeria', requireDocument: 'No', trigger: 0 },
        mockUser,
      );

      expect(result.require_document).toBe('No');
      expect(result.trigger_value).toBe(0);

      const insertArgs = conn.query.mock.calls[1][1];
      expect(insertArgs).toContain('No');
      expect(insertArgs).toContain(0);
    });

    it('creates a leave type with requireDocument=Yes and trigger=5', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 1 }])
        .mockResolvedValueOnce([[leaveTypeWithDoc]]);

      const service = await buildService(conn);
      const result = await service.create(
        { name: 'Annual Leave', description: 'Yearly leave', country: 'Nigeria', requireDocument: 'Yes', trigger: 5 },
        mockUser,
      );

      expect(result.require_document).toBe('Yes');
      expect(result.trigger_value).toBe(5);

      const insertArgs = conn.query.mock.calls[1][1];
      expect(insertArgs).toContain('Yes');
      expect(insertArgs).toContain(5);
    });

    it('creates with requireDocument=Yes and trigger=0 (valid — zero is allowed)', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 1 }])
        .mockResolvedValueOnce([[leaveTypeWithDocZeroTrigger]]);

      const service = await buildService(conn);
      const result = await service.create(
        { name: 'Annual Leave', description: 'Yearly', country: 'Nigeria', requireDocument: 'Yes', trigger: 0 },
        mockUser,
      );

      expect(result.require_document).toBe('Yes');
      expect(result.trigger_value).toBe(0);
    });

    it('defaults trigger to 0 when not provided', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 1 }])
        .mockResolvedValueOnce([[baseLeaveType]]);

      const service = await buildService(conn);
      await service.create(
        { name: 'Annual Leave', description: 'x', country: 'Nigeria', requireDocument: 'No' } as any,
        mockUser,
      );

      const insertArgs = conn.query.mock.calls[1][1];
      // trigger_value should be 0 (the ?? 0 fallback)
      expect(insertArgs[5]).toBe(0);
    });

    it('throws ConflictException when name already exists', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[{ id: 1 }]]);

      const service = await buildService(conn);
      await expect(
        service.create(
          { name: 'Annual Leave', description: 'x', country: 'Nigeria', requireDocument: 'No', trigger: 0 },
          mockUser,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('throws InternalServerErrorException on unexpected db error', async () => {
      const conn = makeConn();
      conn.query.mockRejectedValueOnce(new Error('DB down'));

      const service = await buildService(conn);
      await expect(
        service.create(
          { name: 'x', description: 'y', country: 'z', requireDocument: 'No', trigger: 0 },
          mockUser,
        ),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ── findAll ──────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated results with require_document and trigger_value', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ total: 2 }]])
        .mockResolvedValueOnce([[baseLeaveType, leaveTypeWithDoc]]);

      const service = await buildService(conn);
      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(2);
      expect(result.data[0].require_document).toBe('No');
      expect(result.data[0].trigger_value).toBe(0);
      expect(result.data[1].require_document).toBe('Yes');
      expect(result.data[1].trigger_value).toBe(5);
      expect(result.meta).toEqual({ total: 2, page: 1, limit: 10, last_page: 1 });
    });

    it('applies search filter in WHERE clause', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[baseLeaveType]]);

      const service = await buildService(conn);
      await service.findAll({ page: 1, limit: 10, search: 'Annual' });

      expect(conn.query.mock.calls[0][0]).toContain('WHERE name LIKE');
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
    it('returns leave type including trigger_value', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[leaveTypeWithDoc]]);

      const service = await buildService(conn);
      const result = await service.findOne(1);

      expect(result.require_document).toBe('Yes');
      expect(result.trigger_value).toBe(5);
    });

    it('throws NotFoundException when not found', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[]]);

      const service = await buildService(conn);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ── findByUniqueId ────────────────────────────────────────────────────────────

  describe('findByUniqueId', () => {
    it('returns leave type by unique_id', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[baseLeaveType]]);

      const service = await buildService(conn);
      const result = await service.findByUniqueId('abc123');
      expect(result.unique_id).toBe('abc123');
      expect(result.trigger_value).toBe(0);
    });

    it('throws NotFoundException when unique_id not found', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[]]);

      const service = await buildService(conn);
      await expect(service.findByUniqueId('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ────────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates requireDocument and trigger, mapping to correct DB columns', async () => {
      const updated = { ...baseLeaveType, require_document: 'Yes' as const, trigger_value: 3 };
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ id: 1 }]])   // existence check
        .mockResolvedValueOnce([[updated]]);      // findOne after update

      const service = await buildService(conn);
      const result = await service.update(1, { requireDocument: 'Yes', trigger: 3 });

      expect(result.require_document).toBe('Yes');
      expect(result.trigger_value).toBe(3);

      const [sql, args] = conn.execute.mock.calls[0];
      expect(sql).toContain('require_document = ?');
      expect(sql).toContain('trigger_value = ?');
      expect(args).toContain('Yes');
      expect(args).toContain(3);
    });

    it('updates trigger to 0 (zero is a valid value, not falsy-skipped)', async () => {
      const updated = { ...baseLeaveType, trigger_value: 0 };
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([[updated]]);

      const service = await buildService(conn);
      const result = await service.update(1, { trigger: 0 });

      expect(result.trigger_value).toBe(0);
      // trigger: 0 must not be filtered out (undefined check, not falsy check)
      const [sql] = conn.execute.mock.calls[0];
      expect(sql).toContain('trigger_value = ?');
    });

    it('returns existing record unchanged when dto is empty', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([[baseLeaveType]]);

      const service = await buildService(conn);
      const result = await service.update(1, {});
      expect(result).toEqual(baseLeaveType);
      expect(conn.execute).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when id does not exist', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[]]);

      const service = await buildService(conn);
      await expect(service.update(99, { name: 'x' })).rejects.toThrow(NotFoundException);
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes and returns confirmation message', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[{ id: 1 }]]);

      const service = await buildService(conn);
      const result = await service.remove(1);
      expect(result.message).toContain('deleted successfully');
    });

    it('throws NotFoundException when id does not exist', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[]]);

      const service = await buildService(conn);
      await expect(service.remove(99)).rejects.toThrow(NotFoundException);
    });
  });
});