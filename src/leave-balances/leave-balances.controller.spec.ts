import { LeaveBalancesController } from './leave-balances.controller';

describe('LeaveBalancesController', () => {
  let controller: LeaveBalancesController;
  const mockService: any = {
    bulkUpload: jest.fn(),
    monthlyAccrue: jest.fn(),
    findByStaff: jest.fn(),
    findTransactionsByStaff: jest.fn(),
  };

  beforeEach(() => {
    controller = new LeaveBalancesController(mockService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('bulkUpload proxies to service', async () => {
    mockService.bulkUpload.mockResolvedValue('ok');
    expect(await controller.bulkUpload({} as any)).toBe('ok');
  });

  it('accrue proxies to service', async () => {
    mockService.monthlyAccrue.mockResolvedValue('ok');
    expect(await controller.accrue({} as any)).toBe('ok');
  });

  it('findByStaff proxies to service', async () => {
    mockService.findByStaff.mockResolvedValue('balances');
    expect(await controller.findByStaff(1)).toBe('balances');
    expect(mockService.findByStaff).toHaveBeenCalledWith(1);
  });

  it('findTransactionsByStaff proxies to service', async () => {
    mockService.findTransactionsByStaff.mockResolvedValue('txns');
    expect(await controller.findTransactionsByStaff(1, 1, 20)).toBe('txns');
    expect(mockService.findTransactionsByStaff).toHaveBeenCalledWith(1, 1, 20);
  });
});
