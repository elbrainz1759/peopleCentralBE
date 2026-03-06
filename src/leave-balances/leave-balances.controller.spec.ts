import { LeaveBalancesController } from './leave-balances.controller';

describe('LeaveBalancesController', () => {
  let controller: LeaveBalancesController;
  const mockService: any = {};

  beforeEach(() => {
    controller = new LeaveBalancesController(mockService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
