import { Test, TestingModule } from '@nestjs/testing';
import { ProgramsController } from './programs.controller';
import { ProgramsService } from './programs.service';
import {
  CreateProgramDto,
  UpdateProgramDto,
  PaginationQueryDto,
} from './dto/program.dto';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

describe('ProgramsController', () => {
  let controller: ProgramsController;
  let service: ProgramsService;

  const mockProgramsService = {
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
      controllers: [ProgramsController],
      providers: [{ provide: ProgramsService, useValue: mockProgramsService }],
    }).compile();

    controller = module.get<ProgramsController>(ProgramsController);
    service = module.get<ProgramsService>(ProgramsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('calls service.create with dto and req.user, returns result', async () => {
      const dto: CreateProgramDto = {
        name: 'BEGE',
        fundCode: 12345,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      } as any;

      const expected = {
        id: 1,
        unique_id: 'uid-1',
        name: 'BEGE',
        fund_code: 12345,
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        created_by: mockUser.email,
        status: 'Active',
      };

      mockProgramsService.create.mockResolvedValue(expected);

      const result = await controller.create(dto, mockRequest as any);

      expect(result).toEqual(expected);
      expect(service.create).toHaveBeenCalledWith(dto, mockUser);
    });
  });

  // ─── findAll ───────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('calls service.findAll with query and returns paginated result', async () => {
      const query: PaginationQueryDto = { page: 1, limit: 10, search: 'BEGE' } as any;

      const expected = {
        data: [{ id: 1, name: 'BEGE', fund_code: 12345 }],
        meta: { total: 1, page: 1, limit: 10, last_page: 1 },
      };

      mockProgramsService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(query);

      expect(result).toEqual(expected);
      expect(service.findAll).toHaveBeenCalledWith(query);
    });
  });

  // ─── findByUniqueId ────────────────────────────────────────────────────────

  describe('findByUniqueId', () => {
    it('calls service.findByUniqueId with uniqueId string and returns program', async () => {
      const expected = { id: 1, unique_id: 'uid-1', name: 'BEGE' };

      mockProgramsService.findByUniqueId.mockResolvedValue(expected);

      const result = await controller.findByUniqueId('uid-1');

      expect(result).toEqual(expected);
      expect(service.findByUniqueId).toHaveBeenCalledWith('uid-1');
    });
  });

  // ─── findOne ───────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('calls service.findOne with unique_id string and returns program', async () => {
      const expected = { id: 1, unique_id: 'uid-1', name: 'BEGE' };

      mockProgramsService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne('uid-1');

      expect(result).toEqual(expected);
      expect(service.findOne).toHaveBeenCalledWith('uid-1');
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('calls service.update with unique_id string and dto, returns updated program', async () => {
      const dto: UpdateProgramDto = { name: 'Updated BEGE' } as any;
      const expected = { id: 1, unique_id: 'uid-1', name: 'Updated BEGE' };

      mockProgramsService.update.mockResolvedValue(expected);

      const result = await controller.update('uid-1', dto);

      expect(result).toEqual(expected);
      expect(service.update).toHaveBeenCalledWith('uid-1', dto);
    });
  });

  // ─── remove ────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('calls service.remove with unique_id string and returns confirmation', async () => {
      const expected = { message: 'Program uid-1 deleted successfully' };

      mockProgramsService.remove.mockResolvedValue(expected);

      const result = await controller.remove('uid-1');

      expect(result).toEqual(expected);
      expect(service.remove).toHaveBeenCalledWith('uid-1');
    });
  });
});