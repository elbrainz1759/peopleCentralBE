import { Test, TestingModule } from '@nestjs/testing';
import { DepartmentsController } from './departments.controller';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

describe('DepartmentsController', () => {
  let controller: DepartmentsController;
  let service: DepartmentsService;

  const mockDepartmentsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findByUniqueId: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const mockUser: RequestUser = {
    id: 1,
    email: 'john@example.com',
    role: 'Admin',
    unique_id: 'abc123',
    first_name: 'John',
    last_name: 'Doe',
  };

  const mockRequest = { user: mockUser };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DepartmentsController],
      providers: [{ provide: DepartmentsService, useValue: mockDepartmentsService }],
    }).compile();

    controller = module.get<DepartmentsController>(DepartmentsController);
    service = module.get<DepartmentsService>(DepartmentsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('calls service.create with dto and user extracted from req', async () => {
      const dto: CreateDepartmentDto = { name: 'Engineering' } as any;
      const expected = { id: 1, unique_id: 'dept-uid-1', name: 'Engineering', created_by: mockUser.email };

      mockDepartmentsService.create.mockResolvedValue(expected);

      const result = await controller.create(dto, mockRequest as any);

      expect(result).toEqual(expected);
      expect(service.create).toHaveBeenCalledWith(dto, mockUser);
    });
  });

  // ─── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('calls service.findAll with query and returns paginated result', async () => {
      const query: PaginationQueryDto = { page: 1, limit: 10, search: 'Eng' } as any;
      const expected = {
        data: [{ id: 1, name: 'Engineering' }],
        meta: { total: 1, page: 1, limit: 10, last_page: 1 },
      };

      mockDepartmentsService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(query);

      expect(result).toEqual(expected);
      expect(service.findAll).toHaveBeenCalledWith(query);
    });
  });

  // ─── findByUniqueId ──────────────────────────────────────────────────────────

  describe('findByUniqueId', () => {
    it('calls service.findByUniqueId with uniqueId string and returns department', async () => {
      const expected = { id: 1, unique_id: 'dept-uid-1', name: 'Engineering' };

      mockDepartmentsService.findByUniqueId.mockResolvedValue(expected);

      const result = await controller.findByUniqueId('dept-uid-1');

      expect(result).toEqual(expected);
      expect(service.findByUniqueId).toHaveBeenCalledWith('dept-uid-1');
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('calls service.findOne with id string and returns department', async () => {
      const expected = { id: 1, unique_id: 'dept-uid-1', name: 'Engineering' };

      mockDepartmentsService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne('dept-uid-1');

      expect(result).toEqual(expected);
      expect(service.findOne).toHaveBeenCalledWith('dept-uid-1');
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('calls service.update with id string and dto, returns updated department', async () => {
      const dto: UpdateDepartmentDto = { name: 'HR' } as any;
      const expected = { id: 1, unique_id: 'dept-uid-1', name: 'HR' };

      mockDepartmentsService.update.mockResolvedValue(expected);

      const result = await controller.update('dept-uid-1', dto);

      expect(result).toEqual(expected);
      expect(service.update).toHaveBeenCalledWith('dept-uid-1', dto);
    });
  });

  // ─── remove ──────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('calls service.remove with id string and returns confirmation', async () => {
      const expected = { message: 'Department dept-uid-1 deleted successfully' };

      mockDepartmentsService.remove.mockResolvedValue(expected);

      const result = await controller.remove('dept-uid-1');

      expect(result).toEqual(expected);
      expect(service.remove).toHaveBeenCalledWith('dept-uid-1');
    });
  });
});