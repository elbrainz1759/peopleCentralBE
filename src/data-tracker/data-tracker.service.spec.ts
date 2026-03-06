import { Test, TestingModule } from '@nestjs/testing';
import { DataTrackerService } from './data-tracker.service';

describe('DataTrackerService', () => {
  let service: DataTrackerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DataTrackerService],
    }).compile();

    service = module.get<DataTrackerService>(DataTrackerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
