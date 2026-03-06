import { ExitController } from './exit.controller';

describe('ExitController', () => {
  let controller: ExitController;
  const mockService: any = { findAll: jest.fn() };

  beforeEach(() => {
    controller = new ExitController(mockService as any);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
