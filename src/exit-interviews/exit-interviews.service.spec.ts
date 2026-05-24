import { ExitInterviewService } from './exit-interviews.service';
import { NotFoundException } from '@nestjs/common';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

jest.mock('../utils/check-exit.util', () => ({
  ensureExists: jest.fn().mockResolvedValue(undefined),
}));

describe('ExitInterviewService', () => {
  let service: ExitInterviewService;

  const mockPool: any = { query: jest.fn(), getConnection: jest.fn() };
  const mockConn: any = {
    query: jest.fn(),
    execute: jest.fn(),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
  };

  const mockUser: RequestUser = {
    id: 1,
    email: 'test@mercycorps.org',
    role: 'Admin',
    unique_id: 'abc123',
    first_name: 'Test',
    last_name: 'User',
  };

  const mockInterview = {
    id: 1,
    unique_id: 'uid123',
    staff_id: 1,
    stage: 'HR',
    status: 'Pending',
    operations_cleared: false,
    finance_cleared: false,
    created_by: 'test@mercycorps.org',
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    mockPool.getConnection.mockResolvedValue(mockConn);
    service = new ExitInterviewService(mockPool as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOne', () => {
    it('returns exit interview when found', async () => {
      mockConn.query.mockResolvedValueOnce([[mockInterview]]);
      const result = await service.findOne('uid123');
      expect(result).toEqual(mockInterview);
    });

    it('throws NotFoundException when not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);
      await expect(service.findOne('bad')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByUniqueId', () => {
    it('returns exit interview when found', async () => {
      mockConn.query.mockResolvedValueOnce([[mockInterview]]);
      const result = await service.findByUniqueId('uid123');
      expect(result).toEqual(mockInterview);
    });

    it('throws NotFoundException when not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);
      await expect(service.findByUniqueId('bad')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByStaffId', () => {
    it('returns list of exit interviews', async () => {
      mockConn.query.mockResolvedValueOnce([[mockInterview]]);
      const result = await service.findByStaffId(1);
      expect(result).toEqual([mockInterview]);
    });
  });

  describe('findBySupervisorId', () => {
    it('returns list of exit interviews', async () => {
      mockConn.query.mockResolvedValueOnce([[mockInterview]]);
      const result = await service.findBySupervisorId('sup123');
      expect(result).toEqual([mockInterview]);
    });
  });

  describe('update', () => {
    it('throws NotFoundException when not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);
      await expect(service.update('bad', {})).rejects.toThrow(NotFoundException);
    });

    it('returns existing record when dto is empty', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]);
      mockPool.getConnection.mockResolvedValueOnce(mockConn);
      mockConn.query.mockResolvedValueOnce([[mockInterview]]);
      const result = await service.update('uid123', {});
      expect(result).toEqual(mockInterview);
    });
  });

  describe('remove', () => {
    it('deletes exit interview successfully', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]);
      mockConn.execute.mockResolvedValueOnce([{}]);
      const result = await service.remove('uid123');
      expect(result).toEqual({ message: 'Exit interview uid123 deleted successfully' });
    });

    it('throws NotFoundException when not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);
      await expect(service.remove('bad')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getClearanceStatus', () => {
    it('returns clearance status', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1, operations_cleared: 1, finance_cleared: 0 }]]);
      mockConn.query.mockResolvedValueOnce([[]]);
      const result = await service.getClearanceStatus('uid123');
      expect(result.operations_cleared).toBe(true);
      expect(result.finance_cleared).toBe(false);
      expect(result.hr_can_finalize).toBe(false);
    });

    it('throws NotFoundException when not found', async () => {
      mockConn.query.mockResolvedValueOnce([[undefined]]);
      await expect(service.getClearanceStatus('bad')).rejects.toThrow(NotFoundException);
    });
  });

  describe('finalize', () => {
    it('throws NotFoundException when not found', async () => {
      mockConn.query.mockResolvedValueOnce([[undefined]]);
      await expect(service.finalize('bad')).rejects.toThrow(NotFoundException);
    });

    it('throws when not all departments cleared', async () => {
      mockConn.query.mockResolvedValueOnce([[{
        id: 1,
        operations_cleared: 0,
        finance_cleared: 0,
        stage: 'Operations',
      }]]);
      await expect(service.finalize('uid123')).rejects.toThrow(
        'Cannot finalize: Operations and Finance must both clear before HR can finalize.',
      );
    });
  });

  describe('create', () => {
    it('throws NotFoundException when supervisor not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]); // supervisor not found
      const dto = {
        staffId: 1,
        supervisorId: 'sup123',
        resignationDate: '2026-06-01',
        reasonForLeaving: 'Personal',
        ratingCulture: 4,
        ratingJob: 4,
        ratingManager: 4,
        wouldRecommend: 'Yes',
      };
      await expect(service.create(dto as any, mockUser)).rejects.toThrow(NotFoundException);
    });
  });
});