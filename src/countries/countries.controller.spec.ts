import { Test, TestingModule } from '@nestjs/testing';
import { CountriesController } from './countries.controller';
import { CountriesService } from './countries.service';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

describe('CountriesController', () => {
  let controller: CountriesController;
  let service: CountriesService;

  const mockCountriesService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findByUniqueId: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const mockUser: RequestUser = {
    id: 1,
    email: 'test@mercycorps.org',
    role: 'Admin',
    unique_id: 'abc123',
    first_name: 'Test',
    last_name: 'User',
  };

  const mockRequest = { user: mockUser };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CountriesController],
      providers: [{ provide: CountriesService, useValue: mockCountriesService }],
    }).compile();

    controller = module.get<CountriesController>(CountriesController);
    service = module.get<CountriesService>(CountriesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('calls service.create with dto and user extracted from req', async () => {
      const dto: CreateCountryDto = { name: 'Nigeria' } as any;
      const expected = { id: 1, unique_id: 'uid-1', name: 'Nigeria' };

      mockCountriesService.create.mockResolvedValue(expected);

      const result = await controller.create(dto, mockRequest as any);

      expect(result).toEqual(expected);
      expect(service.create).toHaveBeenCalledWith(dto, mockUser);
    });
  });

  // ─── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('calls service.findAll with query and returns paginated result', async () => {
      const query: PaginationQueryDto = { page: 1, limit: 10, search: 'Nigeria' } as any;
      const expected = {
        data: [{ id: 1, name: 'Nigeria' }],
        meta: { total: 1, page: 1, limit: 10, last_page: 1 },
      };

      mockCountriesService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(query);

      expect(result).toEqual(expected);
      expect(service.findAll).toHaveBeenCalledWith(query);
    });
  });

  // ─── findByUniqueId ──────────────────────────────────────────────────────────

  describe('findByUniqueId', () => {
    it('calls service.findByUniqueId with uniqueId string and returns country', async () => {
      const expected = { id: 1, unique_id: 'uid-1', name: 'Nigeria' };

      mockCountriesService.findByUniqueId.mockResolvedValue(expected);

      const result = await controller.findByUniqueId('uid-1');

      expect(result).toEqual(expected);
      expect(service.findByUniqueId).toHaveBeenCalledWith('uid-1');
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('calls service.findOne with id string and returns country', async () => {
      const expected = { id: 1, unique_id: 'uid-1', name: 'Nigeria' };

      mockCountriesService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne('uid-1');

      expect(result).toEqual(expected);
      expect(service.findOne).toHaveBeenCalledWith('uid-1');
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('calls service.update with id string and dto, returns updated country', async () => {
      const dto: UpdateCountryDto = { name: 'Updated Nigeria' } as any;
      const expected = { id: 1, unique_id: 'uid-1', name: 'Updated Nigeria' };

      mockCountriesService.update.mockResolvedValue(expected);

      const result = await controller.update('uid-1', dto);

      expect(result).toEqual(expected);
      expect(service.update).toHaveBeenCalledWith('uid-1', dto);
    });
  });

  // ─── remove ──────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('calls service.remove with id string and returns confirmation', async () => {
      const expected = { message: 'Country uid-1 deleted successfully' };

      mockCountriesService.remove.mockResolvedValue(expected);

      const result = await controller.remove('uid-1');

      expect(result).toEqual(expected);
      expect(service.remove).toHaveBeenCalledWith('uid-1');
    });
  });
});