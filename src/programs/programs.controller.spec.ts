import { Test, TestingModule } from '@nestjs/testing';
import { ProgramsController } from './programs.controller';
import { ProgramsService } from './programs.service';
import {
  CreateProgramDto,
  UpdateProgramDto,
  PaginationQueryDto,
} from './dto/program.dto';

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
      controllers: [ProgramsController],
      providers: [
        {
          provide: ProgramsService,
          useValue: mockProgramsService,
        },
      ],
    }).compile();

    controller = module.get<ProgramsController>(ProgramsController);
    service = module.get<ProgramsService>(ProgramsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a program', async () => {
      const dto: CreateProgramDto = {
        name: 'BEGE',
        fundCode: 12345,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      } as any;

      const expectedResult = {
        id: 1,
        unique_id: 'program-uid-1',
        name: 'BEGE',
        fund_code: 12345,
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        created_by: mockUser.email,
      };

      mockProgramsService.create.mockResolvedValue(expectedResult);

      const result = await controller.create(dto, mockRequest as any);

      expect(result).toEqual(expectedResult);
      expect(service.create).toHaveBeenCalledWith(dto, mockUser);
    });
  });

  describe('findAll', () => {
    it('should return paginated programs', async () => {
      const query: PaginationQueryDto = {
        page: 1,
        limit: 10,
        search: 'BEGE',
      } as any;

      const expectedResult = {
        data: [
          {
            id: 1,
            name: 'BEGE',
            fund_code: 12345,
          },
        ],
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          last_page: 1,
        },
      };

      mockProgramsService.findAll.mockResolvedValue(expectedResult);

      const result = await controller.findAll(query);

      expect(result).toEqual(expectedResult);
      expect(service.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('findByUniqueId', () => {
    it('should return program by unique id', async () => {
      const expectedResult = {
        id: 1,
        unique_id: 'program-uid-1',
        name: 'BEGE',
      };

      mockProgramsService.findByUniqueId.mockResolvedValue(expectedResult);

      const result = await controller.findByUniqueId('program-uid-1');

      expect(result).toEqual(expectedResult);
      expect(service.findByUniqueId).toHaveBeenCalledWith('program-uid-1');
    });
  });

  describe('findOne', () => {
    it('should return one program', async () => {
      const expectedResult = {
        id: 1,
        unique_id: 'program-uid-1',
        name: 'BEGE',
      };

      mockProgramsService.findOne.mockResolvedValue(expectedResult);

      const result = await controller.findOne(1);

      expect(result).toEqual(expectedResult);
      expect(service.findOne).toHaveBeenCalledWith(1);
    });
  });

  describe('update', () => {
    it('should update a program', async () => {
      const dto: UpdateProgramDto = {
        name: 'Updated BEGE',
      } as any;

      const expectedResult = {
        id: 1,
        unique_id: 'program-uid-1',
        name: 'Updated BEGE',
      };

      mockProgramsService.update.mockResolvedValue(expectedResult);

      const result = await controller.update(1, dto);

      expect(result).toEqual(expectedResult);
      expect(service.update).toHaveBeenCalledWith(1, dto);
    });
  });

  describe('remove', () => {
    it('should delete a program', async () => {
      const expectedResult = {
        message: 'Program 1 deleted successfully',
      };

      mockProgramsService.remove.mockResolvedValue(expectedResult);

      const result = await controller.remove(1);

      expect(result).toEqual(expectedResult);
      expect(service.remove).toHaveBeenCalledWith(1);
    });
  });
});