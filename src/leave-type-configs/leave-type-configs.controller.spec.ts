import { LeaveTypeConfigsController } from './leave-type-configs.controller';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

describe('LeaveTypeConfigsController', () => {
  let controller: LeaveTypeConfigsController;

  const mockService: any = {
    create: jest.fn(),
    findAll: jest.fn(),
    findByLeaveType: jest.fn(),
    findByCountry: jest.fn(),
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
    controller = new LeaveTypeConfigsController(mockService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create proxies to service with user from request', async () => {
    mockService.create.mockResolvedValue('created');
    const dto = { leaveTypeId: 'lt1', country: 'NG', annualHours: 160 };
    const result = await controller.create(dto as any, mockReq as any);
    expect(mockService.create).toHaveBeenCalledWith(dto, mockUser);
    expect(result).toBe('created');
  });

  it('findAll proxies to service', async () => {
    mockService.findAll.mockResolvedValue([]);
    expect(await controller.findAll()).toEqual([]);
    expect(mockService.findAll).toHaveBeenCalled();
  });

  it('findByLeaveType proxies to service', async () => {
    mockService.findByLeaveType.mockResolvedValue([]);
    expect(await controller.findByLeaveType('lt1')).toEqual([]);
    expect(mockService.findByLeaveType).toHaveBeenCalledWith('lt1');
  });

  it('findByCountry proxies to service', async () => {
    mockService.findByCountry.mockResolvedValue([]);
    expect(await controller.findByCountry('NG')).toEqual([]);
    expect(mockService.findByCountry).toHaveBeenCalledWith('NG');
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

  it('remove proxies to service with string id', async () => {
    mockService.remove.mockResolvedValue({ deleted: true, id: 'uid123' });
    expect(await controller.remove('uid123')).toEqual({ deleted: true, id: 'uid123' });
    expect(mockService.remove).toHaveBeenCalledWith('uid123');
  });
});