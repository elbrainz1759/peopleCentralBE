import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LeavesController } from './leaves.controller';
import { LeavesService } from './leaves.service';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { CancelLeaveDto } from './dto/cancel-leave.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import type { Request } from 'express';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const mockUser: RequestUser = { email: 'hr@mercycorps.org', id: 1, role: 'hr' };

const mockReq = (user: RequestUser = mockUser): Partial<Request> => ({
  user,
});

const mockLeave = {
  id: 1,
  unique_id: 'abc123',
  staff_id: 10,
  leave_type_id: 'lt-uid-001',
  leave_type_name: 'Annual Leave',
  reason: 'Vacation',
  handover_note: 'John will cover',
  total_hours: 40,
  status: 'Pending' as const,
  created_by: 'staff@mercycorps.org',
  created_at: new Date('2026-01-10'),
  durations: [
    { id: 1, leave_id: 1, start_date: '2026-02-03', end_date: '2026-02-07', hours: 40 },
  ],
};

const mockPaginated = {
  data: [mockLeave],
  meta: { total: 1, page: 1, limit: 10, last_page: 1 },
};

// ─── Mock service ─────────────────────────────────────────────────────────────

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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LeavesController', () => {
  let controller: LeavesController;
  let service: typeof mockLeavesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LeavesController],
      providers: [{ provide: LeavesService, useValue: mockLeavesService }],
    }).compile();

    controller = module.get<LeavesController>(LeavesController);
    service    = mockLeavesService;
    jest.clearAllMocks();
  });

  // ── POST /leaves ────────────────────────────────────────────────────────────

  describe('create()', () => {
    const dto: CreateLeaveDto = {
      staffId:       10,
      leaveTypeId:   'lt-uid-001',
      reason:        'Vacation',
      handoverNote:  'John covers',
      leaveDuration: [{ startDate: '2026-02-03', endDate: '2026-02-07' }],
    };

    it('calls service.create() with dto and user extracted from req', async () => {
      service.create.mockResolvedValue(mockLeave);

      const result = await controller.create(dto, mockReq() as Request);

      expect(service.create).toHaveBeenCalledWith(dto, mockUser);
      expect(result).toEqual(mockLeave);
    });

    it('propagates BadRequestException from service', async () => {
      service.create.mockRejectedValue(
        new BadRequestException('Insufficient leave balance'),
      );

      await expect(
        controller.create(dto, mockReq() as Request),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── GET /leaves ─────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('returns paginated result with no filters', async () => {
      service.findAll.mockResolvedValue(mockPaginated);
      const query: PaginationQueryDto = { page: 1, limit: 10 };

      const result = await controller.findAll(query);

      expect(service.findAll).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockPaginated);
    });

    it('passes status and staffId filters through to service', async () => {
      service.findAll.mockResolvedValue(mockPaginated);
      const query: PaginationQueryDto = { page: 1, limit: 10, status: 'Pending', staffId: 10 };

      await controller.findAll(query);

      expect(service.findAll).toHaveBeenCalledWith(query);
    });
  });

  // ── GET /leaves/:id ─────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('returns a single leave by id', async () => {
      service.findOne.mockResolvedValue(mockLeave);

      const result = await controller.findOne(1);

      expect(service.findOne).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockLeave);
    });

    it('propagates NotFoundException from service', async () => {
      service.findOne.mockRejectedValue(
        new NotFoundException('Leave with id 999 not found'),
      );

      await expect(controller.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ── GET /leaves/:id/cancellation ────────────────────────────────────────────

  describe('findCancellation()', () => {
    const mockCancellation = {
      id: 1,
      leave_id: 1,
      staff_id: 10,
      staff_name: 'John Doe',
      reason: 'Change of plans',
      cancelled_by: 'staff@mercycorps.org',
      cancelled_at: new Date(),
    };

    it('returns the cancellation audit record', async () => {
      service.findCancellation.mockResolvedValue(mockCancellation);

      const result = await controller.findCancellation(1);

      expect(service.findCancellation).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockCancellation);
    });

    it('propagates NotFoundException when no cancellation record exists', async () => {
      service.findCancellation.mockRejectedValue(
        new NotFoundException('No cancellation record found for leave id 1'),
      );

      await expect(controller.findCancellation(1)).rejects.toThrow(NotFoundException);
    });
  });

  // ── PATCH /leaves/:id/review ─────────────────────────────────────────────────

  describe('review()', () => {
    it('passes id and user email to service.review()', async () => {
      const reviewed = { ...mockLeave, status: 'Reviewed' as const };
      service.review.mockResolvedValue(reviewed);

      const result = await controller.review(1, mockReq() as Request);

      expect(service.review).toHaveBeenCalledWith(1, mockUser.email);
      expect(result).toEqual(reviewed);
    });

    it('propagates BadRequestException when leave is not Pending', async () => {
      service.review.mockRejectedValue(
        new BadRequestException('Only Pending leaves can be reviewed'),
      );

      await expect(
        controller.review(1, mockReq() as Request),
      ).rejects.toThrow(BadRequestException);
    });

    it('propagates NotFoundException when leave does not exist', async () => {
      service.review.mockRejectedValue(new NotFoundException('Leave with id 999 not found'));

      await expect(
        controller.review(999, mockReq() as Request),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── PATCH /leaves/:id/approve ────────────────────────────────────────────────

  describe('approve()', () => {
    it('passes id and user email to service.approve()', async () => {
      const approved = { ...mockLeave, status: 'Approved' as const };
      service.approve.mockResolvedValue(approved);

      const result = await controller.approve(1, mockReq() as Request);

      expect(service.approve).toHaveBeenCalledWith(1, mockUser.email);
      expect(result).toEqual(approved);
    });

    it('propagates BadRequestException when leave is not Reviewed', async () => {
      service.approve.mockRejectedValue(
        new BadRequestException('Only Reviewed leaves can be approved'),
      );

      await expect(
        controller.approve(1, mockReq() as Request),
      ).rejects.toThrow(BadRequestException);
    });

    it('propagates BadRequestException for insufficient balance', async () => {
      service.approve.mockRejectedValue(
        new BadRequestException('Insufficient leave balance'),
      );

      await expect(
        controller.approve(1, mockReq() as Request),
      ).rejects.toThrow(BadRequestException);
    });

    it('propagates NotFoundException when leave does not exist', async () => {
      service.approve.mockRejectedValue(new NotFoundException('Leave with id 999 not found'));

      await expect(
        controller.approve(999, mockReq() as Request),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── PATCH /leaves/:id/reject ─────────────────────────────────────────────────

  describe('reject()', () => {
    it('passes id and user email to service.reject()', async () => {
      const rejected = { ...mockLeave, status: 'Rejected' as const };
      service.reject.mockResolvedValue(rejected);

      const result = await controller.reject(1, mockReq() as Request);

      expect(service.reject).toHaveBeenCalledWith(1, mockUser.email);
      expect(result).toEqual(rejected);
    });

    it('propagates BadRequestException when leave is already Rejected/Cancelled', async () => {
      service.reject.mockRejectedValue(
        new BadRequestException('Only Pending, Reviewed, or Approved leaves can be rejected'),
      );

      await expect(
        controller.reject(1, mockReq() as Request),
      ).rejects.toThrow(BadRequestException);
    });

    it('propagates NotFoundException when leave does not exist', async () => {
      service.reject.mockRejectedValue(new NotFoundException('Leave with id 999 not found'));

      await expect(
        controller.reject(999, mockReq() as Request),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── PATCH /leaves/:id/cancel ─────────────────────────────────────────────────

  describe('cancel()', () => {
    const cancelDto: CancelLeaveDto = { reason: 'Change of plans' };

    it('passes id, user email, and reason to service.cancel()', async () => {
      const cancelled = { ...mockLeave, status: 'Cancelled' as const };
      service.cancel.mockResolvedValue(cancelled);

      const result = await controller.cancel(1, cancelDto, mockReq() as Request);

      expect(service.cancel).toHaveBeenCalledWith(1, mockUser.email, cancelDto.reason);
      expect(result).toEqual(cancelled);
    });

    it('passes undefined reason when dto.reason is not provided', async () => {
      const cancelled = { ...mockLeave, status: 'Cancelled' as const };
      service.cancel.mockResolvedValue(cancelled);

      await controller.cancel(1, {}, mockReq() as Request);

      expect(service.cancel).toHaveBeenCalledWith(1, mockUser.email, undefined);
    });

    it('propagates ForbiddenException when leave is Approved', async () => {
      service.cancel.mockRejectedValue(
        new ForbiddenException('Approved leaves cannot be self-cancelled'),
      );

      await expect(
        controller.cancel(1, cancelDto, mockReq() as Request),
      ).rejects.toThrow(ForbiddenException);
    });

    it('propagates BadRequestException when leave is Rejected/Cancelled', async () => {
      service.cancel.mockRejectedValue(
        new BadRequestException('Only Pending or Reviewed leaves can be cancelled'),
      );

      await expect(
        controller.cancel(1, cancelDto, mockReq() as Request),
      ).rejects.toThrow(BadRequestException);
    });

    it('propagates NotFoundException when leave does not exist', async () => {
      service.cancel.mockRejectedValue(new NotFoundException('Leave with id 999 not found'));

      await expect(
        controller.cancel(999, cancelDto, mockReq() as Request),
      ).rejects.toThrow(NotFoundException);
    });
  });
});