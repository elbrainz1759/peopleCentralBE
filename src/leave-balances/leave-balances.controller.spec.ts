import { Test, TestingModule } from '@nestjs/testing';
import { LeaveBalancesController } from './leave-balances.controller';

describe('LeaveBalancesController', () => {
  let controller: LeaveBalancesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LeaveBalancesController],
    }).compile();

    controller = module.get<LeaveBalancesController>(LeaveBalancesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
