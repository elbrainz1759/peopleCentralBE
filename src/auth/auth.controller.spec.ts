import { AuthController } from './auth.controller';

describe('AuthController', () => {
  let controller: AuthController;
  const mockAuthService: any = {};

  beforeEach(() => {
    controller = new AuthController(mockAuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
