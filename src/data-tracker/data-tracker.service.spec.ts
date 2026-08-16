import { DataTrackerService } from './data-tracker.service';

describe('DataTrackerService', () => {
  let service: DataTrackerService;
  const mockPool = {
    query: jest.fn(),
  } as { query: jest.Mock };

  const mockMailService = {
    sendCaseNotification: jest.fn().mockResolvedValue(undefined),
    sendToMany: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    service = new DataTrackerService(mockPool as never, mockMailService as never);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('runDueNotifications', () => {
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

    it('sends each due reminder and marks it sent when every recipient succeeds', async () => {
      jest.spyOn(service, 'getDueNotifications').mockResolvedValue(due as any);
      const markSpy = jest
        .spyOn(service, 'markNotificationSent')
        .mockResolvedValue(undefined);
      mockMailService.sendToMany.mockResolvedValue({ succeeded: [], failed: [] });

      const result = await service.runDueNotifications();

      expect(result).toEqual({ triggered: 2, sent: 2, items: due });
      expect(markSpy).toHaveBeenCalledTimes(2);
      expect(markSpy).toHaveBeenCalledWith('uid1', 7);
      expect(markSpy).toHaveBeenCalledWith('uid2', 3);
      expect(mockMailService.sendToMany).toHaveBeenCalledWith(
        ['a@b.com', 'c@d.com'],
        expect.objectContaining({ subjectFull: 'Data Tracker Reminder' }),
      );
    });

    it('returns zero triggered when nothing is due', async () => {
      jest.spyOn(service, 'getDueNotifications').mockResolvedValue([]);
      const markSpy = jest.spyOn(service, 'markNotificationSent');

      const result = await service.runDueNotifications();

      expect(result).toEqual({ triggered: 0, sent: 0, items: [] });
      expect(markSpy).not.toHaveBeenCalled();
      expect(mockMailService.sendToMany).not.toHaveBeenCalled();
    });

    it('does not mark sent when some recipients fail, so it retries next run', async () => {
      jest
        .spyOn(service, 'getDueNotifications')
        .mockResolvedValue([due[0]] as any);
      const markSpy = jest.spyOn(service, 'markNotificationSent');
      mockMailService.sendToMany.mockResolvedValue({
        succeeded: ['a@b.com'],
        failed: ['c@d.com'],
      });

      const result = await service.runDueNotifications();

      expect(result).toEqual({ triggered: 1, sent: 0, items: [due[0]] });
      expect(markSpy).not.toHaveBeenCalled();
    });
  });
});
