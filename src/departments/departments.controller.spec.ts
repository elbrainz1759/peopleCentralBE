import { DepartmentsController } from './departments.controller';

describe('DepartmentsController', () => {
  let controller: DepartmentsController;
  const mockService: any = { findAll: jest.fn() };

  beforeEach(() => {
    controller = new DepartmentsController(mockService as any);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates findAll', async () => {
    mockService.findAll.mockResolvedValue('ok');
    expect(await controller.findAll({} as any)).toBe('ok');
  });
});
