import { Test, TestingModule } from '@nestjs/testing';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

describe('LocationsController', () => {
  let controller: LocationsController;
  let service: LocationsService;

  const mockLocationsService = {
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
      controllers: [LocationsController],
      providers: [{ provide: LocationsService, useValue: mockLocationsService }],
    }).compile();

    controller = module.get<LocationsController>(LocationsController);
    service = module.get<LocationsService>(LocationsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('calls service.create with dto and user, returns result', async () => {
      const dto: CreateLocationDto = { name: 'Abuja', countryId: 'country-uid-1' } as any;
      const expected = { id: 1, unique_id: 'loc-uid-1', name: 'Abuja', country: 'Nigeria' };

      mockLocationsService.create.mockResolvedValue(expected);

      const result = await controller.create(dto, mockRequest as any);

      expect(result).toEqual(expected);
      expect(service.create).toHaveBeenCalledWith(dto, mockUser);
    });
  });

  // ─── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('calls service.findAll with query and returns paginated result', async () => {
      const query: PaginationQueryDto = { page: 1, limit: 10, search: 'Abuja' } as any;
      const expected = {
        data: [{ id: 1, name: 'Abuja', country: 'Nigeria' }],
        meta: { total: 1, page: 1, limit: 10, last_page: 1 },
      };

      mockLocationsService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(query);

      expect(result).toEqual(expected);
      expect(service.findAll).toHaveBeenCalledWith(query);
    });
  });

  // ─── findByUniqueId ──────────────────────────────────────────────────────────

  describe('findByUniqueId', () => {
    it('calls service.findByUniqueId with uniqueId and returns location', async () => {
      const expected = { id: 1, unique_id: 'loc-uid-1', name: 'Abuja', country: 'Nigeria' };

      mockLocationsService.findByUniqueId.mockResolvedValue(expected);

      const result = await controller.findByUniqueId('loc-uid-1');

      expect(result).toEqual(expected);
      expect(service.findByUniqueId).toHaveBeenCalledWith('loc-uid-1');
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('calls service.findOne with id string and returns location', async () => {
      const expected = { id: 1, unique_id: 'loc-uid-1', name: 'Abuja', country: 'Nigeria' };

      mockLocationsService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne('loc-uid-1');

      expect(result).toEqual(expected);
      expect(service.findOne).toHaveBeenCalledWith('loc-uid-1');
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('calls service.update with id string and dto, returns updated location', async () => {
      const dto: UpdateLocationDto = { name: 'Lagos' } as any;
      const expected = { id: 1, unique_id: 'loc-uid-1', name: 'Lagos', country: 'Nigeria' };

      mockLocationsService.update.mockResolvedValue(expected);

      const result = await controller.update('loc-uid-1', dto);

      expect(result).toEqual(expected);
      expect(service.update).toHaveBeenCalledWith('loc-uid-1', dto);
    });
  });

  // ─── remove ──────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('calls service.remove with id string and returns confirmation', async () => {
      const expected = { message: 'Location loc-uid-1 deleted successfully' };

      mockLocationsService.remove.mockResolvedValue(expected);

      const result = await controller.remove('loc-uid-1');

      expect(result).toEqual(expected);
      expect(service.remove).toHaveBeenCalledWith('loc-uid-1');
    });
  });
});