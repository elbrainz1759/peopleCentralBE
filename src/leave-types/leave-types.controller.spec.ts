import { Test, TestingModule } from '@nestjs/testing';
import { LeaveTypesController } from './leave-types.controller';
import { LeaveTypesService } from './leave-types.service';
import { CreateLeaveTypeDto } from './dto/create-leave-type.dto';
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

describe('LeaveTypesController', () => {
  let controller: LeaveTypesController;
  let service: LeaveTypesService;

  const mockLeaveTypesService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findByUniqueId: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const mockUser: RequestUser = {
    id: 1,
    email: 'hr@mercycorps.org',
    role: 'Admin',
    unique_id: 'abc123',
    first_name: 'HR',
    last_name: 'User',
  };

  const mockRequest = { user: mockUser };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LeaveTypesController],
      providers: [{ provide: LeaveTypesService, useValue: mockLeaveTypesService }],
    }).compile();

    controller = module.get<LeaveTypesController>(LeaveTypesController);
    service = module.get<LeaveTypesService>(LeaveTypesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('calls service.create with dto and user extracted from req', async () => {
      const dto: CreateLeaveTypeDto = {
        name: 'Annual Leave',
        description: 'Yearly leave',
        country: 'Nigeria',
        requireDocument: 'No',
        trigger: 0,
      } as any;
      const expected = { id: 1, unique_id: 'lt-uid-1', name: 'Annual Leave' };

      mockLeaveTypesService.create.mockResolvedValue(expected);

      const result = await controller.create(dto, mockRequest as any);

      expect(result).toEqual(expected);
      expect(service.create).toHaveBeenCalledWith(dto, mockUser);
    });
  });

  // ─── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('calls service.findAll with query and returns paginated result', async () => {
      const query: PaginationQueryDto = { page: 1, limit: 10, search: 'Annual' } as any;
      const expected = {
        data: [{ id: 1, name: 'Annual Leave' }],
        meta: { total: 1, page: 1, limit: 10, last_page: 1 },
      };

      mockLeaveTypesService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(query);

      expect(result).toEqual(expected);
      expect(service.findAll).toHaveBeenCalledWith(query);
    });
  });

  // ─── findByUniqueId ──────────────────────────────────────────────────────────

  describe('findByUniqueId', () => {
    it('calls service.findByUniqueId with uniqueId string and returns leave type', async () => {
      const expected = { id: 1, unique_id: 'lt-uid-1', name: 'Annual Leave' };

      mockLeaveTypesService.findByUniqueId.mockResolvedValue(expected);

      const result = await controller.findByUniqueId('lt-uid-1');

      expect(result).toEqual(expected);
      expect(service.findByUniqueId).toHaveBeenCalledWith('lt-uid-1');
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('calls service.findOne with id string and returns leave type', async () => {
      const expected = { id: 1, unique_id: 'lt-uid-1', name: 'Annual Leave' };

      mockLeaveTypesService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne('lt-uid-1');

      expect(result).toEqual(expected);
      expect(service.findOne).toHaveBeenCalledWith('lt-uid-1');
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('calls service.update with id string and dto, returns updated leave type', async () => {
      const dto: UpdateLeaveTypeDto = { requireDocument: 'Yes', trigger: 5 } as any;
      const expected = { id: 1, unique_id: 'lt-uid-1', require_document: 'Yes', trigger_value: 5 };

      mockLeaveTypesService.update.mockResolvedValue(expected);

      const result = await controller.update('lt-uid-1', dto);

      expect(result).toEqual(expected);
      expect(service.update).toHaveBeenCalledWith('lt-uid-1', dto);
    });
  });

  // ─── remove ──────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('calls service.remove with id string and returns confirmation', async () => {
      const expected = { message: 'Leave type lt-uid-1 deleted successfully' };

      mockLeaveTypesService.remove.mockResolvedValue(expected);

      const result = await controller.remove('lt-uid-1');

      expect(result).toEqual(expected);
      expect(service.remove).toHaveBeenCalledWith('lt-uid-1');
    });
  });
});