import { LeavesService } from './leaves.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

describe('LeavesService', () => {
  let service: LeavesService;
  const mockPool: any = { getConnection: jest.fn() };
  const mockConn: any = {
    query: jest.fn(),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    mockPool.getConnection.mockResolvedValue(mockConn);
    service = new LeavesService(mockPool as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('throws if internal overlap detected', async () => {
      const dto: any = { leaveDuration: [{ startDate: '2021-01-01', endDate: '2021-01-05' }, { startDate: '2021-01-04', endDate: '2021-01-10' }], staffId: 1, leaveTypeId: 1, reason: '', handoverNote: '' };
      await expect(service.create(dto, 'u')).rejects.toThrow(BadRequestException);
    });

    it('throws if existing overlap with DB', async () => {
      // no internal overlap
      const dto: any = { leaveDuration: [{ startDate: '2021-01-01', endDate: '2021-01-05' }], staffId: 1, leaveTypeId: 1, reason: '', handoverNote: '' };
      mockConn.query.mockResolvedValueOnce([[{ start_date: '2021-01-03', end_date: '2021-01-04' }]]);
      await expect(service.create(dto, 'u')).rejects.toThrow(ConflictException);
    });

    it('throws if balance missing', async () => {
      const dto: any = { leaveDuration: [{ startDate: '2021-01-01', endDate: '2021-01-02' }], staffId: 1, leaveTypeId: 1, reason: '', handoverNote: '' };
      mockConn.query
        .mockResolvedValueOnce([[]]) // existingDurations
        .mockResolvedValueOnce([[]]);
      await expect(service.create(dto, 'u')).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('delegates to db and returns', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[{ id: 1 }]]);
      const r = await service.findAll({} as any);
      expect(r.meta.total).toBe(1);
    });
  });

  describe('findOne', () => {
    it('throws if not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);
      await expect(service.findOne(1)).rejects.toThrow(NotFoundException);
    });

    it('returns leave with durations', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([[{ id: 10 }]]);
      const res = await service.findOne(1);
      expect(res.durations?.length).toBe(1);
    });
  });

  describe('review/approve/reject', () => {
    it('review throws when not pending', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1, status: 'Approved' }]]);
      await expect(service.review(1)).rejects.toThrow(BadRequestException);
    });
    it('approve throws when not reviewed', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1, status: 'Pending', staff_id:1, leave_type_id:1, total_hours: 5 }]]);
      await expect(service.approve(1, 'u')).rejects.toThrow(BadRequestException);
    });
  });
});
