import { LeavesController } from './leaves.controller';

describe('LeavesController', () => {
  let controller: LeavesController;
  const mockService: any = {};

  beforeEach(() => {
    controller = new LeavesController(mockService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
