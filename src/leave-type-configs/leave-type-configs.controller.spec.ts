import { Test, TestingModule } from '@nestjs/testing';
import { LeaveTypeConfigsController } from './leave-type-configs.controller';

describe('LeaveTypeConfigsController', () => {
  let controller: LeaveTypeConfigsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LeaveTypeConfigsController],
    }).compile();

    controller = module.get<LeaveTypeConfigsController>(LeaveTypeConfigsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
