import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ProgramsService } from './programs.service';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

describe('ProgramsService', () => {
  let service: ProgramsService;

  const mockPool: any = { getConnection: jest.fn() };

  const mockConn: any = {
    query: jest.fn(),
    execute: jest.fn(),
    release: jest.fn(),
  };

  const mockFindOneConn: any = {
    query: jest.fn(),
    execute: jest.fn(),
    release: jest.fn(),
  };

  const mockUser: RequestUser = {
    id: 1,
    email: 'hr@mercycorps.org',
    role: 'Admin',
    unique_id: 'abc123',
    first_name: 'HR',
    last_name: 'User',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    mockPool.getConnection.mockResolvedValue(mockConn);
    service = new ProgramsService(mockPool as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto: any = {
      name: 'BEGE',
      fundCode: 12345,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      countryId: 'country-uid-1',
    };

    it('throws ConflictException when fund code exists and status is Active', async () => {
      mockConn.query.mockResolvedValueOnce([[{ unique_id: 'uid-1', status: 'Active' }]]);

      await expect(service.create(dto, mockUser)).rejects.toThrow(ConflictException);
    });

    it('restores a soft-deleted program when fund code exists with status Deleted', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query.mockResolvedValueOnce([[{ unique_id: 'uid-1', status: 'Deleted' }]]);
      mockConn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

      mockFindOneConn.query.mockResolvedValueOnce([
        [
          {
            id: 1,
            unique_id: 'uid-1',
            name: 'BEGE',
            fund_code: 12345,
            start_date: '2026-01-01',
            end_date: '2026-12-31',
            country: 'country-uid-1',
            created_by: mockUser.email,
            status: 'Active',
          },
        ],
      ]);

      const result = await service.create(dto, mockUser);

      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE programs SET'),
        [dto.name, dto.startDate, dto.endDate, dto.fundCode],
      );
      expect(result.unique_id).toBe('uid-1');
      expect(result.status).toBe('Active');
    });

    it('creates a new program and returns it', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query
        .mockResolvedValueOnce([[]])               // no existing fund_code
        .mockResolvedValueOnce([{ insertId: 1 }]); // INSERT

      mockFindOneConn.query.mockResolvedValueOnce([
        [
          {
            id: 1,
            unique_id: 'uid-new',
            name: 'BEGE',
            fund_code: 12345,
            start_date: '2026-01-01',
            end_date: '2026-12-31',
            country: 'country-uid-1',
            created_by: mockUser.email,
            status: 'Active',
          },
        ],
      ]);

      const result = await service.create(dto, mockUser);

      expect(result.name).toBe('BEGE');
      expect(result.created_by).toBe(mockUser.email);
      expect(result.country).toBe('country-uid-1');
      expect(mockConn.query).toHaveBeenCalledTimes(2);
      // INSERT should include countryId
      expect(mockConn.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO programs'),
        expect.arrayContaining([dto.countryId]),
      );
    });
  });

  // ─── findAll ───────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated programs without search', async () => {
      const query: any = { page: 1, limit: 10 };
      const rows = [{ id: 1, name: 'BEGE', fund_code: 12345 }];

      mockConn.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([rows]);

      const result = await service.findAll(query);

      expect(result.data).toEqual(rows);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 10, last_page: 1 });
    });

    it('returns paginated programs with search term', async () => {
      const query: any = { page: 1, limit: 10, search: 'BEGE' };
      const rows = [{ id: 1, name: 'BEGE', fund_code: 12345 }];

      mockConn.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([rows]);

      const result = await service.findAll(query);

      expect(result.data).toEqual(rows);
      expect(result.meta.total).toBe(1);
      expect(mockConn.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('WHERE'),
        ['%BEGE%', '%BEGE%'],
      );
    });

    it('uses defaults when page/limit are omitted', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ total: 0 }]])
        .mockResolvedValueOnce([[]]);

      const result = await service.findAll({} as any);

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
    });
  });

  // ─── findOne ───────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns program when found', async () => {
      const program = { id: 1, unique_id: 'uid-1', name: 'BEGE', country: 'country-uid-1' };

      mockConn.query.mockResolvedValueOnce([[program]]);

      const result = await service.findOne('uid-1');

      expect(result).toEqual(program);
      expect(mockConn.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE unique_id = ?'),
        ['uid-1'],
      );
    });

    it('throws NotFoundException when program not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.findOne('uid-missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── findByUniqueId ────────────────────────────────────────────────────────

  describe('findByUniqueId', () => {
    it('returns program by unique_id', async () => {
      const program = { id: 1, unique_id: 'uid-1', name: 'BEGE', country: 'country-uid-1' };

      mockConn.query.mockResolvedValueOnce([[program]]);

      const result = await service.findByUniqueId('uid-1');

      expect(result).toEqual(program);
    });

    it('throws NotFoundException when unique_id not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.findByUniqueId('uid-missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('throws NotFoundException when program not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.update('uid-missing', { name: 'X' } as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns existing program unchanged when dto is empty', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query.mockResolvedValueOnce([[{ unique_id: 'uid-1' }]]);
      mockFindOneConn.query.mockResolvedValueOnce([
        [{ id: 1, unique_id: 'uid-1', name: 'BEGE', country: 'country-uid-1' }],
      ]);

      const result = await service.update('uid-1', {} as any);

      expect(result.name).toBe('BEGE');
      expect(mockConn.execute).not.toHaveBeenCalled();
    });

    it('maps camelCase dto keys to snake_case db columns', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query.mockResolvedValueOnce([[{ unique_id: 'uid-1' }]]);
      mockConn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockFindOneConn.query.mockResolvedValueOnce([
        [{ id: 1, unique_id: 'uid-1', name: 'BEGE', fund_code: 99999, start_date: '2027-01-01', end_date: '2027-12-31', country: 'country-uid-2' }],
      ]);

      await service.update('uid-1', {
        fundCode: 99999,
        startDate: '2027-01-01',
        endDate: '2027-12-31',
        countryId: 'country-uid-2',
      } as any);

      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringMatching(/fund_code|start_date|end_date|country/),
        expect.arrayContaining([99999, '2027-01-01', '2027-12-31', 'country-uid-2', 'uid-1']),
      );
    });

    it('updates name and returns updated program', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query.mockResolvedValueOnce([[{ unique_id: 'uid-1' }]]);
      mockConn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockFindOneConn.query.mockResolvedValueOnce([
        [{ id: 1, unique_id: 'uid-1', name: 'Updated BEGE', fund_code: 12345, country: 'country-uid-1' }],
      ]);

      const result = await service.update('uid-1', { name: 'Updated BEGE' } as any);

      expect(result.name).toBe('Updated BEGE');
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE programs SET'),
        expect.arrayContaining(['Updated BEGE', 'uid-1']),
      );
    });
  });

  // ─── remove ────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('throws NotFoundException when program not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.remove('uid-missing')).rejects.toThrow(NotFoundException);
    });

    it('soft-deletes program and returns confirmation message', async () => {
      mockConn.query.mockResolvedValueOnce([[{ unique_id: 'uid-1' }]]);
      mockConn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await service.remove('uid-1');

      expect(result).toEqual({ message: 'Program uid-1 deleted successfully' });
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'Deleted'"),
        ['uid-1'],
      );
    });
  });
});