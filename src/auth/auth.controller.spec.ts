import { AuthController } from './auth.controller';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService: any = {
    register: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    requestReset: jest.fn(),
    resetPassword: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AuthController(mockAuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('register proxies to service', async () => {
    mockAuthService.register.mockResolvedValue({ message: 'registered' });

    expect(
      await controller.register({
        email: 'a@b.com',
        password: 'x',
        role: 'User',
      } as any),
    ).toEqual({ message: 'registered' });

    expect(mockAuthService.register).toHaveBeenCalledWith(
      'a@b.com',
      'x',
      'User',
    );
  });

  it('login proxies to service', async () => {
    mockAuthService.login.mockResolvedValue({ accessToken: 't' });

    expect(
      await controller.login(
        { email: 'a@b.com', password: 'x' } as any,
        { userAgent: null, ip: null },
      ),
    ).toEqual({ accessToken: 't' });

    expect(mockAuthService.login).toHaveBeenCalledWith('a@b.com', 'x', {
      userAgent: null,
      ip: null,
    });
  });

  it('refresh proxies to service', async () => {
    mockAuthService.refresh.mockResolvedValue({ accessToken: 't' });

    expect(await controller.refresh({ token: 'refresh' } as any)).toEqual({
      accessToken: 't',
    });

    expect(mockAuthService.refresh).toHaveBeenCalledWith('refresh');
  });

  it('logout proxies to service', async () => {
    mockAuthService.logout.mockResolvedValue({ message: 'ok' });

    expect(await controller.logout('refresh')).toEqual({ message: 'ok' });

    expect(mockAuthService.logout).toHaveBeenCalledWith('refresh');
  });

  it('requestReset proxies to service', async () => {
    mockAuthService.requestReset.mockResolvedValue({ message: 'ok' });

    expect(await controller.requestReset({ email: 'a@b.com' } as any)).toEqual({
      message: 'ok',
    });

    expect(mockAuthService.requestReset).toHaveBeenCalledWith('a@b.com');
  });

  it('resetPassword proxies to service', async () => {
    const dto = {
      newPassword: 'new-password',
    };

    const mockUser = {
      id: 1,
      email: 'user@test.com',
      role: 'User',
      unique_id: 'user-uid-1',
      first_name: 'John',
      last_name: 'Doe',
    };

    const req = {
      user: mockUser,
    };

    const expectedResult = {
      message: 'Password reset successful',
    };

    mockAuthService.resetPassword.mockResolvedValue(expectedResult);

    const result = await controller.resetPassword(dto as any, req as any);

    expect(result).toEqual(expectedResult);
    expect(mockAuthService.resetPassword).toHaveBeenCalledWith(
      mockUser,
      dto.newPassword,
    );
  });

  it('getProfile returns user from request', () => {
    const req = { user: { userId: '1', email: 'a@b.com' } };

    expect(controller.getProfile(req as any)).toEqual({
      message: 'Protected route',
      user: req.user,
    });
  });
});