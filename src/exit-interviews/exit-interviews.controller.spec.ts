import { Test, TestingModule } from '@nestjs/testing';
import { ExitInterviewController } from './exit-interviews.controller';
import { ExitInterviewService } from './exit-interviews.service';
import type { Request } from 'express';

// ─── Mock Service ─────────────────────────────────────────────────────────────

const mockExitInterviewService = {
  getDashboard: jest.fn(),
  create: jest.fn(),
  findAll: jest.fn(),
  findPendingByDepartment: jest.fn(),
  findByUniqueId: jest.fn(),
  findByStaffId: jest.fn(),
  findBySupervisorId: jest.fn(),
  getClearanceStatus: jest.fn(),
  getAuditLog: jest.fn(),
  findOne: jest.fn(),
  clearDepartment: jest.fn(),
  finalize: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockUser = { email: 'hr@mc.org', sub: 1, role: 'hr' };

const mockReq = (user = mockUser) =>
  ({ user } as unknown as Request);

const baseDetail = {
  id: 1,
  unique_id: 'abc123',
  staff_id: 1001,
  stage: 'Supervisor',
  status: 'Pending',
  staff_first_name: 'John',
  staff_last_name: 'Doe',
};

const basePaginated = {
  data: [baseDetail],
  meta: { total: 1, page: 1, limit: 10, last_page: 1 },
};

const baseClearanceStatus = {
  exit_interview_id: 'abc123',
  stage: 'HR',
  supervisor_cleared: 'Yes',
  hr_cleared: 'Pending',
  operations_cleared: 'Pending',
  finance_cleared: 'Pending',
  hr_director_cleared: 'Pending',
  hr_can_finalize: false,
  completed: false,
  clearances: [],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ExitInterviewController', () => {
  let controller: ExitInterviewController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExitInterviewController],
      providers: [
        { provide: ExitInterviewService, useValue: mockExitInterviewService },
      ],
    }).compile();

    controller = module.get<ExitInterviewController>(ExitInterviewController);
    jest.clearAllMocks();
  });

  // ── getDashboard ────────────────────────────────────────────────────────────

  describe('getDashboard()', () => {
    it('returns dashboard aggregates', async () => {
      const mockDashboard = { total: 5, by_stage: [], by_status: [] };
      mockExitInterviewService.getDashboard.mockResolvedValue(mockDashboard);

      const result = await controller.getDashboard();

      expect(mockExitInterviewService.getDashboard).toHaveBeenCalled();
      expect(result).toEqual(mockDashboard);
    });
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('calls service.create() with dto and user', async () => {
      mockExitInterviewService.create.mockResolvedValue(baseDetail);

      const dto = {
        staffId: 1001,
        supervisorId: 'sup-uid',
        departmentId: 'dept-uid',
        resignationDate: '2026-07-01',
        reasonForLeaving: 'Better Opportunity',
      } as any;

      const result = await controller.create(dto, mockReq());

      expect(mockExitInterviewService.create).toHaveBeenCalledWith(dto, mockUser);
      expect(result).toEqual(baseDetail);
    });
  });

  // ── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('returns paginated results', async () => {
      mockExitInterviewService.findAll.mockResolvedValue(basePaginated);

      const result = await controller.findAll({ page: 1, limit: 10 });

      expect(mockExitInterviewService.findAll).toHaveBeenCalledWith({ page: 1, limit: 10 });
      expect(result).toEqual(basePaginated);
    });
  });

  // ── findPendingByDepartment ─────────────────────────────────────────────────

  describe('findPendingByDepartment()', () => {
    it('calls service with department param', async () => {
      mockExitInterviewService.findPendingByDepartment.mockResolvedValue(basePaginated);

      const result = await controller.findPendingByDepartment('Operations');

      expect(mockExitInterviewService.findPendingByDepartment).toHaveBeenCalledWith('Operations');
      expect(result).toEqual(basePaginated);
    });
  });

  // ── findByUniqueId ──────────────────────────────────────────────────────────

  describe('findByUniqueId()', () => {
    it('calls service with uniqueId', async () => {
      mockExitInterviewService.findByUniqueId.mockResolvedValue(baseDetail);

      const result = await controller.findByUniqueId('abc123');

      expect(mockExitInterviewService.findByUniqueId).toHaveBeenCalledWith('abc123');
      expect(result).toEqual(baseDetail);
    });
  });

  // ── findByStaffId ───────────────────────────────────────────────────────────

  describe('findByStaffId()', () => {
    it('calls service with parsed staffId', async () => {
      mockExitInterviewService.findByStaffId.mockResolvedValue([baseDetail]);

      const result = await controller.findByStaffId(1001);

      expect(mockExitInterviewService.findByStaffId).toHaveBeenCalledWith(1001);
      expect(result).toEqual([baseDetail]);
    });
  });

  // ── findBySupervisorId ──────────────────────────────────────────────────────

  describe('findBySupervisorId()', () => {
    it('calls service with supervisorId', async () => {
      mockExitInterviewService.findBySupervisorId.mockResolvedValue([baseDetail]);

      const result = await controller.findBySupervisorId('sup-uid');

      expect(mockExitInterviewService.findBySupervisorId).toHaveBeenCalledWith('sup-uid');
      expect(result).toEqual([baseDetail]);
    });
  });

  // ── getClearanceStatus ──────────────────────────────────────────────────────

  describe('getClearanceStatus()', () => {
    it('returns clearance status for an interview', async () => {
      mockExitInterviewService.getClearanceStatus.mockResolvedValue(baseClearanceStatus);

      const result = await controller.getClearanceStatus('abc123');

      expect(mockExitInterviewService.getClearanceStatus).toHaveBeenCalledWith('abc123');
      expect(result).toEqual(baseClearanceStatus);
    });
  });

  // ── getAuditLog ─────────────────────────────────────────────────────────────

  describe('getAuditLog()', () => {
    it('returns audit log for an interview', async () => {
      const mockLog = [
        {
          id: 1,
          interview_id: 'abc123',
          action: 'Exit interview submitted',
          performed_by: 'hr@mc.org',
          created_at: new Date(),
        },
      ];
      mockExitInterviewService.getAuditLog.mockResolvedValue(mockLog);

      const result = await controller.getAuditLog('abc123');

      expect(mockExitInterviewService.getAuditLog).toHaveBeenCalledWith('abc123');
      expect(result).toEqual(mockLog);
    });
  });

  // ── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('returns a single interview by id', async () => {
      mockExitInterviewService.findOne.mockResolvedValue(baseDetail);

      const result = await controller.findOne('abc123');

      expect(mockExitInterviewService.findOne).toHaveBeenCalledWith('abc123');
      expect(result).toEqual(baseDetail);
    });
  });

  // ── clearDepartment ─────────────────────────────────────────────────────────

  describe('clearDepartment()', () => {
    it('calls service with id, department cast, user email, itemIds and notes', async () => {
      mockExitInterviewService.clearDepartment.mockResolvedValue(baseClearanceStatus);

      const dto = {
        department: 'HR',
        checkListItemIds: [1, 2],
        notes: 'All items checked',
      };

      const result = await controller.clearDepartment('abc123', dto as any, mockReq());

      expect(mockExitInterviewService.clearDepartment).toHaveBeenCalledWith(
        'abc123',
        'HR',
        mockUser.email,
        [1, 2],
        'All items checked',
      );
      expect(result).toEqual(baseClearanceStatus);
    });

    it('passes undefined notes when not provided', async () => {
      mockExitInterviewService.clearDepartment.mockResolvedValue(baseClearanceStatus);

      const dto = { department: 'Operations', checkListItemIds: [3] };

      await controller.clearDepartment('abc123', dto as any, mockReq());

      expect(mockExitInterviewService.clearDepartment).toHaveBeenCalledWith(
        'abc123',
        'Operations',
        mockUser.email,
        [3],
        undefined,
      );
    });
  });

  // ── finalize ────────────────────────────────────────────────────────────────

  describe('finalize()', () => {
    it('calls service.finalize() with id and user', async () => {
      mockExitInterviewService.finalize.mockResolvedValue(baseDetail);

      const result = await controller.finalize('abc123', mockReq());

      expect(mockExitInterviewService.finalize).toHaveBeenCalledWith('abc123', mockUser);
      expect(result).toEqual(baseDetail);
    });
  });

  // ── update ──────────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('calls service.update() with id, dto and user', async () => {
      mockExitInterviewService.update.mockResolvedValue(baseDetail);

      const dto = { stage: 'HR', status: 'In_Progress' };

      const result = await controller.update('abc123', dto as any, mockReq());

      expect(mockExitInterviewService.update).toHaveBeenCalledWith('abc123', dto, mockUser);
      expect(result).toEqual(baseDetail);
    });
  });

  // ── remove ──────────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('calls service.remove() and returns confirmation', async () => {
      const mockResponse = { message: 'Exit interview abc123 deleted successfully' };
      mockExitInterviewService.remove.mockResolvedValue(mockResponse);

      const result = await controller.remove('abc123');

      expect(mockExitInterviewService.remove).toHaveBeenCalledWith('abc123');
      expect(result).toEqual(mockResponse);
    });
  });
});