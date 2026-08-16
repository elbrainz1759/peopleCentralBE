import { DataTrackerScheduler } from './data-tracker.scheduler';

describe('DataTrackerScheduler', () => {
  let scheduler: DataTrackerScheduler;

  const mockService = {
    runDueNotifications: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    scheduler = new DataTrackerScheduler(mockService as never);
  });

  it('runs the due-notifications check', async () => {
    mockService.runDueNotifications.mockResolvedValue({
      triggered: 1,
      sent: 1,
      items: [],
    });

    await scheduler.handleDailyReminders();

    expect(mockService.runDueNotifications).toHaveBeenCalledWith();
  });

  it('does not throw when the run fails, so one bad run cannot crash the app', async () => {
    mockService.runDueNotifications.mockRejectedValue(new Error('DB down'));

    await expect(scheduler.handleDailyReminders()).resolves.toBeUndefined();
  });
});
