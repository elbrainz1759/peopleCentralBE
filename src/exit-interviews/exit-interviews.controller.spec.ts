import { ExitInterviewController } from './exit-interviews.controller';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

describe('ExitInterviewController', () => {
  let controller: ExitInterviewController;

  const mockService: any = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    findByUniqueId: jest.fn(),
    findByStaffId: jest.fn(),
    findBySupervisorId: jest.fn(),
    findPendingByDepartment: jest.fn(),
    getClearanceStatus: jest.fn(),
    clearDepartment: jest.fn(),
    finalize: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getDashboard: jest.fn(),
  };

  const mockUser: RequestUser = {
    id: 1,
    email: 'test@mercycorps.org',
    role: 'Admin',
    unique_id: 'abc123',
    first_name: 'Test',
    last_name: 'User',
  };

  const mockReq = { user: mockUser };

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new ExitInterviewController(mockService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getDashboard proxies to service', async () => {
    mockService.getDashboard.mockResolvedValue({ total: 10 });
    expect(await controller.getDashboard()).toEqual({ total: 10 });
  });

  it('create proxies to service with user from request', async () => {
    mockService.create.mockResolvedValue('created');
    const result = await controller.create({} as any, mockReq as any);
    expect(mockService.create).toHaveBeenCalledWith({}, mockUser);
    expect(result).toBe('created');
  });

  it('findAll proxies to service', async () => {
    mockService.findAll.mockResolvedValue('list');
    expect(await controller.findAll({} as any)).toBe('list');
    expect(mockService.findAll).toHaveBeenCalledWith({});
  });

  it('findPendingByDepartment proxies to service', async () => {
    mockService.findPendingByDepartment.mockResolvedValue('pending');
    expect(await controller.findPendingByDepartment('Operations')).toBe('pending');
    expect(mockService.findPendingByDepartment).toHaveBeenCalledWith('Operations');
  });

  it('findByUniqueId proxies to service', async () => {
    mockService.findByUniqueId.mockResolvedValue('one');
    expect(await controller.findByUniqueId('uid123')).toBe('one');
    expect(mockService.findByUniqueId).toHaveBeenCalledWith('uid123');
  });

  it('findByStaffId proxies to service', async () => {
    mockService.findByStaffId.mockResolvedValue([]);
    expect(await controller.findByStaffId(1)).toEqual([]);
    expect(mockService.findByStaffId).toHaveBeenCalledWith(1);
  });

  it('findBySupervisorId proxies to service', async () => {
    mockService.findBySupervisorId.mockResolvedValue([]);
    expect(await controller.findBySupervisorId('sup123')).toEqual([]);
    expect(mockService.findBySupervisorId).toHaveBeenCalledWith('sup123');
  });

  it('getClearanceStatus proxies to service', async () => {
    mockService.getClearanceStatus.mockResolvedValue('status');
    expect(await controller.getClearanceStatus('uid123')).toBe('status');
    expect(mockService.getClearanceStatus).toHaveBeenCalledWith('uid123');
  });

  it('findOne proxies to service', async () => {
    mockService.findOne.mockResolvedValue('one');
    expect(await controller.findOne('uid123')).toBe('one');
    expect(mockService.findOne).toHaveBeenCalledWith('uid123');
  });

  it('clearDepartment proxies to service', async () => {
    const dto = { department: 'Operations' as const, checkListItemIds: [1, 2], notes: 'All clear' };
    mockService.clearDepartment.mockResolvedValue('cleared');
    const result = await controller.clearDepartment('uid123', dto);
    expect(mockService.clearDepartment).toHaveBeenCalledWith('uid123', 'Operations', [1, 2], 'All clear');
    expect(result).toBe('cleared');
  });

  it('finalize proxies to service', async () => {
    mockService.finalize.mockResolvedValue('finalized');
    expect(await controller.finalize('uid123')).toBe('finalized');
    expect(mockService.finalize).toHaveBeenCalledWith('uid123');
  });

  it('update proxies to service', async () => {
    mockService.update.mockResolvedValue('updated');
    expect(await controller.update('uid123', {} as any)).toBe('updated');
    expect(mockService.update).toHaveBeenCalledWith('uid123', {});
  });

  it('remove proxies to service', async () => {
    mockService.remove.mockResolvedValue({ message: 'deleted' });
    expect(await controller.remove('uid123')).toEqual({ message: 'deleted' });
    expect(mockService.remove).toHaveBeenCalledWith('uid123');
  });
});