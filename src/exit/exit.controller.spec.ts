import { Test, TestingModule } from '@nestjs/testing';
import { ExitController } from './exit.controller';

describe('ExitController', () => {
  let controller: ExitController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExitController],
    }).compile();

    controller = module.get<ExitController>(ExitController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
