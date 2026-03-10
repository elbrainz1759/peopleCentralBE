import { ProgramsController } from './programs.controller';

describe('ProgramsController', () => {
  let controller: ProgramsController;
  const mockService: any = {
    create: jest.fn(),
    findAll: jest.fn(),
    findByUniqueId: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(() => {
    controller = new ProgramsController(mockService as any);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create proxies to service', async () => {
    const dto = { name: 'x' };
    mockService.create.mockResolvedValue('ok');
    expect(await controller.create(dto)).toBe('ok');
    expect(mockService.create).toHaveBeenCalledWith(dto);
  });

  it('findAll proxies to service', async () => {
    const query = { page: 2 };
    mockService.findAll.mockResolvedValue('list');
    expect(await controller.findAll(query)).toBe('list');
  });

  it('findByUniqueId proxies to service', async () => {
    mockService.findByUniqueId.mockResolvedValue('one');
    expect(await controller.findByUniqueId('uid')).toBe('one');
    expect(mockService.findByUniqueId).toHaveBeenCalledWith('uid');
  });

  it('findOne proxies to service', async () => {
    mockService.findOne.mockResolvedValue('one');
    expect(await controller.findOne(3)).toBe('one');
    expect(mockService.findOne).toHaveBeenCalledWith(3);
  });

  it('update proxies to service', async () => {
    mockService.update.mockResolvedValue('upd');
    expect(await controller.update(4, { name: 'x' } as any)).toBe('upd');
    expect(mockService.update).toHaveBeenCalledWith(4, { name: 'x' });
  });

  it('remove proxies to service', async () => {
    mockService.remove.mockResolvedValue('del');
    expect(await controller.remove(5)).toBe('del');
    expect(mockService.remove).toHaveBeenCalledWith(5);
  });
});
