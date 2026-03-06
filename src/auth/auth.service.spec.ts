import { AuthService } from './auth.service';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn((_payload: unknown, secret: string) => {
    if (secret === 'secret') return 'access-token';
    if (secret === 'refresh') return 'refresh-token';
    return 'token';
  }),
  verify: jest.fn(),
}));

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  const mockPool: any = {
    query: jest.fn(),
    getConnection: jest.fn(),
  };
  const mockConn: any = {
    query: jest.fn(),
    execute: jest.fn(),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    mockPool.getConnection.mockResolvedValue(mockConn);
    service = new AuthService(mockPool as any);

    process.env.JWT_SECRET = 'secret';
    process.env.JWT_REFRESH_SECRET = 'refresh';

    jest.spyOn(require('crypto'), 'randomBytes').mockReturnValue(Buffer.alloc(32, 0));

    // Re-apply jwt.sign default so hashToken() receives a string (resetAllMocks clears it)
    (jwt.sign as jest.Mock).mockImplementation((_p: unknown, secret: string) => {
      if (secret === 'secret') return 'access-token';
      if (secret === 'refresh') return 'refresh-token';
      return 'token';
    });
  });

  describe('register', () => {
    it('should throw if required fields are missing', async () => {
      await expect(service.register('', 'pw', 'User')).rejects.toThrow(BadRequestException);
      await expect(service.register('a', '', 'User')).rejects.toThrow(BadRequestException);
      await expect(service.register('a', 'pw', '')).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid role', async () => {
      await expect(service.register('a', 'b', 'Foo')).rejects.toThrow(BadRequestException);
    });

    it('should fail when no employee exists', async () => {
      mockPool.query.mockResolvedValue([[]]);
      await expect(service.register('a', 'b', 'User')).rejects.toThrow(BadRequestException);
      expect(mockPool.query).toHaveBeenCalledWith('SELECT id FROM employee WHERE email = ?', ['a']);
    });

    it('should fail when user already exists', async () => {
      mockPool.query
        .mockResolvedValueOnce([[{ id: 1 }]]) // employee found
        .mockResolvedValueOnce([[{ id: 2 }]]); // user exists
      await expect(service.register('a', 'b', 'User')).rejects.toThrow(BadRequestException);
    });

    it('should create a new user successfully', async () => {
      mockPool.query
        .mockResolvedValueOnce([[{ id: 1 }]]) // employee exists
        .mockResolvedValueOnce([[]]) // no existing user
        .mockResolvedValueOnce([{ insertId: 99 }]); // insert result
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedpw');

      const result = await service.register('a', 'b', 'Admin');
      expect(result).toHaveProperty('message', 'User registered successfully');
      expect(result).toHaveProperty('unique_id');
    });
  });

  describe('login', () => {
    it('throws when no user found', async () => {
      mockPool.query.mockResolvedValue([[]]);
      await expect(service.login('a', 'b', { userAgent: null, ip: null })).rejects.toThrow(UnauthorizedException);
    });

    it('throws when password mismatch', async () => {
      const user = { id: 1, email: 'a', password: 'pw', role: 'User', unique_id: 'u' };
      mockPool.query.mockResolvedValue([[user]]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(service.login('a', 'b', { userAgent: null, ip: null })).rejects.toThrow(UnauthorizedException);
    });

    it('returns tokens on success and stores session', async () => {
      const user: any = { id: 1, email: 'a', password: 'pw', role: 'User', unique_id: 'u' };
      mockPool.query
        .mockResolvedValueOnce([[user]])
        .mockResolvedValueOnce([{}])
        .mockResolvedValueOnce([{}]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('refreshHash');

      const res = await service.login('a', 'b', { userAgent: 'ua', ip: '1.2.3.4' });
      expect(res).toEqual({ accessToken: 'access-token', refreshToken: 'refresh-token' });
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM user_sessions'), [user.unique_id, 'ua']);
    });
  });

  describe('refresh', () => {
    it('rejects missing token', async () => {
      await expect(service.refresh('')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects invalid token', async () => {
      (jwt.verify as jest.Mock).mockImplementation(() => { throw new Error('bad'); });
      await expect(service.refresh('bad')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when no matching session', async () => {
      (jwt.verify as jest.Mock).mockReturnValue({ unique_id: 'u' });
      mockPool.query.mockResolvedValue([[]]);
      await expect(service.refresh('tok')).rejects.toThrow(UnauthorizedException);
    });

    it('cycles token on success', async () => {
      (jwt.verify as jest.Mock).mockReturnValue({ unique_id: 'u', id: 1, email: 'e', role: 'User' });
      mockPool.query
        .mockResolvedValueOnce([[{ id: 5, refresh_token_hash: 'h', user_agent: null, ip_address: null }]])
        .mockResolvedValueOnce([{}])
        .mockResolvedValueOnce([{}]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('newHash');

      const res = await service.refresh('rtok');
      expect(res).toEqual({ accessToken: 'access-token', refreshToken: 'refresh-token' });
    });
  });

  describe('logout', () => {
    it('rejects missing token', async () => {
      await expect(service.logout('')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects invalid token', async () => {
      (jwt.verify as jest.Mock).mockImplementation(() => { throw new Error('bad'); });
      await expect(service.logout('bad')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when session not found', async () => {
      (jwt.verify as jest.Mock).mockReturnValue({ unique_id: 'u' });
      mockPool.query.mockResolvedValue([[]]);
      await expect(service.logout('tok')).rejects.toThrow(UnauthorizedException);
    });

    it('revokes on success', async () => {
      (jwt.verify as jest.Mock).mockReturnValue({ unique_id: 'u' });
      mockPool.query
        .mockResolvedValueOnce([[{ id: 3, refresh_token_hash: 'h' }]])
        .mockResolvedValueOnce([{}]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      const res = await service.logout('rtok');
      expect(res).toEqual({ message: 'Logged out from this device successfully' });
    });
  });

  describe('requestReset & resetPassword', () => {
    it('generates a token', async () => {
      mockPool.query.mockResolvedValue([{}]);
      const res = await service.requestReset('a');
      expect(res).toHaveProperty('token');
    });

    it('resets password successfully', async () => {
      const user = { id: 1 };
      mockPool.query
        .mockResolvedValueOnce([[user]])
        .mockResolvedValueOnce([{}]);
      (bcrypt.hash as jest.Mock).mockResolvedValue('newhash');
      const res = await service.resetPassword('tok', 'pw');
      expect(res).toEqual({ message: 'Password reset successful' });
    });

    it('throws on invalid token', async () => {
      mockPool.query.mockResolvedValue([[]]);
      await expect(service.resetPassword('bad', 'pw')).rejects.toThrow(BadRequestException);
    });
  });
});
