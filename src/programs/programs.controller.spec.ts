import { ProgramsController } from './programs.controller';
import { ProgramsService } from './programs.service';

describe('ProgramsController', () => {
  let controller: ProgramsController;
  const mockService: any = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    controller = new ProgramsController(mockService as any);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates create', async () => {
    const dto = { name: 'x' };
    mockService.create.mockResolvedValue('ok');
    expect(await controller.create(dto)).toBe('ok');
    expect(mockService.create).toHaveBeenCalledWith(dto);
  });

  it('delegates list', async () => {
    const query = { page: 2 };
    mockService.findAll.mockResolvedValue('list');
    expect(await controller.findAll(query)).toBe('list');
  });

  it('delegates get by id', async () => {
    mockService.findOne.mockResolvedValue('one');
    expect(await controller.findOne(3)).toBe('one');
    expect(mockService.findOne).toHaveBeenCalledWith(3);
  });

  it('delegates update', async () => {
    mockService.update.mockResolvedValue('upd');
    expect(await controller.update('4', {name:'x'})).toBe('upd');
  });

  it('delegates remove', async () => {
    mockService.remove.mockResolvedValue('del');
    expect(await controller.remove('5')).toBe('del');
  });
});
