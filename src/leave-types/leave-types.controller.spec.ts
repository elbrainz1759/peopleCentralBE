import { LeaveTypesController } from './leave-types.controller';

describe('LeaveTypesController', () => {
  let controller: LeaveTypesController;
  const mockService: any = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(() => {
    controller = new LeaveTypesController(mockService as any);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should pass through create', async () => {
    mockService.create.mockResolvedValue('ok');
    expect(await controller.create({} as any)).toBe('ok');
  });
});
