import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ProgramsService } from './programs.service';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

describe('ProgramsService', () => {
  let service: ProgramsService;

  const mockPool: any = {
    getConnection: jest.fn(),
  };

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

  describe('create', () => {
    const dto: any = {
      name: 'BEGE',
      fundCode: 12345,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    };

    it('throws ConflictException when fund code already exists', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]);

      await expect(service.create(dto, mockUser)).rejects.toThrow(
        ConflictException,
      );
    });

    it('creates program and returns it', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query.mockResolvedValueOnce([[]]);
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]);

      mockFindOneConn.query.mockResolvedValueOnce([
        [
          {
            id: 1,
            unique_id: 'program-uid-1',
            name: 'BEGE',
            fund_code: 12345,
            start_date: '2026-01-01',
            end_date: '2026-12-31',
            created_by: mockUser.email,
          },
        ],
      ]);

      const result = await service.create(dto, mockUser);

      expect(result.id).toBe(1);
      expect(result.name).toBe('BEGE');
      expect(result.created_by).toBe(mockUser.email);
    });
  });

  describe('findAll', () => {
    it('returns paginated programs without search', async () => {
      const query: any = {
        page: 1,
        limit: 10,
      };

      const rows = [
        {
          id: 1,
          name: 'BEGE',
          fund_code: 12345,
        },
      ];

      mockConn.query.mockResolvedValueOnce([[{ total: 1 }]]);
      mockConn.query.mockResolvedValueOnce([rows]);

      const result = await service.findAll(query);

      expect(result.data).toEqual(rows);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        last_page: 1,
      });
    });

    it('returns paginated programs with search', async () => {
      const query: any = {
        page: 1,
        limit: 10,
        search: 'BEGE',
      };

      const rows = [
        {
          id: 1,
          name: 'BEGE',
          fund_code: 12345,
        },
      ];

      mockConn.query.mockResolvedValueOnce([[{ total: 1 }]]);
      mockConn.query.mockResolvedValueOnce([rows]);

      const result = await service.findAll(query);

      expect(result.data).toEqual(rows);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('findOne', () => {
    it('returns program when found', async () => {
      const program = {
        id: 1,
        unique_id: 'program-uid-1',
        name: 'BEGE',
      };

      mockConn.query.mockResolvedValueOnce([[program]]);

      const result = await service.findOne(1);

      expect(result).toEqual(program);
    });

    it('throws NotFoundException when program not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.findOne(1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByUniqueId', () => {
    it('returns program by unique id', async () => {
      const program = {
        id: 1,
        unique_id: 'program-uid-1',
        name: 'BEGE',
      };

      mockConn.query.mockResolvedValueOnce([[program]]);

      const result = await service.findByUniqueId('program-uid-1');

      expect(result).toEqual(program);
    });

    it('throws NotFoundException when unique id not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.findByUniqueId('program-uid-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('throws NotFoundException when program not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.update(1, { name: 'Updated BEGE' } as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns existing program when no fields are provided', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]);

      mockFindOneConn.query.mockResolvedValueOnce([
        [
          {
            id: 1,
            unique_id: 'program-uid-1',
            name: 'BEGE',
          },
        ],
      ]);

      const result = await service.update(1, {} as any);

      expect(result.id).toBe(1);
      expect(result.name).toBe('BEGE');
    });

    it('updates program and returns updated program', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]);
      mockConn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

      mockFindOneConn.query.mockResolvedValueOnce([
        [
          {
            id: 1,
            unique_id: 'program-uid-1',
            name: 'Updated BEGE',
            fund_code: 12345,
          },
        ],
      ]);

      const result = await service.update(1, {
        name: 'Updated BEGE',
      } as any);

      expect(result.name).toBe('Updated BEGE');
      expect(mockConn.execute).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when program not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.remove(1)).rejects.toThrow(NotFoundException);
    });

    it('deletes program and returns confirmation message', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]);
      mockConn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await service.remove(1);

      expect(result).toEqual({
        message: 'Program 1 deleted successfully',
      });
      expect(mockConn.execute).toHaveBeenCalledWith(
        'DELETE FROM programs WHERE id = ?',
        [1],
      );
    });
  });
});