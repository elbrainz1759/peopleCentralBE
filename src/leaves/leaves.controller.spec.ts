import { Test, TestingModule } from '@nestjs/testing';
import { LeavesController } from './leaves.controller';
import { LeavesService } from './leaves.service';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';

describe('LeavesController', () => {
  let controller: LeavesController;
  let service: LeavesService;

  const mockLeavesService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    review: jest.fn(),
    approve: jest.fn(),
    reject: jest.fn(),
  };

  const mockUser = {
    id: 1,
    email: 'hr@mercycorps.org',
    role: 'Admin',
    unique_id: 'abc123',
    first_name: 'HR',
    last_name: 'User',
  };

  const mockRequest = {
    user: mockUser,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LeavesController],
      providers: [
        {
          provide: LeavesService,
          useValue: mockLeavesService,
        },
      ],
    }).compile();

    controller = module.get<LeavesController>(LeavesController);
    service = module.get<LeavesService>(LeavesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a leave request', async () => {
      const dto: CreateLeaveDto = {
        staffId: 1,
        leaveTypeId: 'annual-leave',
        reason: 'Vacation',
        handoverNote: 'Handover completed',
        leaveDuration: [
          {
            startDate: '2026-05-25',
            endDate: '2026-05-26',
          },
        ],
      } as any;

      const expectedResult = {
        id: 1,
        unique_id: 'leave-uid-1',
        staff_id: 1,
        leave_type_id: 'annual-leave',
        reason: 'Vacation',
        handover_note: 'Handover completed',
        total_hours: 16,
        status: 'Pending',
        created_by: mockUser.email,
      };

      mockLeavesService.create.mockResolvedValue(expectedResult);

      const result = await controller.create(dto, mockRequest as any);

      expect(result).toEqual(expectedResult);
      expect(service.create).toHaveBeenCalledWith(dto, mockUser);
    });
  });

  describe('findAll', () => {
    it('should return paginated leaves', async () => {
      const query: PaginationQueryDto = {
        page: 1,
        limit: 10,
        status: 'Pending',
        staffId: 1,
      } as any;

      const expectedResult = {
        data: [
          {
            id: 1,
            staff_id: 1,
            status: 'Pending',
          },
        ],
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          last_page: 1,
        },
      };

      mockLeavesService.findAll.mockResolvedValue(expectedResult);

      const result = await controller.findAll(query);

      expect(result).toEqual(expectedResult);
      expect(service.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('findOne', () => {
    it('should return one leave', async () => {
      const expectedResult = {
        id: 1,
        staff_id: 1,
        status: 'Pending',
      };

      mockLeavesService.findOne.mockResolvedValue(expectedResult);

      const result = await controller.findOne(1);

      expect(result).toEqual(expectedResult);
      expect(service.findOne).toHaveBeenCalledWith(1);
    });
  });

  describe('review', () => {
    it('should review a leave request', async () => {
      const expectedResult = {
        id: 1,
        status: 'Reviewed',
      };

      mockLeavesService.review.mockResolvedValue(expectedResult);

      const result = await controller.review(1);

      expect(result).toEqual(expectedResult);
      expect(service.review).toHaveBeenCalledWith(1);
    });
  });

  describe('approve', () => {
    it('should approve a leave request', async () => {
      const expectedResult = {
        id: 1,
        status: 'Approved',
      };

      mockLeavesService.approve.mockResolvedValue(expectedResult);

      const result = await controller.approve(1);

      expect(result).toEqual(expectedResult);
      expect(service.approve).toHaveBeenCalledWith(1, 'system');
    });
  });

  describe('reject', () => {
    it('should reject a leave request', async () => {
      const expectedResult = {
        id: 1,
        status: 'Rejected',
      };

      mockLeavesService.reject.mockResolvedValue(expectedResult);

      const result = await controller.reject(1);

      expect(result).toEqual(expectedResult);
      expect(service.reject).toHaveBeenCalledWith(1, 'system');
    });
  });
});