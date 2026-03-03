import { Test, TestingModule } from '@nestjs/testing';
import { CheckListItemsService } from './check-list-items.service';

describe('CheckListItemsService', () => {
  let service: CheckListItemsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CheckListItemsService],
    }).compile();

    service = module.get<CheckListItemsService>(CheckListItemsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
