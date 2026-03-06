import { ExitInterviewController } from './exit-interviews.controller';

describe('ExitInterviewsController', () => {
  let controller: ExitInterviewController;
  const mockService = {} as never;

  beforeEach(() => {
    controller = new ExitInterviewController(mockService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
