import { DataTrackerController } from './data-tracker.controller';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

describe('DataTrackerController', () => {
  let controller: DataTrackerController;

  const mockService: any = {
    create:               jest.fn(),
    findAll:              jest.fn(),
    findByUniqueId:       jest.fn(),
    update:               jest.fn(),
    remove:               jest.fn(),
    runDueNotifications:  jest.fn(),
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
    controller = new DataTrackerController(mockService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create proxies to service', async () => {
    mockService.create.mockResolvedValue('created');
    expect(await controller.create({} as any, mockReq as any)).toBe('created');
    expect(mockService.create).toHaveBeenCalledWith({}, mockUser);
  });

  it('findAll proxies to service', async () => {
    mockService.findAll.mockResolvedValue('list');
    expect(await controller.findAll({} as any)).toBe('list');
    expect(mockService.findAll).toHaveBeenCalledWith({});
  });

  it('findOne proxies to service', async () => {
    mockService.findByUniqueId.mockResolvedValue('one');
    expect(await controller.findOne('uid123')).toBe('one');
    expect(mockService.findByUniqueId).toHaveBeenCalledWith('uid123');
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

  it('triggerNotifications proxies to service (also driven by the daily @Cron job)', async () => {
    const result = { triggered: 2, sent: 2, items: [] };
    mockService.runDueNotifications.mockResolvedValue(result);
    expect(await controller.triggerNotifications()).toBe(result);
    expect(mockService.runDueNotifications).toHaveBeenCalledWith();
  });
});
