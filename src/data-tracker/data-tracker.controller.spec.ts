import { DataTrackerController } from './data-tracker.controller';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

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

  describe('triggerNotifications', () => {
    it('triggers notifications and marks them sent', async () => {
      const due = [
        {
          unique_id: 'uid1',
          title: 'Report A',
          end_date: '2026-06-01',
          days_before: 7,
          recipient_emails: ['a@b.com', 'c@d.com'],
        },
        {
          unique_id: 'uid2',
          title: 'Report B',
          end_date: '2026-06-05',
          days_before: 3,
          recipient_emails: ['e@f.com'],
        },
      ];

      mockService.getDueNotifications.mockResolvedValue(due);
      mockService.markNotificationSent.mockResolvedValue(undefined);

      const result = await controller.triggerNotifications();

      expect(result.triggered).toBe(2);
      expect(result.items).toEqual(due);
      expect(mockService.markNotificationSent).toHaveBeenCalledTimes(2);
      expect(mockService.markNotificationSent).toHaveBeenCalledWith('uid1', 7);
      expect(mockService.markNotificationSent).toHaveBeenCalledWith('uid2', 3);
    });

    it('returns zero triggered when nothing is due', async () => {
      mockService.getDueNotifications.mockResolvedValue([]);
      const result = await controller.triggerNotifications();
      expect(result.triggered).toBe(0);
      expect(mockService.markNotificationSent).not.toHaveBeenCalled();
    });
  });
});