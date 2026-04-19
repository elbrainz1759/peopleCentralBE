import { Test, TestingModule } from '@nestjs/testing';
import { LeaveTypeConfigsService } from './leave-type-configs.service';

describe('LeaveTypeConfigsService', () => {
  let service: LeaveTypeConfigsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LeaveTypeConfigsService],
    }).compile();

    service = module.get<LeaveTypeConfigsService>(LeaveTypeConfigsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
