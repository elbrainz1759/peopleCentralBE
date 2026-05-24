import { DepartmentsController } from './departments.controller';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

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

  const mockUser: RequestUser = {
    id: 1,
    email: 'john@example.com',
    role: 'Admin',
    unique_id: 'abc123',
    first_name: 'John',
    last_name: 'Doe',
  };

  const mockReq = { user: mockUser };

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new DepartmentsController(mockService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('proxies to service with authenticated user', async () => {
      const dto: CreateDepartmentDto = { name: 'Engineering' };
      const created = { id: 1, name: 'Engineering', unique_id: 'uid1', created_by: 'john@example.com', created_at: new Date() };
      mockService.create.mockResolvedValue(created);

      const result = await controller.create(dto, mockReq as any);

      expect(mockService.create).toHaveBeenCalledWith(dto, mockUser);
      expect(result).toEqual(created);
    });
  });

  it('findAll proxies to service', async () => {
    mockService.findAll.mockResolvedValue('list');
    expect(await controller.findAll({} as any)).toBe('list');
  });

  it('findByUniqueId proxies to service', async () => {
    mockService.findByUniqueId.mockResolvedValue('one');
    expect(await controller.findByUniqueId('uid')).toBe('one');
    expect(mockService.findByUniqueId).toHaveBeenCalledWith('uid');
  });

  it('findOne proxies to service', async () => {
    mockService.findOne.mockResolvedValue('one');
    expect(await controller.findOne(1)).toBe('one');
    expect(mockService.findOne).toHaveBeenCalledWith(1);
  });

  it('update proxies to service', async () => {
    mockService.update.mockResolvedValue('updated');
    expect(await controller.update(1, {} as any)).toBe('updated');
    expect(mockService.update).toHaveBeenCalledWith(1, {});
  });

  it('remove proxies to service', async () => {
    mockService.remove.mockResolvedValue({ message: 'deleted' });
    expect(await controller.remove(1)).toEqual({ message: 'deleted' });
    expect(mockService.remove).toHaveBeenCalledWith(1);
  });
});