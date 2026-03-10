import { LeavesController } from './leaves.controller';

describe('LeavesController', () => {
  let controller: LeavesController;
  const mockService: any = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    review: jest.fn(),
    approve: jest.fn(),
    reject: jest.fn(),
  };

  beforeEach(() => {
    controller = new LeavesController(mockService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create proxies to service', async () => {
    mockService.create.mockResolvedValue('created');
    expect(await controller.create({} as any)).toBe('created');
    expect(mockService.create).toHaveBeenCalledWith({}, 'system');
  });

  it('findAll proxies to service', async () => {
    mockService.findAll.mockResolvedValue('list');
    expect(await controller.findAll({} as any)).toBe('list');
  });

  it('findOne proxies to service', async () => {
    mockService.findOne.mockResolvedValue('one');
    expect(await controller.findOne(1)).toBe('one');
    expect(mockService.findOne).toHaveBeenCalledWith(1);
  });

  it('review proxies to service', async () => {
    mockService.review.mockResolvedValue('reviewed');
    expect(await controller.review(1)).toBe('reviewed');
    expect(mockService.review).toHaveBeenCalledWith(1);
  });

  it('approve proxies to service', async () => {
    mockService.approve.mockResolvedValue('approved');
    expect(await controller.approve(1)).toBe('approved');
    expect(mockService.approve).toHaveBeenCalledWith(1, 'system');
  });

  it('reject proxies to service', async () => {
    mockService.reject.mockResolvedValue('rejected');
    expect(await controller.reject(1)).toBe('rejected');
    expect(mockService.reject).toHaveBeenCalledWith(1, 'system');
  });
});
