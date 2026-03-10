import { ExitInterviewController } from './exit-interviews.controller';

describe('ExitInterviewsController', () => {
  let controller: ExitInterviewController;
  const mockService: any = {
    getDashboard: jest.fn(),
    create: jest.fn(),
    findAll: jest.fn(),
    findPendingByDepartment: jest.fn(),
    findByUniqueId: jest.fn(),
    findByStaffId: jest.fn(),
    findBySupervisorId: jest.fn(),
    getClearanceStatus: jest.fn(),
    findOne: jest.fn(),
    clearDepartment: jest.fn(),
    finalize: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(() => {
    controller = new ExitInterviewController(mockService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getDashboard proxies to service', async () => {
    mockService.getDashboard.mockResolvedValue({});
    expect(await controller.getDashboard()).toEqual({});
  });

  it('create proxies to service', async () => {
    mockService.create.mockResolvedValue('created');
    expect(await controller.create({} as any)).toBe('created');
  });

  it('findAll proxies to service', async () => {
    mockService.findAll.mockResolvedValue({ data: [] });
    expect(await controller.findAll({} as any)).toEqual({ data: [] });
  });

  it('findPendingByDepartment proxies to service', async () => {
    mockService.findPendingByDepartment.mockResolvedValue({ data: [] });
    expect(await controller.findPendingByDepartment('dept')).toEqual({ data: [] });
    expect(mockService.findPendingByDepartment).toHaveBeenCalledWith('dept');
  });

  it('findByUniqueId proxies to service', async () => {
    mockService.findByUniqueId.mockResolvedValue('one');
    expect(await controller.findByUniqueId('uid')).toBe('one');
    expect(mockService.findByUniqueId).toHaveBeenCalledWith('uid');
  });

  it('findByStaffId proxies to service', async () => {
    mockService.findByStaffId.mockResolvedValue([]);
    expect(await controller.findByStaffId(1)).toEqual([]);
    expect(mockService.findByStaffId).toHaveBeenCalledWith(1);
  });

  it('findBySupervisorId proxies to service', async () => {
    mockService.findBySupervisorId.mockResolvedValue([]);
    expect(await controller.findBySupervisorId('sid')).toEqual([]);
    expect(mockService.findBySupervisorId).toHaveBeenCalledWith('sid');
  });

  it('getClearanceStatus proxies to service', async () => {
    mockService.getClearanceStatus.mockResolvedValue({});
    expect(await controller.getClearanceStatus(1)).toEqual({});
    expect(mockService.getClearanceStatus).toHaveBeenCalledWith(1);
  });

  it('findOne proxies to service', async () => {
    mockService.findOne.mockResolvedValue('one');
    expect(await controller.findOne(1)).toBe('one');
    expect(mockService.findOne).toHaveBeenCalledWith(1);
  });

  it('clearDepartment proxies to service', async () => {
    mockService.clearDepartment.mockResolvedValue({});
    expect(await controller.clearDepartment(1, { department: 'd', checkListItemIds: [], notes: '' } as any)).toEqual({});
    expect(mockService.clearDepartment).toHaveBeenCalledWith(1, 'd', [], '');
  });

  it('finalize proxies to service', async () => {
    mockService.finalize.mockResolvedValue('finalized');
    expect(await controller.finalize('1')).toBe('finalized');
    expect(mockService.finalize).toHaveBeenCalledWith('1');
  });

  it('update proxies to service', async () => {
    mockService.update.mockResolvedValue('updated');
    expect(await controller.update(1, {} as any)).toBe('updated');
    expect(mockService.update).toHaveBeenCalledWith(1, {});
  });

  it('remove proxies to service', async () => {
    mockService.remove.mockResolvedValue({ message: 'deleted' });
    expect(await controller.remove('1')).toEqual({ message: 'deleted' });
    expect(mockService.remove).toHaveBeenCalledWith('1');
  });
});
