import { DataTrackerService } from './data-tracker.service';

describe('DataTrackerService', () => {
  let service: DataTrackerService;
  const mockPool = {
    query: jest.fn(),
  } as { query: jest.Mock };

  beforeEach(() => {
    jest.resetAllMocks();
    service = new DataTrackerService(mockPool as never);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
