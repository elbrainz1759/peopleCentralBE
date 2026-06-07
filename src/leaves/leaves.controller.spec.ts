import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LeavesController } from './leaves.controller';
import { LeavesService } from './leaves.service';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { CancelLeaveDto } from './dto/cancel-leave.dto';
import type { Request } from 'express';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockUser = { email: 'hr@mercycorps.org', id: 1, role: 'hr' };

const mockReq = (user = mockUser): Partial<Request> => ({ user });

const mockLeave = {
  id: 1,
  unique_id: 'abc123',
  staff_id: 10,
  leave_type_id: 'lt-uid-001',
  leave_type_name: 'Annual Leave',
  reason: 'Vacation',
  handover_note: 'John covers',
  total_hours: 40,
  status: 'Pending' as const,
  created_by: 'staff@mercycorps.org',
  created_at: new Date('2026-01-10'),
  durations: [{ id: 1, leave_id: 1, start_date: '2026-02-03', end_date: '2026-02-07', hours: 40 }],
};

const mockPaginated = {
  data: [mockLeave],
  meta: { total: 1, page: 1, limit: 10, last_page: 1 },
};

// ─── Service mock ─────────────────────────────────────────────────────────────

const mockLeavesService = {
  create:           jest.fn(),
  findAll:          jest.fn(),
  findOne:          jest.fn(),
  findCancellation: jest.fn(),
  review:           jest.fn(),
  approve:          jest.fn(),
  reject:           jest.fn(),
  cancel:           jest.fn(),
};

// ─── Module setup ─────────────────────────────────────────────────────────────

