import {
  ExitInterviewService,
  ExitInterview,
} from './exit-interviews.service';
import { NotFoundException } from '@nestjs/common';

describe('ExitInterviewsService', () => {
  let service: ExitInterviewService;
  const mockPool = {
    query: jest.fn(),
    getConnection: jest.fn(),
  } as { query: jest.Mock; getConnection: jest.Mock };
  const mockConn = {
    query: jest.fn(),
    execute: jest.fn(),
    release: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    jest
      .spyOn(require('crypto'), 'randomBytes')
      .mockReturnValue(Buffer.alloc(16, 0));
    mockPool.getConnection.mockResolvedValue(mockConn);
    // ensureExists (used in create) calls pool.query directly
    mockPool.query.mockResolvedValue([[{ unique_id: '1' }]]);
    service = new ExitInterviewService(mockPool as never);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('inserts and returns record via findOne', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ id: 1 }]]) // supervisor check
        .mockResolvedValueOnce([{ insertId: 5 }]) // INSERT
        .mockResolvedValueOnce([[{ id: 5, unique_id: 'abc', staff_id: 1 }]]); // findOne
      const dto = {
        staffId: 1,
        departmentId: 1,
        supervisorId: 1,
        resignationDate: '2025-01-15',
        reasonForLeaving: 'Career change',
        ratingCulture: 4,
        ratingJob: 5,
        ratingManager: 4,
        wouldRecommend: 'Yes',
      };
      const res = await service.create(dto as never);
      expect(res.id).toBe(5);
      expect(mockConn.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO exit_interviews'),
        expect.any(Array),
      );
    });

    it('uses default stage and status when not provided', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ id: 1 }]]) // supervisor check
        .mockResolvedValueOnce([{ insertId: 1 }]) // INSERT
        .mockResolvedValueOnce([[{ id: 1 }]]); // findOne
      const dto = {
        staffId: 1,
        departmentId: 1,
        supervisorId: 1,
        resignationDate: '2025-01-15',
        reasonForLeaving: 'Other',
        ratingCulture: 3,
        ratingJob: 3,
        ratingManager: 3,
        wouldRecommend: 'Maybe',
      };
      await service.create(dto as never);
      const insertCall = mockConn.query.mock.calls[1]; // call 0 = supervisor, call 1 = INSERT
      expect(insertCall[1]).toContain('HR');
      expect(insertCall[1]).toContain('Pending');
    });
  });

  describe('findAll', () => {
    it('returns paginated results without search', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ total: 2 }]])
        .mockResolvedValueOnce([[{ id: 1 }, { id: 2 }]]);
      const r = await service.findAll({ page: 1, limit: 10 } as never);
      expect(r.meta.total).toBe(2);
      expect(r.meta.page).toBe(1);
      expect(r.meta.limit).toBe(10);
      expect(r.meta.last_page).toBe(1);
      expect(r.data).toHaveLength(2);
    });

    it('applies search filter when query.search provided', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[{ id: 1 }]]);
      await service.findAll({ page: 1, limit: 5, search: 'relocation' } as never);
      expect(mockConn.query).toHaveBeenCalledWith(
        expect.stringContaining('LIKE'),
        expect.arrayContaining(['%relocation%']),
      );
    });

    it('uses default page and limit when not provided', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ total: 0 }]])
        .mockResolvedValueOnce([[]]);
      const r = await service.findAll({} as never);
      expect(r.meta.page).toBe(1);
      expect(r.meta.limit).toBe(10);
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when not found', async () => {
      mockConn.query.mockResolvedValue([[]]);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
      await expect(service.findOne(99)).rejects.toThrow(
        'Exit interview with id 99 not found',
      );
    });

    it('returns record when found', async () => {
      const row = { id: 1, unique_id: 'x', staff_id: 1 } as ExitInterview;
      mockConn.query.mockResolvedValue([[row]]);
      const res = await service.findOne(1);
      expect(res).toEqual(row);
    });
  });

  describe('findByUniqueId', () => {
    it('throws NotFoundException when not found', async () => {
      mockConn.query.mockResolvedValue([[]]);
      await expect(service.findByUniqueId('bad-id')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findByUniqueId('bad-id')).rejects.toThrow(
        'Exit interview with unique_id "bad-id" not found',
      );
    });

    it('returns record when found', async () => {
      const row = { id: 1, unique_id: 'abc', staff_id: 1 } as ExitInterview;
      mockConn.query.mockResolvedValue([[row]]);
      const res = await service.findByUniqueId('abc');
      expect(res).toEqual(row);
    });
  });

  describe('findByStaffId', () => {
    it('returns array of interviews for staff', async () => {
      mockConn.query.mockResolvedValue([
        [{ id: 1, staff_id: 5 }, { id: 2, staff_id: 5 }],
      ]);
      const res = await service.findByStaffId(5);
      expect(res).toHaveLength(2);
      expect(mockConn.query).toHaveBeenCalledWith(
        expect.stringContaining('staff_id = ?'),
        [5],
      );
    });

    it('returns empty array when no interviews', async () => {
      mockConn.query.mockResolvedValue([[]]);
      const res = await service.findByStaffId(1);
      expect(res).toEqual([]);
    });
  });

  describe('update', () => {
    it('throws NotFoundException when id not found', async () => {
      mockConn.query.mockResolvedValue([[]]);
      await expect(service.update(999, { status: 'Approved' } as never)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns unchanged when dto has no fields', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]);
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1 } as ExitInterview);
      const res = await service.update(1, {} as never);
      expect(res.id).toBe(1);
      expect(mockConn.execute).not.toHaveBeenCalled();
    });

    it('updates and returns record when dto has fields', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([[{ id: 1, status: 'Approved' }]]);
      mockConn.execute.mockResolvedValue([{}]);
      const res = await service.update(1, { status: 'Approved' } as never);
      expect(res.status).toBe('Approved');
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE exit_interviews'),
        ['Approved', 1],
      );
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when id not found', async () => {
      mockConn.query.mockResolvedValue([[]]);
      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });

    it('deletes and returns success message', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]); // check exists
      mockConn.execute.mockResolvedValue([{}]);
      const res = await service.remove('1');
      expect(res).toEqual({ message: 'Exit interview 1 deleted successfully' });
      expect(mockConn.execute).toHaveBeenCalledWith(
        'DELETE FROM exit_interviews WHERE unique_id = ?',
        ['1'],
      );
    });
  });
});
