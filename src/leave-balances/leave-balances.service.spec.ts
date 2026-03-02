import { Test, TestingModule } from '@nestjs/testing';
import { LeaveBalancesService } from './leave-balances.service';

describe('LeaveBalancesService', () => {
  let service: LeaveBalancesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LeaveBalancesService],
    }).compile();

    service = module.get<LeaveBalancesService>(LeaveBalancesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
