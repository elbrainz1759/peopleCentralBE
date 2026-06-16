import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';

jest.mock('bcrypt');
jest.mock('jsonwebtoken');

describe('AuthService', () => {
  let service: AuthService;

  const mockPool: any = {
    query: jest.fn(),
    getConnection: jest.fn(),
  };

  const mockConnection: any = {
    query: jest.fn(),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
  };

  const mockMailService = {
    sendCaseNotification: jest.fn(),
  };

  const mockUser = {
    id: 1,
    email: 'user@mercycorps.org',
    role: 'User',
    unique_id: 'user-uid-1',
    first_name: 'John',
    last_name: 'Doe',
    staff_id: 1001,
  };

  beforeEach(() => {
    jest.resetAllMocks();

    process.env.JWT_SECRET = 'access-secret';
    process.env.JWT_REFRESH_SECRET = 'refresh-secret';

    mockPool.getConnection.mockResolvedValue(mockConnection);

    service = new AuthService(
      mockPool as any,
      mockMailService as unknown as MailService,
    );
  });

  // ─── register ────────────────────────────────────────────────────────────────
  // Service flow:
  //   1. role query  (outside try)
  //   2. employee query (inside try)
  //   3. user-exists query
  //   4. INSERT

  describe('register', () => {
    it('throws BadRequestException when email or password is missing', async () => {
      await expect(service.register('', '', 'User')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for invalid role', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // role query → not found

      await expect(
        service.register('user@test.com', 'password', 'InvalidRole'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when employee does not exist', async () => {
      mockPool.query
        .mockResolvedValueOnce([[{ name: 'User' }]]) // role found
        .mockResolvedValueOnce([[]]); // employee not found

      await expect(
        service.register('user@mercycorps.org', 'password', 'User'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when email already exists', async () => {
      mockPool.query
        .mockResolvedValueOnce([[{ name: 'User' }]])  // role found
        .mockResolvedValueOnce([[{ id: 1 }]])          // employee found
        .mockResolvedValueOnce([[{ id: 2 }]]);         // user already exists

      await expect(
        service.register('user@mercycorps.org', 'password', 'User'),
      ).rejects.toThrow(BadRequestException);
    });

    it('registers user successfully', async () => {
      mockPool.query
        .mockResolvedValueOnce([[{ name: 'User' }]])   // role found
        .mockResolvedValueOnce([[{ id: 1 }]])           // employee found
        .mockResolvedValueOnce([[]])                    // user does not exist
        .mockResolvedValueOnce([{ insertId: 1 }]);      // INSERT

      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');

      const result = await service.register(
        'user@mercycorps.org',
        'password',
        'User',
      );

      expect(result.message).toBe('User registered successfully');
      expect(result.unique_id).toBeDefined();
      expect(mockPool.query).toHaveBeenCalledTimes(4);
    });
  });

  // ─── approveUser ─────────────────────────────────────────────────────────────

  describe('approveUser', () => {
    it('throws BadRequestException when required fields are missing', async () => {
      await expect(service.approveUser('', 'User', '')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when role is invalid', async () => {
      mockPool.query.mockResolvedValueOnce([[]]); // role not found

      await expect(
        service.approveUser('user@mercycorps.org', 'User', 'boss@mercycorps.org'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when supervisor is invalid', async () => {
      mockPool.query
        .mockResolvedValueOnce([[{ name: 'User' }]]) // role found
        .mockResolvedValueOnce([[]]); // supervisor not found

      await expect(
        service.approveUser('user@mercycorps.org', 'User', 'boss@mercycorps.org'),
      ).rejects.toThrow(BadRequestException);
    });

    it('approves user successfully', async () => {
      mockPool.query
        .mockResolvedValueOnce([[{ name: 'User' }]])           // role found
        .mockResolvedValueOnce([[{ unique_id: 'sup-uid-1' }]]); // supervisor found

      mockConnection.query
        .mockResolvedValueOnce([[{ id: 1 }]])           // employee found
        .mockResolvedValueOnce([[]])                    // user not exists
        .mockResolvedValueOnce([{ insertId: 1 }])       // INSERT user
        .mockResolvedValueOnce([{ affectedRows: 1 }]);  // UPDATE employee

      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      mockMailService.sendCaseNotification.mockResolvedValue(undefined);

      const result = await service.approveUser(
        'user@mercycorps.org',
        'User',
        'boss@mercycorps.org',
      );

      expect(result.message).toBe('User approved successfully');
      expect(result.unique_id).toBeDefined();
      expect(result.password).toBeDefined();
      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(mockMailService.sendCaseNotification).toHaveBeenCalled();
    });
  });

  // ─── login ───────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('throws UnauthorizedException when user is not found', async () => {
      mockPool.query.mockResolvedValueOnce([[]]);

      await expect(
        service.login('user@mercycorps.org', 'password', { userAgent: 'jest', ip: '127.0.0.1' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when password does not match', async () => {
      mockPool.query.mockResolvedValueOnce([[{ ...mockUser, password: 'hash' }]]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login('user@mercycorps.org', 'wrong', { userAgent: 'jest', ip: '127.0.0.1' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('logs in successfully', async () => {
      mockPool.query
        .mockResolvedValueOnce([[{ ...mockUser, password: 'hash' }]]) // user found
        .mockResolvedValueOnce([{ affectedRows: 1 }])                  // DELETE old session
        .mockResolvedValueOnce([{ insertId: 1 }]);                     // INSERT new session

      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('refresh-token-hash');
      (jwt.sign as jest.Mock)
        .mockReturnValueOnce('access-token')
        .mockReturnValueOnce('refresh-token');

      const result = await service.login('user@mercycorps.org', 'password', {
        userAgent: 'jest',
        ip: '127.0.0.1',
      });

      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    });
  });

  // ─── refresh ─────────────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('throws UnauthorizedException when refresh token is missing', async () => {
      await expect(service.refresh('')).rejects.toThrow(UnauthorizedException);
    });

    it('refreshes token successfully', async () => {
      (jwt.verify as jest.Mock).mockReturnValue(mockUser);

      mockPool.query
        .mockResolvedValueOnce([
          [{
            id: 1,
            user_id: mockUser.unique_id,
            refresh_token_hash: 'old-hash',
            user_agent: 'jest',
            ip_address: '127.0.0.1',
            is_revoked: 'No',
          }],
        ])                                             // sessions
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // DELETE old session
        .mockResolvedValueOnce([{ insertId: 1 }]);    // INSERT new session

      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-refresh-hash');
      (jwt.sign as jest.Mock)
        .mockReturnValueOnce('new-refresh-token')
        .mockReturnValueOnce('new-access-token');

      const result = await service.refresh('old-refresh-token');

      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });
    });

    it('throws UnauthorizedException when token reuse is detected', async () => {
      (jwt.verify as jest.Mock).mockReturnValue(mockUser);

      mockPool.query
        .mockResolvedValueOnce([[{ id: 1, refresh_token_hash: 'old-hash', is_revoked: 'No' }]]) // sessions
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // DELETE on reuse detection

      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.refresh('bad-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── logout ──────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('throws UnauthorizedException when refresh token is missing', async () => {
      await expect(service.logout('')).rejects.toThrow(UnauthorizedException);
    });

    it('logs out successfully', async () => {
      (jwt.verify as jest.Mock).mockReturnValue(mockUser);

      mockPool.query
        .mockResolvedValueOnce([[{ id: 1, refresh_token_hash: 'hash', is_revoked: 'No' }]]) // sessions
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE is_revoked

      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.logout('refresh-token');

      expect(result).toEqual({ message: 'Logged out from this device successfully' });
    });

    it('throws UnauthorizedException when session does not match', async () => {
      (jwt.verify as jest.Mock).mockReturnValue(mockUser);

      mockPool.query.mockResolvedValueOnce([[{ id: 1, refresh_token_hash: 'hash', is_revoked: 'No' }]]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.logout('refresh-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── requestReset ────────────────────────────────────────────────────────────

  describe('requestReset', () => {
    it('generates reset token', async () => {
      mockPool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await service.requestReset('user@mercycorps.org');

      expect(result.message).toBe('Reset token generated');
      expect(result.token).toBeDefined();
    });
  });

  // ─── resetPassword ───────────────────────────────────────────────────────────

  describe('resetPassword', () => {
    it('throws BadRequestException when user is not found', async () => {
      mockPool.query.mockResolvedValueOnce([[]]);

      await expect(
        service.resetPassword(mockUser as any, 'new-password'),
      ).rejects.toThrow(BadRequestException);
    });

    it('resets password successfully', async () => {
      mockPool.query
        .mockResolvedValueOnce([[{ id: 1 }]])          // user found with passChanged=0
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE

      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');

      const result = await service.resetPassword(mockUser as any, 'new-password');

      expect(result).toEqual({ message: 'Password reset successful' });
    });
  });
});