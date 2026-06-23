import { LeaveBalancesController } from './leave-balances.controller';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

describe('LeaveBalancesController', () => {
  let controller: LeaveBalancesController;

  const mockService: any = {
    bulkUpload:              jest.fn(),
    monthlyAccrue:           jest.fn(),
    rolloverYear:            jest.fn(),
    findAll:                 jest.fn(),
    findByStaff:             jest.fn(),
    findTransactionsByStaff: jest.fn(),
    findAccrualLog:          jest.fn(),
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

  // ── bulkUpload ───────────────────────────────────────────────────────────────

  it('bulkUpload proxies to service with user from request', async () => {
    mockService.bulkUpload.mockResolvedValue({ created: 5, skipped: 1, zeroed: 0 });
    const dto = { balances: [] };
    const result = await controller.bulkUpload(dto as any, mockReq as any);
    expect(mockService.bulkUpload).toHaveBeenCalledWith(dto, mockUser);
    expect(result).toEqual({ created: 5, skipped: 1, zeroed: 0 });
  });

  // ── accrue ───────────────────────────────────────────────────────────────────

  it('accrue proxies to service with user email', async () => {
    mockService.monthlyAccrue.mockResolvedValue({ accrued: 10, skipped: 0 });
    const dto = { leaveTypeId: 'lt1' };
    const result = await controller.accrue(dto as any, mockReq as any);
    expect(mockService.monthlyAccrue).toHaveBeenCalledWith('lt1', 'hr@mercycorps.org');
    expect(result).toEqual({ accrued: 10, skipped: 0 });
  });

  it('accrue falls back to "System" when no user email', async () => {
    mockService.monthlyAccrue.mockResolvedValue({ accrued: 0, skipped: 0 });
    const reqNoEmail = { user: { ...mockUser, email: undefined } };
    await controller.accrue({ leaveTypeId: 'lt1' } as any, reqNoEmail as any);
    expect(mockService.monthlyAccrue).toHaveBeenCalledWith('lt1', 'System');
  });

  // ── rollover ─────────────────────────────────────────────────────────────────

  it('rollover proxies to service with user email', async () => {
    mockService.rolloverYear.mockResolvedValue({ rolled: 3, skipped: 0 });
    const dto = { annualLeaveTypeId: 'lt-annual' };
    const result = await controller.rollover(dto as any, mockReq as any);
    expect(mockService.rolloverYear).toHaveBeenCalledWith('lt-annual', 'hr@mercycorps.org');
    expect(result).toEqual({ rolled: 3, skipped: 0 });
  });

  // ── findAll ──────────────────────────────────────────────────────────────────

  it('findAll proxies to service with default page and limit', async () => {
    const mockResult = { data: [], meta: { total: 0, page: 1, limit: 20, last_page: 0 } };
    mockService.findAll.mockResolvedValue(mockResult);
    const result = await controller.findAll(1, 20, undefined, undefined);
    expect(mockService.findAll).toHaveBeenCalledWith(1, 20, undefined, undefined);
    expect(result).toEqual(mockResult);
  });

  it('findAll converts string page and limit to numbers', async () => {
    mockService.findAll.mockResolvedValue({ data: [], meta: {} });
    await controller.findAll('2' as any, '10' as any, undefined, undefined);
    expect(mockService.findAll).toHaveBeenCalledWith(2, 10, undefined, undefined);
  });

  it('findAll passes year and search filters to service', async () => {
    mockService.findAll.mockResolvedValue({ data: [], meta: {} });
    await controller.findAll(1, 20, '2025' as any, 'john');
    expect(mockService.findAll).toHaveBeenCalledWith(1, 20, 2025, 'john');
  });

  it('findAll returns paginated staff balance summaries', async () => {
    const mockResult = {
      data: [
        {
          staff_id: '100132',
          full_name: 'Doe, John',
          designation: 'Officer',
          department_name: 'Programs',
          location_name: 'Abuja',
          program_name: 'NE',
          balances: [
            { leave_type_id: 'lt1', leave_type_name: 'Annual Leave', total_hours: 59.65, used_hours: 0, remaining_hours: 59.65 },
            { leave_type_id: 'lt2', leave_type_name: 'Sick Leave',   total_hours: 98,    used_hours: 0, remaining_hours: 98 },
          ],
        },
      ],
      meta: { total: 1, page: 1, limit: 20, last_page: 1 },
    };
    mockService.findAll.mockResolvedValue(mockResult);
    const result = await controller.findAll(1, 20, undefined, undefined);
    expect(result.data[0].balances).toHaveLength(2);
    expect(result.meta.total).toBe(1);
  });

  // ── findByStaff ──────────────────────────────────────────────────────────────

  it('findByStaff proxies to service', async () => {
    mockService.findByStaff.mockResolvedValue([]);
    expect(await controller.findByStaff(1)).toEqual([]);
    expect(mockService.findByStaff).toHaveBeenCalledWith(1);
  });

  // ── findTransactionsByStaff ──────────────────────────────────────────────────

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

  // ── findAccrualLog ───────────────────────────────────────────────────────────

  it('findAccrualLog proxies to service with no filters', async () => {
    mockService.findAccrualLog.mockResolvedValue([]);
    const result = await controller.findAccrualLog(undefined, undefined);
    expect(mockService.findAccrualLog).toHaveBeenCalledWith(undefined, undefined);
    expect(result).toEqual([]);
  });

  it('findAccrualLog passes leaveTypeId filter to service', async () => {
    mockService.findAccrualLog.mockResolvedValue([]);
    await controller.findAccrualLog('lt1', undefined);
    expect(mockService.findAccrualLog).toHaveBeenCalledWith('lt1', undefined);
  });

  it('findAccrualLog converts string year to number', async () => {
    mockService.findAccrualLog.mockResolvedValue([]);
    await controller.findAccrualLog(undefined, '2026' as any);
    expect(mockService.findAccrualLog).toHaveBeenCalledWith(undefined, 2026);
  });
});