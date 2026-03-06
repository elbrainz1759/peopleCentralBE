import { Test, TestingModule } from '@nestjs/testing';
import { ExitInterviewsService } from './exit-interviews.service';

describe('ExitInterviewsService', () => {
  let service: ExitInterviewsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ExitInterviewsService],
    }).compile();

    service = module.get<ExitInterviewsService>(ExitInterviewsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
