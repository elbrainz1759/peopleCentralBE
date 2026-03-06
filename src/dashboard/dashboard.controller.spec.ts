import { DashboardController } from './dashboard.controller';

describe('DashboardController', () => {
  let controller: DashboardController;

  beforeEach(() => {
    controller = new DashboardController();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
