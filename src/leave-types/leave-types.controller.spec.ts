import { LeaveTypesController } from './leave-types.controller';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

describe('LeaveTypesController', () => {
  let controller: LeaveTypesController;

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
    email: 'hr@mercycorps.org',
    role: 'Admin',
    unique_id: 'abc123',
    first_name: 'HR',
    last_name: 'User',
  };

  const mockReq = { user: mockUser };

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new LeaveTypesController(mockService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create proxies to service with user from request', async () => {
    mockService.create.mockResolvedValue('created');
    const dto = { name: 'Annual Leave', description: 'Annual', country: 'NG' };
    const result = await controller.create(dto as any, mockReq as any);
    expect(mockService.create).toHaveBeenCalledWith(dto, mockUser);
    expect(result).toBe('created');
  });

  it('findAll proxies to service', async () => {
    mockService.findAll.mockResolvedValue('list');
    expect(await controller.findAll({} as any)).toBe('list');
    expect(mockService.findAll).toHaveBeenCalledWith({});
  });

  it('findByUniqueId proxies to service', async () => {
    mockService.findByUniqueId.mockResolvedValue('one');
    expect(await controller.findByUniqueId('uid123')).toBe('one');
    expect(mockService.findByUniqueId).toHaveBeenCalledWith('uid123');
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