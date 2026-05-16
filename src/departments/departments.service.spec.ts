import {
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { DepartmentsController } from './departments.controller';

describe('DepartmentsController', () => {
  let controller: DepartmentsController;
  const mockService: any = {
    create: jest.fn(),
    findAll: jest.fn(),
    findByUniqueId: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  // Minimal mock request helper — pass a user email or leave undefined
  const mockReq = (email?: string) =>
    ({ user: email ? { email } : undefined } as any);

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new DepartmentsController(mockService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // -------------------------------------------------------------------------
  describe('create', () => {
    it('proxies to service with authenticated user email as createdBy', async () => {
      const dto: any = { name: 'Engineering' };
      const created = { id: 1, name: 'Engineering', created_by: 'john@example.com' };
      mockService.create.mockResolvedValue(created);

      const result = await controller.create(dto, mockReq('john@example.com'));

      expect(mockService.create).toHaveBeenCalledWith(dto, 'john@example.com');
      expect(result).toEqual(created);
    });

    it('falls back to "System" when no user on request', async () => {
      const dto: any = { name: 'HR' };
      const created = { id: 2, name: 'HR', created_by: 'System' };
      mockService.create.mockResolvedValue(created);

      const result = await controller.create(dto, mockReq());

      expect(mockService.create).toHaveBeenCalledWith(dto, 'System');
      expect(result).toEqual(created);
    });
  });

  // -------------------------------------------------------------------------
  describe('findAll', () => {
    it('returns paginated result from service', async () => {
      const response = {
        data: [{ id: 1, name: 'Engineering' }],
        meta: { total: 1, page: 1, limit: 10, last_page: 1 },
      };
      mockService.findAll.mockResolvedValue(response);

      const result = await controller.findAll({ page: 1, limit: 10 });

      expect(mockService.findAll).toHaveBeenCalledWith({ page: 1, limit: 10 });
      expect(result).toEqual(response);
    });

    it('passes search query to service', async () => {
      const response = {
        data: [{ id: 1, name: 'Engineering' }],
        meta: { total: 1, page: 1, limit: 10, last_page: 1 },
      };
      mockService.findAll.mockResolvedValue(response);

      await controller.findAll({ page: 1, limit: 10, search: 'Eng' });

      expect(mockService.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        search: 'Eng',
      });
    });
  });

  // -------------------------------------------------------------------------
  describe('findByUniqueId', () => {
    it('passes uniqueId to service and returns department', async () => {
      const dept = { id: 1, unique_id: 'abc123', name: 'Engineering' };
      mockService.findByUniqueId.mockResolvedValue(dept);

      const result = await controller.findByUniqueId('abc123');

      expect(mockService.findByUniqueId).toHaveBeenCalledWith('abc123');
      expect(result).toEqual(dept);
    });

    it('propagates NotFoundException from service', async () => {
      mockService.findByUniqueId.mockRejectedValue(
        new NotFoundException('Department with unique_id "bad" not found'),
      );

      await expect(controller.findByUniqueId('bad')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------------
  describe('findOne', () => {
    it('passes parsed id to service and returns department', async () => {
      const dept = { id: 7, name: 'Finance' };
      mockService.findOne.mockResolvedValue(dept);

      const result = await controller.findOne(7);

      expect(mockService.findOne).toHaveBeenCalledWith(7);
      expect(result).toEqual(dept);
    });

    it('propagates NotFoundException from service', async () => {
      mockService.findOne.mockRejectedValue(
        new NotFoundException('Department with id 999 not found'),
      );

      await expect(controller.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  describe('update', () => {
    it('passes id and dto to service and returns updated department', async () => {
      const dto: any = { name: 'Ops' };
      const updated = { id: 1, name: 'Ops' };
      mockService.update.mockResolvedValue(updated);

      const result = await controller.update(1, dto);

      expect(mockService.update).toHaveBeenCalledWith(1, dto);
      expect(result).toEqual(updated);
    });

    it('propagates NotFoundException from service', async () => {
      mockService.update.mockRejectedValue(
        new NotFoundException('Department with id 999 not found'),
      );

      await expect(controller.update(999, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('propagates ConflictException from service', async () => {
      mockService.update.mockRejectedValue(
        new ConflictException('Department with name "Ops" already exists'),
      );

      await expect(controller.update(1, { name: 'Ops' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // -------------------------------------------------------------------------
  describe('remove', () => {
    it('passes id to service and returns success message', async () => {
      mockService.remove.mockResolvedValue({
        message: 'Department 1 deleted successfully',
      });

      const result = await controller.remove(1);

      expect(mockService.remove).toHaveBeenCalledWith(1);
      expect(result).toEqual({ message: 'Department 1 deleted successfully' });
    });

    it('propagates NotFoundException from service', async () => {
      mockService.remove.mockRejectedValue(
        new NotFoundException('Department with id 999 not found'),
      );

      await expect(controller.remove(999)).rejects.toThrow(NotFoundException);
    });

    it('propagates InternalServerErrorException from service', async () => {
      mockService.remove.mockRejectedValue(
        new InternalServerErrorException('db error'),
      );

      await expect(controller.remove(1)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});