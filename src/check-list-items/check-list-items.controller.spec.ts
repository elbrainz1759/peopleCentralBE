import { Test, TestingModule } from '@nestjs/testing';
import { CheckListItemsController } from './check-list-items.controller';

describe('CheckListItemsController', () => {
  let controller: CheckListItemsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CheckListItemsController],
    }).compile();

    controller = module.get<CheckListItemsController>(CheckListItemsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