describe('LeavesController', () => {
  let controller: LeavesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LeavesController],
      providers:   [{ provide: LeavesService, useValue: mockLeavesService }],
    }).compile();

    controller = module.get<LeavesController>(LeavesController);
    jest.clearAllMocks();
  });

  // ── POST /leaves ─────────────────────────────────────────────────────────────

  describe('create()', () => {
    const dto: CreateLeaveDto = {
      staffId:       10,
      leaveTypeId:   'lt-uid-001',
      reason:        'Vacation',
      handoverNote:  'John covers',
      leaveDuration: [{ startDate: '2026-02-03', endDate: '2026-02-07' }],
    };

    it('calls service.create() with dto and user from req', async () => {
      mockLeavesService.create.mockResolvedValue(mockLeave);

      const result = await controller.create(dto, mockReq() as Request);

      expect(mockLeavesService.create).toHaveBeenCalledWith(dto, mockUser, undefined);
      expect(result).toEqual(mockLeave);
    });

    it('propagates BadRequestException from service', async () => {
      mockLeavesService.create.mockRejectedValue(
        new BadRequestException('Insufficient leave balance'),
      );

      await expect(controller.create(dto, mockReq() as Request)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── GET /leaves ──────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('returns paginated result', async () => {
      mockLeavesService.findAll.mockResolvedValue(mockPaginated);

      const result = await controller.findAll({ page: 1, limit: 10 });

      expect(mockLeavesService.findAll).toHaveBeenCalledWith({ page: 1, limit: 10 });
      expect(result).toEqual(mockPaginated);
    });

    it('passes status and staffId filters to service', async () => {
      mockLeavesService.findAll.mockResolvedValue(mockPaginated);
      const query = { page: 1, limit: 10, status: 'Pending' as const, staffId: 10 };

      await controller.findAll(query);

      expect(mockLeavesService.findAll).toHaveBeenCalledWith(query);
    });
  });

  // ── GET /leaves/:id ──────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('returns the leave by id', async () => {
      mockLeavesService.findOne.mockResolvedValue(mockLeave);

      const result = await controller.findOne(1);

      expect(mockLeavesService.findOne).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockLeave);
    });

    it('propagates NotFoundException', async () => {
      mockLeavesService.findOne.mockRejectedValue(new NotFoundException('Leave with id 999 not found'));

      await expect(controller.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ── GET /leaves/:id/cancellation ─────────────────────────────────────────────

  describe('findCancellation()', () => {
    const record = {
      id: 1, leave_id: 1, staff_id: 10,
      staff_name: 'John Doe', reason: 'Plans changed',
      cancelled_by: 'staff@mc.org', cancelled_at: new Date(),
    };

    it('returns the cancellation record', async () => {
      mockLeavesService.findCancellation.mockResolvedValue(record);

      const result = await controller.findCancellation(1);

      expect(mockLeavesService.findCancellation).toHaveBeenCalledWith(1);
      expect(result).toEqual(record);
    });

    it('propagates NotFoundException when no record', async () => {
      mockLeavesService.findCancellation.mockRejectedValue(
        new NotFoundException('No cancellation record found for leave id 1'),
      );

      await expect(controller.findCancellation(1)).rejects.toThrow(NotFoundException);
    });
  });

  // ── PATCH /leaves/:id/review ─────────────────────────────────────────────────

  describe('review()', () => {
    it('passes id and user.email to service.review()', async () => {
      const reviewed = { ...mockLeave, status: 'Reviewed' as const };
      mockLeavesService.review.mockResolvedValue(reviewed);

      const result = await controller.review(1, mockReq() as Request);

      expect(mockLeavesService.review).toHaveBeenCalledWith(1, mockUser.email);
      expect(result).toEqual(reviewed);
    });

    it('propagates BadRequestException when leave is not Pending', async () => {
      mockLeavesService.review.mockRejectedValue(
        new BadRequestException('Only Pending leaves can be reviewed'),
      );

      await expect(controller.review(1, mockReq() as Request)).rejects.toThrow(BadRequestException);
    });

    it('propagates NotFoundException', async () => {
      mockLeavesService.review.mockRejectedValue(new NotFoundException('Leave with id 999 not found'));

      await expect(controller.review(999, mockReq() as Request)).rejects.toThrow(NotFoundException);
    });
  });

  // ── PATCH /leaves/:id/approve ────────────────────────────────────────────────

  describe('approve()', () => {
    it('passes id and user.email to service.approve()', async () => {
      const approved = { ...mockLeave, status: 'Approved' as const };
      mockLeavesService.approve.mockResolvedValue(approved);

      const result = await controller.approve(1, mockReq() as Request);

      expect(mockLeavesService.approve).toHaveBeenCalledWith(1, mockUser.email);
      expect(result).toEqual(approved);
    });

    it('propagates BadRequestException when not Reviewed', async () => {
      mockLeavesService.approve.mockRejectedValue(
        new BadRequestException('Only Reviewed leaves can be approved'),
      );

      await expect(controller.approve(1, mockReq() as Request)).rejects.toThrow(BadRequestException);
    });

    it('propagates BadRequestException for insufficient balance', async () => {
      mockLeavesService.approve.mockRejectedValue(
        new BadRequestException('Insufficient leave balance'),
      );

      await expect(controller.approve(1, mockReq() as Request)).rejects.toThrow(BadRequestException);
    });

    it('propagates NotFoundException', async () => {
      mockLeavesService.approve.mockRejectedValue(new NotFoundException('Leave with id 999 not found'));

      await expect(controller.approve(999, mockReq() as Request)).rejects.toThrow(NotFoundException);
    });
  });

  // ── PATCH /leaves/:id/reject ─────────────────────────────────────────────────

  describe('reject()', () => {
    it('passes id and user.email to service.reject()', async () => {
      const rejected = { ...mockLeave, status: 'Rejected' as const };
      mockLeavesService.reject.mockResolvedValue(rejected);

      const result = await controller.reject(1, mockReq() as Request);

      expect(mockLeavesService.reject).toHaveBeenCalledWith(1, mockUser.email);
      expect(result).toEqual(rejected);
    });

    it('propagates BadRequestException on invalid status', async () => {
      mockLeavesService.reject.mockRejectedValue(
        new BadRequestException('Only Pending, Reviewed, or Approved leaves can be rejected'),
      );

      await expect(controller.reject(1, mockReq() as Request)).rejects.toThrow(BadRequestException);
    });

    it('propagates NotFoundException', async () => {
      mockLeavesService.reject.mockRejectedValue(new NotFoundException('Leave with id 999 not found'));

      await expect(controller.reject(999, mockReq() as Request)).rejects.toThrow(NotFoundException);
    });
  });

  // ── PATCH /leaves/:id/cancel ─────────────────────────────────────────────────

  describe('cancel()', () => {
    const cancelDto: CancelLeaveDto = { reason: 'Change of plans' };

    it('passes id, user.email, and reason to service.cancel()', async () => {
      const cancelled = { ...mockLeave, status: 'Cancelled' as const };
      mockLeavesService.cancel.mockResolvedValue(cancelled);

      const result = await controller.cancel(1, cancelDto, mockReq() as Request);

      expect(mockLeavesService.cancel).toHaveBeenCalledWith(1, mockUser.email, cancelDto.reason);
      expect(result).toEqual(cancelled);
    });

    it('passes undefined reason when dto.reason is omitted', async () => {
      mockLeavesService.cancel.mockResolvedValue({ ...mockLeave, status: 'Cancelled' });

      await controller.cancel(1, {}, mockReq() as Request);

      expect(mockLeavesService.cancel).toHaveBeenCalledWith(1, mockUser.email, undefined);
    });

    it('propagates ForbiddenException when leave is Approved', async () => {
      mockLeavesService.cancel.mockRejectedValue(
        new ForbiddenException('Approved leaves cannot be self-cancelled'),
      );

      await expect(controller.cancel(1, cancelDto, mockReq() as Request)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('propagates BadRequestException on invalid status', async () => {
      mockLeavesService.cancel.mockRejectedValue(
        new BadRequestException('Only Pending or Reviewed leaves can be cancelled'),
      );

      await expect(controller.cancel(1, cancelDto, mockReq() as Request)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('propagates NotFoundException', async () => {
      mockLeavesService.cancel.mockRejectedValue(new NotFoundException('Leave with id 999 not found'));

      await expect(controller.cancel(999, cancelDto, mockReq() as Request)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});