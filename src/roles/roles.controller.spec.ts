import { Test, TestingModule } from '@nestjs/testing';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

describe('RolesController', () => {
  let controller: RolesController;
  let service: RolesService;

  const mockRolesService = {
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
      controllers: [RolesController],
      providers: [{ provide: RolesService, useValue: mockRolesService }],
    }).compile();

    controller = module.get<RolesController>(RolesController);
    service = module.get<RolesService>(RolesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('calls service.create with dto and user extracted from req', async () => {
      const dto: CreateRoleDto = { name: 'Admin', description: 'Administrator role' } as any;
      const expected = { id: 1, unique_id: 'role-uid-1', name: 'Admin', created_by: mockUser.email };

      mockRolesService.create.mockResolvedValue(expected);

      const result = await controller.create(dto, mockRequest as any);

      expect(result).toEqual(expected);
      expect(service.create).toHaveBeenCalledWith(dto, mockUser);
    });
  });

  // ─── findAll ───────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('calls service.findAll with query and returns paginated result', async () => {
      const query: PaginationQueryDto = { page: 1, limit: 10, search: 'Admin' } as any;
      const expected = {
        data: [{ id: 1, name: 'Admin', description: 'Administrator role' }],
        meta: { total: 1, page: 1, limit: 10, last_page: 1 },
      };

      mockRolesService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(query);

      expect(result).toEqual(expected);
      expect(service.findAll).toHaveBeenCalledWith(query);
    });
  });

  // ─── findByUniqueId ────────────────────────────────────────────────────────

  describe('findByUniqueId', () => {
    it('calls service.findByUniqueId with uniqueId string and returns role', async () => {
      const expected = { id: 1, unique_id: 'role-uid-1', name: 'Admin' };

      mockRolesService.findByUniqueId.mockResolvedValue(expected);

      const result = await controller.findByUniqueId('role-uid-1');

      expect(result).toEqual(expected);
      expect(service.findByUniqueId).toHaveBeenCalledWith('role-uid-1');
    });
  });

  // ─── findOne ───────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('calls service.findOne with id string and returns role', async () => {
      const expected = { id: 1, unique_id: 'role-uid-1', name: 'Admin' };

      mockRolesService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne('role-uid-1');

      expect(result).toEqual(expected);
      expect(service.findOne).toHaveBeenCalledWith('role-uid-1');
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('calls service.update with id string and dto, returns updated role', async () => {
      const dto: UpdateRoleDto = { name: 'HR Admin' } as any;
      const expected = { id: 1, unique_id: 'role-uid-1', name: 'HR Admin' };

      mockRolesService.update.mockResolvedValue(expected);

      const result = await controller.update('role-uid-1', dto);

      expect(result).toEqual(expected);
      expect(service.update).toHaveBeenCalledWith('role-uid-1', dto);
    });
  });

  // ─── remove ────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('calls service.remove with id string and returns confirmation', async () => {
      const expected = { message: 'Role role-uid-1 deleted successfully' };

      mockRolesService.remove.mockResolvedValue(expected);

      const result = await controller.remove('role-uid-1');

      expect(result).toEqual(expected);
      expect(service.remove).toHaveBeenCalledWith('role-uid-1');
    });
  });
});