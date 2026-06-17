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

const buildService = async (
  conn: ReturnType<typeof makeConn>,
  extraConns: ReturnType<typeof makeConn>[] = [],
) => {
  let callCount = 0;
  const allConns = [conn, ...extraConns];
  const pool = {
    getConnection: jest.fn().mockImplementation(() =>
      Promise.resolve(allConns[callCount++] ?? conn),
    ),
  };
  const module = await Test.createTestingModule({
    providers: [
      LeaveTypesService,
      { provide: 'MYSQL_POOL', useValue: pool },
    ],
  }).compile();
  return module.get(LeaveTypesService);
};

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockUser: RequestUser = {
  id: 1,
  email: 'admin@example.com',
  role: 'Admin',
  unique_id: 'user-uid-1',
  first_name: 'Admin',
  last_name: 'User',
};

const baseLeaveType = {
  id: 1,
  unique_id: 'lt-uid-1',
  name: 'Annual Leave',
  description: 'Yearly leave',
  country: 'country-uid-1',
  country_name: 'Nigeria',
  require_document: 'No' as const,
  trigger_value: 0,
  created_by: mockUser.email,
  created_at: new Date(),
};

const leaveTypeWithDoc = {
  ...baseLeaveType,
  require_document: 'Yes' as const,
  trigger_value: 5,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LeaveTypesService', () => {

  // ─── create ──────────────────────────────────────────────────────────────────
  // Service query order:
  //   1. name lookup (SELECT FROM leave_types WHERE name = ?)
  //   2. country validation (SELECT FROM countries WHERE unique_id = ?)
  //   3. INSERT (when no existing record)
  //   — or —
  //   3. UPDATE + findOne (when status = Deleted)

  describe('create', () => {
    const dto: any = {
      name: 'Annual Leave',
      description: 'Yearly leave',
      country: 'country-uid-1',
      requireDocument: 'No',
      trigger: 0,
    };

    it('throws NotFoundException when country does not exist', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[]])  // name lookup → not found
        .mockResolvedValueOnce([[]]); // country → not found

      const service = await buildService(conn);
      await expect(service.create(dto, mockUser)).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when name already exists and is Active', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ id: 1, status: 'Active' }]])   // name lookup → Active
        .mockResolvedValueOnce([[{ unique_id: 'country-uid-1' }]]); // country found

      const service = await buildService(conn);
      await expect(service.create(dto, mockUser)).rejects.toThrow(ConflictException);
    });

    it('restores a soft-deleted leave type and returns it', async () => {
      const conn = makeConn();
      const findOneConn = makeConn();

      conn.query
        .mockResolvedValueOnce([[{ id: 1, unique_id: 'lt-uid-1', status: 'Deleted' }]]) // name lookup
        .mockResolvedValueOnce([[{ unique_id: 'country-uid-1' }]]);                      // country found

      findOneConn.query.mockResolvedValueOnce([[baseLeaveType]]);

      const service = await buildService(conn, [findOneConn]);
      const result = await service.create(dto, mockUser);

      expect(conn.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE leave_types SET'),
        expect.arrayContaining([dto.name, dto.description, dto.country]),
      );
      expect(result.unique_id).toBe('lt-uid-1');
    });

    it('creates with defaults (requireDocument=No, trigger=0)', async () => {
      const conn = makeConn();
      const findOneConn = makeConn();

      conn.query
        .mockResolvedValueOnce([[]])                               // name lookup → not found
        .mockResolvedValueOnce([[{ unique_id: 'country-uid-1' }]]) // country found
        .mockResolvedValueOnce([{ insertId: 1 }]);                  // INSERT

      findOneConn.query.mockResolvedValueOnce([[baseLeaveType]]);

      const service = await buildService(conn, [findOneConn]);
      const result = await service.create(dto, mockUser);

      expect(result.require_document).toBe('No');
      expect(result.trigger_value).toBe(0);
      expect(conn.query).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('INSERT INTO leave_types'),
        expect.arrayContaining(['No', 0, mockUser.email]),
      );
    });

    it('creates with requireDocument=Yes and trigger=5', async () => {
      const conn = makeConn();
      const findOneConn = makeConn();

      conn.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ unique_id: 'country-uid-1' }]])
        .mockResolvedValueOnce([{ insertId: 1 }]);

      findOneConn.query.mockResolvedValueOnce([[leaveTypeWithDoc]]);

      const service = await buildService(conn, [findOneConn]);
      const result = await service.create(
        { ...dto, requireDocument: 'Yes', trigger: 5 },
        mockUser,
      );

      expect(result.require_document).toBe('Yes');
      expect(result.trigger_value).toBe(5);
      expect(conn.query).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('INSERT INTO leave_types'),
        expect.arrayContaining(['Yes', 5]),
      );
    });

    it('defaults trigger to 0 when not provided', async () => {
      const conn = makeConn();
      const findOneConn = makeConn();

      conn.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ unique_id: 'country-uid-1' }]])
        .mockResolvedValueOnce([{ insertId: 1 }]);

      findOneConn.query.mockResolvedValueOnce([[baseLeaveType]]);

      const service = await buildService(conn, [findOneConn]);
      await service.create(
        { name: 'Annual Leave', description: 'x', country: 'country-uid-1', requireDocument: 'No' } as any,
        mockUser,
      );

      const insertArgs = conn.query.mock.calls[2][1]; // 3rd query is INSERT
      expect(insertArgs[5]).toBe(0); // trigger_value position
    });

    it('throws InternalServerErrorException on unexpected db error', async () => {
      const conn = makeConn();
      conn.query.mockRejectedValueOnce(new Error('DB down'));

      const service = await buildService(conn);
      await expect(service.create(dto, mockUser)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ─── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated results with country_name from join', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ total: 2 }]])
        .mockResolvedValueOnce([[baseLeaveType, leaveTypeWithDoc]]);

      const service = await buildService(conn);
      const result = await service.findAll({ page: 1, limit: 10 } as any);

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({ total: 2, page: 1, limit: 10, last_page: 1 });
      expect(result.data[0].require_document).toBe('No');
      expect(result.data[1].require_document).toBe('Yes');
    });

    it('always filters by active status', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ total: 0 }]])
        .mockResolvedValueOnce([[]]);

      const service = await buildService(conn);
      await service.findAll({} as any);

      expect(conn.query.mock.calls[0][0]).toContain("a.status = 'Active'");
    });

    it('applies search filter using aliased columns', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[baseLeaveType]]);

      const service = await buildService(conn);
      await service.findAll({ page: 1, limit: 10, search: 'Annual' } as any);

      expect(conn.query.mock.calls[0][0]).toContain('a.name LIKE ?');
      expect(conn.query.mock.calls[0][1]).toEqual(['%Annual%', '%Annual%']);
    });

    it('uses LEFT JOIN to include country_name', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[baseLeaveType]]);

      const service = await buildService(conn);
      await service.findAll({} as any);

      expect(conn.query.mock.calls[1][0]).toContain('LEFT JOIN countries b');
      expect(conn.query.mock.calls[1][0]).toContain('b.name AS country_name');
    });

    it('uses defaults when page/limit omitted', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ total: 0 }]])
        .mockResolvedValueOnce([[]]);

      const service = await buildService(conn);
      const result = await service.findAll({} as any);

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
    });

    it('throws InternalServerErrorException on db error', async () => {
      const conn = makeConn();
      conn.query.mockRejectedValueOnce(new Error('DB error'));

      const service = await buildService(conn);
      await expect(service.findAll({ page: 1, limit: 10 } as any)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns leave type by unique_id string', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[leaveTypeWithDoc]]);

      const service = await buildService(conn);
      const result = await service.findOne('lt-uid-1');

      expect(result.require_document).toBe('Yes');
      expect(result.trigger_value).toBe(5);
      expect(conn.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE unique_id = ?'),
        ['lt-uid-1'],
      );
    });

    it('throws NotFoundException when not found', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[]]);

      const service = await buildService(conn);
      await expect(service.findOne('uid-missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── findByUniqueId ──────────────────────────────────────────────────────────

  describe('findByUniqueId', () => {
    it('returns leave type by unique_id', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[baseLeaveType]]);

      const service = await buildService(conn);
      const result = await service.findByUniqueId('lt-uid-1');

      expect(result.unique_id).toBe('lt-uid-1');
      expect(result.trigger_value).toBe(0);
    });

    it('throws NotFoundException when not found', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[]]);

      const service = await buildService(conn);
      await expect(service.findByUniqueId('uid-missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────────
  // Service query order:
  //   1. existence check
  //   2. country validation (only if dto.country provided)
  //   3. execute UPDATE
  //   4. findOne (new connection)

  describe('update', () => {
    it('throws NotFoundException when id does not exist', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[]]);

      const service = await buildService(conn);
      await expect(service.update('uid-missing', { name: 'x' } as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when new country does not exist', async () => {
      const conn = makeConn();
      conn.query
        .mockResolvedValueOnce([[{ id: 1 }]]) // existence check
        .mockResolvedValueOnce([[]]);          // country not found

      const service = await buildService(conn);
      await expect(
        service.update('lt-uid-1', { country: 'bad-country-uid' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('maps requireDocument→require_document and trigger→trigger_value', async () => {
      const updated = { ...baseLeaveType, require_document: 'Yes' as const, trigger_value: 3 };
      const conn = makeConn();
      const findOneConn = makeConn();

      conn.query.mockResolvedValueOnce([[{ id: 1 }]]); // existence check (no country in dto)
      findOneConn.query.mockResolvedValueOnce([[updated]]);

      const service = await buildService(conn, [findOneConn]);
      const result = await service.update('lt-uid-1', { requireDocument: 'Yes', trigger: 3 } as any);

      expect(result.require_document).toBe('Yes');
      expect(result.trigger_value).toBe(3);

      const [sql, args] = conn.execute.mock.calls[0];
      expect(sql).toContain('require_document = ?');
      expect(sql).toContain('trigger_value = ?');
      expect(args).toContain('Yes');
      expect(args).toContain(3);
    });

    it('validates country then updates when country is provided', async () => {
      const updated = { ...baseLeaveType, country: 'country-uid-2' };
      const conn = makeConn();
      const findOneConn = makeConn();

      conn.query
        .mockResolvedValueOnce([[{ id: 1 }]])                      // existence check
        .mockResolvedValueOnce([[{ unique_id: 'country-uid-2' }]]); // country found

      findOneConn.query.mockResolvedValueOnce([[updated]]);

      const service = await buildService(conn, [findOneConn]);
      const result = await service.update('lt-uid-1', { country: 'country-uid-2' } as any);

      expect(result.country).toBe('country-uid-2');
      expect(conn.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE leave_types SET'),
        expect.arrayContaining(['country-uid-2', 'lt-uid-1']),
      );
    });

    it('updates trigger to 0 (zero is valid, not falsy-skipped)', async () => {
      const updated = { ...baseLeaveType, trigger_value: 0 };
      const conn = makeConn();
      const findOneConn = makeConn();

      conn.query.mockResolvedValueOnce([[{ id: 1 }]]);
      findOneConn.query.mockResolvedValueOnce([[updated]]);

      const service = await buildService(conn, [findOneConn]);
      const result = await service.update('lt-uid-1', { trigger: 0 } as any);

      expect(result.trigger_value).toBe(0);
      const [sql] = conn.execute.mock.calls[0];
      expect(sql).toContain('trigger_value = ?');
    });

    it('returns existing record unchanged when dto is empty', async () => {
      const conn = makeConn();
      const findOneConn = makeConn();

      conn.query.mockResolvedValueOnce([[{ id: 1 }]]);
      findOneConn.query.mockResolvedValueOnce([[baseLeaveType]]);

      const service = await buildService(conn, [findOneConn]);
      const result = await service.update('lt-uid-1', {} as any);

      expect(result).toEqual(baseLeaveType);
      expect(conn.execute).not.toHaveBeenCalled();
    });
  });

  // ─── remove ──────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('soft-deletes and returns confirmation message', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[{ id: 1 }]]);

      const service = await buildService(conn);
      const result = await service.remove('lt-uid-1');

      expect(result).toEqual({ message: 'Leave type lt-uid-1 deleted successfully' });
      expect(conn.execute).toHaveBeenCalledWith(
        expect.stringContaining('status="Deleted"'),
        ['lt-uid-1'],
      );
    });

    it('throws NotFoundException when id does not exist', async () => {
      const conn = makeConn();
      conn.query.mockResolvedValueOnce([[]]);

      const service = await buildService(conn);
      await expect(service.remove('uid-missing')).rejects.toThrow(NotFoundException);
    });
  });
});