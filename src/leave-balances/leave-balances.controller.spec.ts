import { LeaveBalancesController } from './leave-balances.controller';

describe('LeaveBalancesController', () => {
  let controller: LeaveBalancesController;
  const mockService: any = {
    bulkUpload: jest.fn(),
    monthlyAccrue: jest.fn(),
    rolloverYear: jest.fn(),
    findByStaff: jest.fn(),
    findTransactionsByStaff: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new LeaveBalancesController(mockService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // -------------------------------------------------------------------------
  describe('bulkUpload', () => {
    it('proxies dto to service and returns result', async () => {
      mockService.bulkUpload.mockResolvedValue({ created: 2, skipped: 1 });
      const dto: any = { balances: [] };

      const result = await controller.bulkUpload(dto);

      expect(result).toEqual({ created: 2, skipped: 1 });
      expect(mockService.bulkUpload).toHaveBeenCalledWith(dto);
    });
  });

  // -------------------------------------------------------------------------
  describe('accrue', () => {
    it('extracts leaveTypeId and createdBy from dto and calls monthlyAccrue', async () => {
      mockService.monthlyAccrue.mockResolvedValue({ accrued: 5, skipped: 0 });
      const dto: any = { leaveTypeId: 1, createdBy: 'system-cron' };

      const result = await controller.accrue(dto);

      expect(result).toEqual({ accrued: 5, skipped: 0 });
      // Must pass the two scalar args — not the raw dto object
      expect(mockService.monthlyAccrue).toHaveBeenCalledWith(1, 'system-cron');
    });
  });

  // -------------------------------------------------------------------------
  describe('rollover', () => {
    it('extracts annualLeaveTypeId and createdBy from dto and calls rolloverYear', async () => {
      mockService.rolloverYear.mockResolvedValue({ rolled: 10, skipped: 2 });
      const dto: any = { annualLeaveTypeId: 1, createdBy: 'system-cron' };

      const result = await controller.rollover(dto);

      expect(result).toEqual({ rolled: 10, skipped: 2 });
      expect(mockService.rolloverYear).toHaveBeenCalledWith(1, 'system-cron');
    });
  });

  // -------------------------------------------------------------------------
  describe('findByStaff', () => {
    it('passes staffId to service and returns balances', async () => {
      mockService.findByStaff.mockResolvedValue([{ id: 1 }]);

      const result = await controller.findByStaff(7);

      expect(result).toEqual([{ id: 1 }]);
      expect(mockService.findByStaff).toHaveBeenCalledWith(7);
    });
  });

  // -------------------------------------------------------------------------
  describe('findTransactionsByStaff', () => {
    it('passes staffId, page, and limit to service', async () => {
      mockService.findTransactionsByStaff.mockResolvedValue({
        data: [],
        meta: { total: 0, page: 2, limit: 20, last_page: 0 },
      });

      const result = await controller.findTransactionsByStaff(3, 2, 20);

      expect(mockService.findTransactionsByStaff).toHaveBeenCalledWith(
        3,
        2,
        20,
      );
      expect(result.meta.page).toBe(2);
    });

    it('coerces query string numbers before passing to service', async () => {
      mockService.findTransactionsByStaff.mockResolvedValue({
        data: [],
        meta: {},
      });

      // Simulate NestJS passing query params as strings
      await controller.findTransactionsByStaff(1, '3' as any, '15' as any);

      expect(mockService.findTransactionsByStaff).toHaveBeenCalledWith(
        1,
        3,
        15,
      );
    });
  });
});
