import { CheckListItemsController } from './check-list-items.controller';

describe('CheckListItemsController', () => {
  let controller: CheckListItemsController;
  const mockService: any = {};

  beforeEach(() => {
    controller = new CheckListItemsController(mockService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
