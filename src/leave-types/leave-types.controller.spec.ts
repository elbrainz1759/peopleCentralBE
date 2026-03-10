import { LeaveTypesController } from './leave-types.controller';

describe('LeaveTypesController', () => {
  let controller: LeaveTypesController;
  const mockService: any = {
    create: jest.fn(),
    findAll: jest.fn(),
    findByUniqueId: jest.fn(),
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

  it('create proxies to service', async () => {
    mockService.create.mockResolvedValue('ok');
    expect(await controller.create({} as any)).toBe('ok');
  });

  it('findAll proxies to service', async () => {
    mockService.findAll.mockResolvedValue('list');
    expect(await controller.findAll({} as any)).toBe('list');
  });

  it('findByUniqueId proxies to service', async () => {
    mockService.findByUniqueId.mockResolvedValue('one');
    expect(await controller.findByUniqueId('uid')).toBe('one');
    expect(mockService.findByUniqueId).toHaveBeenCalledWith('uid');
  });

  it('findOne proxies to service', async () => {
    mockService.findOne.mockResolvedValue('one');
    expect(await controller.findOne(1)).toBe('one');
    expect(mockService.findOne).toHaveBeenCalledWith(1);
  });

  it('update proxies to service', async () => {
    mockService.update.mockResolvedValue('updated');
    expect(await controller.update(1, {} as any)).toBe('updated');
    expect(mockService.update).toHaveBeenCalledWith(1, {});
  });

  it('remove proxies to service', async () => {
    mockService.remove.mockResolvedValue({ message: 'deleted' });
    expect(await controller.remove(1)).toEqual({ message: 'deleted' });
    expect(mockService.remove).toHaveBeenCalledWith(1);
  });
});
