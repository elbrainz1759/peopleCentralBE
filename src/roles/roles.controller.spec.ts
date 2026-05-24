import { Test, TestingModule } from '@nestjs/testing';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';

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
      controllers: [RolesController],
      providers: [
        {
          provide: RolesService,
          useValue: mockRolesService,
        },
      ],
    }).compile();

    controller = module.get<RolesController>(RolesController);
    service = module.get<RolesService>(RolesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a role', async () => {
      const dto: CreateRoleDto = {
        name: 'Admin',
        description: 'Administrator role',
      } as any;

      const expectedResult = {
        id: 1,
        unique_id: 'role-uid-1',
        name: 'Admin',
        description: 'Administrator role',
        created_by: mockUser.email,
      };

      mockRolesService.create.mockResolvedValue(expectedResult);

      const result = await controller.create(dto, mockRequest as any);

      expect(result).toEqual(expectedResult);
      expect(service.create).toHaveBeenCalledWith(dto, mockUser);
    });
  });

  describe('findAll', () => {
    it('should return paginated roles', async () => {
      const query: PaginationQueryDto = {
        page: 1,
        limit: 10,
        search: 'Admin',
      } as any;

      const expectedResult = {
        data: [
          {
            id: 1,
            name: 'Admin',
            description: 'Administrator role',
          },
        ],
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          last_page: 1,
        },
      };

      mockRolesService.findAll.mockResolvedValue(expectedResult);

      const result = await controller.findAll(query);

      expect(result).toEqual(expectedResult);
      expect(service.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('findByUniqueId', () => {
    it('should return role by unique id', async () => {
      const expectedResult = {
        id: 1,
        unique_id: 'role-uid-1',
        name: 'Admin',
      };

      mockRolesService.findByUniqueId.mockResolvedValue(expectedResult);

      const result = await controller.findByUniqueId('role-uid-1');

      expect(result).toEqual(expectedResult);
      expect(service.findByUniqueId).toHaveBeenCalledWith('role-uid-1');
    });
  });

  describe('findOne', () => {
    it('should return one role', async () => {
      const expectedResult = {
        id: 1,
        unique_id: 'role-uid-1',
        name: 'Admin',
      };

      mockRolesService.findOne.mockResolvedValue(expectedResult);

      const result = await controller.findOne(1);

      expect(result).toEqual(expectedResult);
      expect(service.findOne).toHaveBeenCalledWith(1);
    });
  });

  describe('update', () => {
    it('should update a role', async () => {
      const dto: UpdateRoleDto = {
        name: 'HR Admin',
      } as any;

      const expectedResult = {
        id: 1,
        unique_id: 'role-uid-1',
        name: 'HR Admin',
      };

      mockRolesService.update.mockResolvedValue(expectedResult);

      const result = await controller.update(1, dto);

      expect(result).toEqual(expectedResult);
      expect(service.update).toHaveBeenCalledWith(1, dto);
    });
  });

  describe('remove', () => {
    it('should delete a role', async () => {
      const expectedResult = {
        message: 'Role 1 deleted successfully',
      };

      mockRolesService.remove.mockResolvedValue(expectedResult);

      const result = await controller.remove(1);

      expect(result).toEqual(expectedResult);
      expect(service.remove).toHaveBeenCalledWith(1);
    });
  });
});