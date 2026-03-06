import { Test, TestingModule } from '@nestjs/testing';
import { DataTrackerController } from './data-tracker.controller';

describe('DataTrackerController', () => {
  let controller: DataTrackerController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DataTrackerController],
    }).compile();

    controller = module.get<DataTrackerController>(DataTrackerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
