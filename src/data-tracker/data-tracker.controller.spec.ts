import { DataTrackerController } from './data-tracker.controller';

describe('DataTrackerController', () => {
  let controller: DataTrackerController;
  const mockService: any = {
    create: jest.fn(),
    findAll: jest.fn(),
    findByUniqueId: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getDueNotifications: jest.fn(),
    markNotificationSent: jest.fn(),
  };

  beforeEach(() => {
    controller = new DataTrackerController(mockService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create proxies to service', async () => {
    mockService.create.mockResolvedValue('created');
    expect(await controller.create({} as any)).toBe('created');
  });

  it('findAll proxies to service', async () => {
    mockService.findAll.mockResolvedValue('list');
    expect(await controller.findAll({} as any)).toBe('list');
  });

  it('findOne proxies to service', async () => {
    mockService.findByUniqueId.mockResolvedValue('one');
    expect(await controller.findOne('uid')).toBe('one');
    expect(mockService.findByUniqueId).toHaveBeenCalledWith('uid');
  });

  it('update proxies to service', async () => {
    mockService.update.mockResolvedValue('updated');
    expect(await controller.update('uid', {} as any)).toBe('updated');
    expect(mockService.update).toHaveBeenCalledWith('uid', {});
  });

  it('remove proxies to service', async () => {
    mockService.remove.mockResolvedValue({ message: 'deleted' });
    expect(await controller.remove('uid')).toEqual({ message: 'deleted' });
    expect(mockService.remove).toHaveBeenCalledWith('uid');
  });

  it('triggerNotifications calls service and returns result', async () => {
    const due = [{ unique_id: 'u1', days_before: 7, recipient_emails: ['a@b.com'], title: 't' }];
    mockService.getDueNotifications.mockResolvedValue(due);
    mockService.markNotificationSent.mockResolvedValue(undefined);
    const result = await controller.triggerNotifications();
    expect(result).toEqual({ triggered: 1, items: due });
    expect(mockService.getDueNotifications).toHaveBeenCalled();
  });
});
