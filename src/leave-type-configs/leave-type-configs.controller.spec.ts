import { LeaveTypeConfigsController } from './leave-type-configs.controller';

describe('LeaveTypeConfigsController', () => {
  let controller: LeaveTypeConfigsController;
  const mockService: any = {
    create: jest.fn(),
    findAll: jest.fn(),
    findByLeaveType: jest.fn(),
    findByCountry: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new LeaveTypeConfigsController(mockService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // -------------------------------------------------------------------------
  describe('create', () => {
    it('proxies dto to service and returns created config', async () => {
      const dto: any = { leaveTypeId: 1, country: 'Nigeria', annualHours: 200, monthlyAccrualHours: 10 };
      mockService.create.mockResolvedValue({ id: 1, ...dto });

      const result = await controller.create(dto);

      expect(mockService.create).toHaveBeenCalledWith(dto);
      expect(result).toMatchObject({ id: 1 });
    });
  });

  // -------------------------------------------------------------------------
  describe('findAll', () => {
    it('returns all configs from service', async () => {
      const rows = [{ id: 1 }, { id: 2 }];
      mockService.findAll.mockResolvedValue(rows);

      const result = await controller.findAll();

      expect(mockService.findAll).toHaveBeenCalledWith();
      expect(result).toEqual(rows);
    });
  });

  // -------------------------------------------------------------------------
  describe('findByLeaveType', () => {
    it('passes leaveTypeId as a string to service', async () => {
      const rows = [{ id: 1, leave_type_id: 3 }];
      mockService.findByLeaveType.mockResolvedValue(rows);

      // NestJS delivers route params as strings — no ParseIntPipe on this param
      const result = await controller.findByLeaveType('3');

      expect(mockService.findByLeaveType).toHaveBeenCalledWith('3');
      expect(result).toEqual(rows);
    });
  });

  // -------------------------------------------------------------------------
  describe('findByCountry', () => {
    it('passes country string to service', async () => {
      const rows = [{ id: 1, country: 'Nigeria' }];
      mockService.findByCountry.mockResolvedValue(rows);

      const result = await controller.findByCountry('Nigeria');

      expect(mockService.findByCountry).toHaveBeenCalledWith('Nigeria');
      expect(result).toEqual(rows);
    });
  });

  // -------------------------------------------------------------------------
  describe('findOne', () => {
    it('passes parsed id to service', async () => {
      const row = { id: 7, country: 'Kenya' };
      mockService.findOne.mockResolvedValue(row);

      const result = await controller.findOne(7);

      expect(mockService.findOne).toHaveBeenCalledWith(7);
      expect(result).toEqual(row);
    });
  });

  // -------------------------------------------------------------------------
  describe('update', () => {
    it('passes id and dto to service and returns updated config', async () => {
      const dto: any = { annualHours: 240 };
      const updated = { id: 1, annual_hours: 240 };
      mockService.update.mockResolvedValue(updated);

      const result = await controller.update(1, dto);

      expect(mockService.update).toHaveBeenCalledWith(1, dto);
      expect(result).toEqual(updated);
    });
  });

  // -------------------------------------------------------------------------
  describe('remove', () => {
    it('passes unique_id string to service and returns deletion confirmation', async () => {
      const uniqueId = 'a3f1c2e4b5d6e7f8a9b0c1d2e3f4a5b6';
      mockService.remove.mockResolvedValue({ deleted: true, unique_id: uniqueId });

      const result = await controller.remove(uniqueId);

      // Must be called with the raw string — no parseInt coercion
      expect(mockService.remove).toHaveBeenCalledWith(uniqueId);
      expect(result).toEqual({ deleted: true, unique_id: uniqueId });
    });
  });
});