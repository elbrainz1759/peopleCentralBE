import { Test, TestingModule } from '@nestjs/testing';
import { ExitService } from './exit.service';

describe('ExitService', () => {
  let service: ExitService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ExitService],
    }).compile();

    service = module.get<ExitService>(ExitService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
