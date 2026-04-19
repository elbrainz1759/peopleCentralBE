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
      const dto: any = {
        leaveTypeId: 1,
        country: 'Nigeria',
        annualHours: 200,
        monthlyAccrualHours: 10,
      };
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
    it('passes parsed leaveTypeId to service', async () => {
      const rows = [{ id: 1, leave_type_id: 3 }];
      mockService.findByLeaveType.mockResolvedValue(rows);

      const result = await controller.findByLeaveType(3);

      expect(mockService.findByLeaveType).toHaveBeenCalledWith(3);
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
    it('passes id to service and returns deletion confirmation', async () => {
      mockService.remove.mockResolvedValue({ deleted: true, id: 4 });

      const result = await controller.remove(4);

      expect(mockService.remove).toHaveBeenCalledWith(4);
      expect(result).toEqual({ deleted: true, id: 4 });
    });
  });
});
