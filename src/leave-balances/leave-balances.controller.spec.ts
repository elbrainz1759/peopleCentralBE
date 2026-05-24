import { LeaveBalancesController } from './leave-balances.controller';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

describe('LeaveBalancesController', () => {
  let controller: LeaveBalancesController;

  const mockService: any = {
    bulkUpload: jest.fn(),
    monthlyAccrue: jest.fn(),
    rolloverYear: jest.fn(),
    findByStaff: jest.fn(),
    findTransactionsByStaff: jest.fn(),
  };

  const mockUser: RequestUser = {
    id: 1,
    email: 'hr@mercycorps.org',
    role: 'Admin',
    unique_id: 'abc123',
    first_name: 'HR',
    last_name: 'User',
  };

  const mockReq = { user: mockUser };

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new LeaveBalancesController(mockService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('bulkUpload proxies to service with user from request', async () => {
    mockService.bulkUpload.mockResolvedValue({ created: 5, skipped: 1 });
    const dto = { balances: [] };
    const result = await controller.bulkUpload(dto as any, mockReq as any);
    expect(mockService.bulkUpload).toHaveBeenCalledWith(dto, mockUser);
    expect(result).toEqual({ created: 5, skipped: 1 });
  });

  it('accrue proxies to service with user email', async () => {
    mockService.monthlyAccrue.mockResolvedValue({ accrued: 10, skipped: 0 });
    const dto = { leaveTypeId: 1 };
    const result = await controller.accrue(dto as any, mockReq as any);
    expect(mockService.monthlyAccrue).toHaveBeenCalledWith(1, 'hr@mercycorps.org');
    expect(result).toEqual({ accrued: 10, skipped: 0 });
  });

  it('accrue falls back to "System" when no user email', async () => {
    mockService.monthlyAccrue.mockResolvedValue({ accrued: 0, skipped: 0 });
    const reqNoEmail = { user: { ...mockUser, email: undefined } };
    await controller.accrue({ leaveTypeId: 1 } as any, reqNoEmail as any);
    expect(mockService.monthlyAccrue).toHaveBeenCalledWith(1, 'System');
  });

  it('rollover proxies to service with user email', async () => {
    mockService.rolloverYear.mockResolvedValue({ rolled: 3, skipped: 0 });
    const dto = { annualLeaveTypeId: 2 };
    const result = await controller.rollover(dto as any, mockReq as any);
    expect(mockService.rolloverYear).toHaveBeenCalledWith(2, 'hr@mercycorps.org');
    expect(result).toEqual({ rolled: 3, skipped: 0 });
  });

  it('findByStaff proxies to service', async () => {
    mockService.findByStaff.mockResolvedValue([]);
    expect(await controller.findByStaff(1)).toEqual([]);
    expect(mockService.findByStaff).toHaveBeenCalledWith(1);
  });

  it('findTransactionsByStaff proxies to service with defaults', async () => {
    mockService.findTransactionsByStaff.mockResolvedValue({ data: [], meta: {} });
    await controller.findTransactionsByStaff(1, 1, 20);
    expect(mockService.findTransactionsByStaff).toHaveBeenCalledWith(1, 1, 20);
  });

  it('findTransactionsByStaff converts string params to numbers', async () => {
    mockService.findTransactionsByStaff.mockResolvedValue({ data: [], meta: {} });
    await controller.findTransactionsByStaff(1, '2' as any, '10' as any);
    expect(mockService.findTransactionsByStaff).toHaveBeenCalledWith(1, 2, 10);
  });
});