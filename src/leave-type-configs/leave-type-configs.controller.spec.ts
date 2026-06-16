import { Test, TestingModule } from '@nestjs/testing';
import { LeaveTypeConfigsController } from './leave-type-configs.controller';
import { LeaveTypeConfigsService } from './leave-type-configs.service';
import { CreateLeaveTypeConfigDto } from './dto/create-leave-type-config.dto';
import { UpdateLeaveTypeConfigDto } from './dto/update-leave-type-config.dto';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

describe('LeaveTypeConfigsController', () => {
  let controller: LeaveTypeConfigsController;
  let service: LeaveTypeConfigsService;

  const mockLeaveTypeConfigsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findByLeaveType: jest.fn(),
    findByCountry: jest.fn(),
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
      controllers: [LeaveTypeConfigsController],
      providers: [{ provide: LeaveTypeConfigsService, useValue: mockLeaveTypeConfigsService }],
    }).compile();

    controller = module.get<LeaveTypeConfigsController>(LeaveTypeConfigsController);
    service = module.get<LeaveTypeConfigsService>(LeaveTypeConfigsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('calls service.create with dto and user extracted from req', async () => {
      const dto: CreateLeaveTypeConfigDto = {
        leaveTypeId: 'lt-uid-1',
        country: 'country-uid-1',
        annualHours: 160,
        monthlyAccrualHours: 13.33,
      } as any;
      const expected = { id: 1, unique_id: 'cfg-uid-1', leave_type_id: 'lt-uid-1', annual_hours: 160 };

      mockLeaveTypeConfigsService.create.mockResolvedValue(expected);

      const result = await controller.create(dto, mockRequest as any);

      expect(result).toEqual(expected);
      expect(service.create).toHaveBeenCalledWith(dto, mockUser);
    });
  });

  // ─── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('calls service.findAll and returns all configs', async () => {
      const expected = [{ id: 1, annual_hours: 160 }];

      mockLeaveTypeConfigsService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll();

      expect(result).toEqual(expected);
      expect(service.findAll).toHaveBeenCalled();
    });
  });

  // ─── findByLeaveType ─────────────────────────────────────────────────────────

  describe('findByLeaveType', () => {
    it('calls service.findByLeaveType with leaveTypeId and returns configs', async () => {
      const expected = [{ id: 1, leave_type_id: 'lt-uid-1' }];

      mockLeaveTypeConfigsService.findByLeaveType.mockResolvedValue(expected);

      const result = await controller.findByLeaveType('lt-uid-1');

      expect(result).toEqual(expected);
      expect(service.findByLeaveType).toHaveBeenCalledWith('lt-uid-1');
    });
  });

  // ─── findByCountry ───────────────────────────────────────────────────────────

  describe('findByCountry', () => {
    it('calls service.findByCountry with country string and returns configs', async () => {
      const expected = [{ id: 1, country: 'country-uid-1' }];

      mockLeaveTypeConfigsService.findByCountry.mockResolvedValue(expected);

      const result = await controller.findByCountry('country-uid-1');

      expect(result).toEqual(expected);
      expect(service.findByCountry).toHaveBeenCalledWith('country-uid-1');
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('calls service.findOne with id string and returns config', async () => {
      const expected = { id: 1, unique_id: 'cfg-uid-1', annual_hours: 160 };

      mockLeaveTypeConfigsService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne('cfg-uid-1');

      expect(result).toEqual(expected);
      expect(service.findOne).toHaveBeenCalledWith('cfg-uid-1');
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('calls service.update with id string and dto, returns updated config', async () => {
      const dto: UpdateLeaveTypeConfigDto = { annualHours: 200 } as any;
      const expected = { id: 1, unique_id: 'cfg-uid-1', annual_hours: 200 };

      mockLeaveTypeConfigsService.update.mockResolvedValue(expected);

      const result = await controller.update('cfg-uid-1', dto);

      expect(result).toEqual(expected);
      expect(service.update).toHaveBeenCalledWith('cfg-uid-1', dto);
    });
  });

  // ─── remove ──────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('calls service.remove with id string and returns confirmation', async () => {
      const expected = { deleted: true, id: 'cfg-uid-1' };

      mockLeaveTypeConfigsService.remove.mockResolvedValue(expected);

      const result = await controller.remove('cfg-uid-1');

      expect(result).toEqual(expected);
      expect(service.remove).toHaveBeenCalledWith('cfg-uid-1');
    });
  });
});