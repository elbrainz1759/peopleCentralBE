import { EmployeeController } from './employees.controller';

describe('EmployeeController', () => {
  let controller: EmployeeController;
  const mockService: any = { findAll: jest.fn(), create: jest.fn(), findOne: jest.fn(), findByUniqueId: jest.fn(), update: jest.fn(), remove: jest.fn() };

  beforeEach(() => {
    controller = new EmployeeController(mockService as any);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should proxy to service', async () => {
    mockService.findAll.mockResolvedValue('list');
    expect(await controller.findAll({} as any)).toBe('list');
  });
});
