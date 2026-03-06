import { LocationsController } from './locations.controller';

describe('LocationsController', () => {
  let controller: LocationsController;
  const mockService: any = { findAll: jest.fn() };

  beforeEach(() => {
    controller = new LocationsController(mockService as any);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call service', async () => {
    mockService.findAll.mockResolvedValue('data');
    expect(await controller.findAll({} as any)).toBe('data');
  });
});
