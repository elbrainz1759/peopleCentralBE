import { UsersController } from './users.controller';

describe('UsersController', () => {
  let controller: UsersController;
  const mockService: any = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(() => {
    controller = new UsersController(mockService as any);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findAll proxies to service', async () => {
    mockService.findAll.mockResolvedValue('list');
    expect(await controller.findAll()).toBe('list');
  });

  it('findOne proxies to service', async () => {
    mockService.findOne.mockResolvedValue('one');
    expect(await controller.findOne('uid')).toBe('one');
    expect(mockService.findOne).toHaveBeenCalledWith('uid');
  });

  it('update proxies to service', async () => {
    mockService.update.mockResolvedValue({ message: 'updated' });
    expect(await controller.update('uid', {} as any)).toEqual({ message: 'updated' });
    expect(mockService.update).toHaveBeenCalledWith('uid', {});
  });

  it('remove proxies to service', async () => {
    mockService.remove.mockResolvedValue({ message: 'deleted' });
    expect(await controller.remove('uid')).toEqual({ message: 'deleted' });
    expect(mockService.remove).toHaveBeenCalledWith('uid');
  });
});
