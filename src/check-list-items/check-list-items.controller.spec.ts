import { Test, TestingModule } from '@nestjs/testing';
import { CheckListItemsController } from './check-list-items.controller';
import { CheckListItemsService } from './check-list-items.service';
import { CreateCheckListItemDto } from './dto/create-check-list-item.dto';
import { UpdateCheckListItemDto } from './dto/update-check-list-item.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

describe('CheckListItemsController', () => {
  let controller: CheckListItemsController;
  let service: CheckListItemsService;

  const mockCheckListItemsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findByUniqueId: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const mockUser: RequestUser = {
    id: 1,
    email: 'admin@mc.org',
    role: 'Admin',
    unique_id: 'abc123',
    first_name: 'Admin',
    last_name: 'User',
  };

  const mockRequest = { user: mockUser };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CheckListItemsController],
      providers: [{ provide: CheckListItemsService, useValue: mockCheckListItemsService }],
    }).compile();

    controller = module.get<CheckListItemsController>(CheckListItemsController);
    service = module.get<CheckListItemsService>(CheckListItemsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('calls service.create with dto and user extracted from req', async () => {
      const dto: CreateCheckListItemDto = { name: 'Handover Docs', departmentId: 'dept-uid-1' } as any;
      const expected = { id: 1, unique_id: 'item-uid-1', name: 'Handover Docs', department: 'dept-uid-1' };

      mockCheckListItemsService.create.mockResolvedValue(expected);

      const result = await controller.create(dto, mockRequest as any);

      expect(result).toEqual(expected);
      expect(service.create).toHaveBeenCalledWith(dto, mockUser);
    });
  });

  // ─── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('calls service.findAll with query and returns paginated result', async () => {
      const query: PaginationQueryDto = { page: 1, limit: 10 } as any;
      const expected = {
        data: [{ id: 1, name: 'Handover Docs', department: 'dept-uid-1' }],
        meta: { total: 1, page: 1, limit: 10, last_page: 1 },
      };

      mockCheckListItemsService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(query);

      expect(result).toEqual(expected);
      expect(service.findAll).toHaveBeenCalledWith(query);
    });
  });

  // ─── findByUniqueId ──────────────────────────────────────────────────────────

  describe('findByUniqueId', () => {
    it('calls service.findByUniqueId with uniqueId string and returns item', async () => {
      const expected = { id: 1, unique_id: 'item-uid-1', name: 'Handover Docs' };

      mockCheckListItemsService.findByUniqueId.mockResolvedValue(expected);

      const result = await controller.findByUniqueId('item-uid-1');

      expect(result).toEqual(expected);
      expect(service.findByUniqueId).toHaveBeenCalledWith('item-uid-1');
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('calls service.findOne with id string and returns item', async () => {
      const expected = { id: 1, unique_id: 'item-uid-1', name: 'Handover Docs' };

      mockCheckListItemsService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne('item-uid-1');

      expect(result).toEqual(expected);
      expect(service.findOne).toHaveBeenCalledWith('item-uid-1');
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('calls service.update with id string and dto, returns updated item', async () => {
      const dto: UpdateCheckListItemDto = { name: 'Updated Docs' } as any;
      const expected = { id: 1, unique_id: 'item-uid-1', name: 'Updated Docs' };

      mockCheckListItemsService.update.mockResolvedValue(expected);

      const result = await controller.update('item-uid-1', dto);

      expect(result).toEqual(expected);
      expect(service.update).toHaveBeenCalledWith('item-uid-1', dto);
    });
  });

  // ─── remove ──────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('calls service.remove with id string and returns confirmation', async () => {
      const expected = { message: 'Check list item item-uid-1 deleted successfully' };

      mockCheckListItemsService.remove.mockResolvedValue(expected);

      const result = await controller.remove('item-uid-1');

      expect(result).toEqual(expected);
      expect(service.remove).toHaveBeenCalledWith('item-uid-1');
    });
  });
});