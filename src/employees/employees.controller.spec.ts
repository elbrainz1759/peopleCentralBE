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

  it('create proxies to service', async () => {
    mockService.create.mockResolvedValue('created');
    expect(await controller.create({} as any)).toBe('created');
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

  it('findByUniqueId proxies to service', async () => {
    mockService.findByUniqueId.mockResolvedValue('one');
    expect(await controller.findByUniqueId('uid')).toBe('one');
    expect(mockService.findByUniqueId).toHaveBeenCalledWith('uid');
  });

  it('update proxies to service', async () => {
    mockService.update.mockResolvedValue('updated');
    expect(await controller.update('uid', {} as any)).toBe('updated');
    expect(mockService.update).toHaveBeenCalledWith('uid', {});
  });

  it('remove proxies to service', async () => {
    mockService.remove.mockResolvedValue({ message: 'deleted' });
    expect(await controller.remove('uid')).toEqual({ message: 'deleted' });
    expect(mockService.remove).toHaveBeenCalledWith('uid');
  });
});
