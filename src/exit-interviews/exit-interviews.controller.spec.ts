import { Test, TestingModule } from '@nestjs/testing';
import { ExitInterviewsController } from './exit-interviews.controller';

describe('ExitInterviewsController', () => {
  let controller: ExitInterviewsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExitInterviewsController],
    }).compile();

    controller = module.get<ExitInterviewsController>(ExitInterviewsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
