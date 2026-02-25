import {
  Injectable,
  Inject,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import * as mysql from 'mysql2/promise';

interface UserRow extends mysql.RowDataPacket {
  id: number;
  email: string;
  role: string;
  password?: string;
  reset_token?: string | null;
  reset_token_expiry?: Date | null;
}

interface SessionRow extends mysql.RowDataPacket {
  id: number;
  user_id: number;
  refresh_token_hash: string;
  user_agent: string | null;
  ip_address: string | null;
  expires_at: Date;
  is_revoked: boolean;
}

interface Payload {
  id: string;
  email: string;
  role: string;
  staff_id?: number | null;
}

interface RequestMetadata {
  userAgent: string | null;
  ip: string | null;
}

@Injectable()
export class AuthService {
  constructor(@Inject('MYSQL_POOL') private readonly pool: mysql.Pool) {}

  async register(email: string, password: string, role: string = 'User') {
    //ensure data is not empty and valid
    if (!email || !password || !role) {
      throw new BadRequestException('Email and password are required');
    }
    try {
      //Check if employee exists in employees table
      const [empRows] = await this.pool.query<UserRow[]>(
        'SELECT id FROM employees WHERE email = ?',
        [email],
      );
      if (empRows.length === 0) {
        throw new BadRequestException('No employee found with this email');
      }
      const [rows] = await this.pool.query<UserRow[]>(
        'SELECT id FROM users WHERE email = ?',
        [email],
      );

      if (rows.length > 0) {
        throw new BadRequestException('Email already exists');
      }

      const hashed = await bcrypt.hash(password, 10);

      await this.pool.query<mysql.ResultSetHeader>(
        'INSERT INTO users (email, password, role) VALUES (?, ?, ?)',
        [email, hashed, role],
      );

      return { message: 'User registered successfully' };
    } catch (err) {
      console.error('Registration error:', err);
      throw new BadRequestException('Registration failed');
    }
  }

  async login(email: string, password: string, metadata: RequestMetadata) {
    try {
      const [rows] = await this.pool.query<UserRow[]>(
        'SELECT * FROM users WHERE email = ?',
        [email],
      );

      const user = rows[0];
      if (!user || !user.password) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) throw new UnauthorizedException('Invalid credentials');

      const payload = {
        id: user.id,
        email: user.email,
        role: user.role,
      };

      // Generate Access Token
      const accessToken = jwt.sign(payload, process.env.JWT_SECRET!, {
        expiresIn: '15m',
      });
      // Generate Refresh Token
      const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, {
        expiresIn: '7d',
      });

      const refreshHash = await bcrypt.hash(refreshToken, 10);

      await this.pool.query(
        `INSERT INTO user_sessions 
     (user_id, refresh_token_hash, user_agent, ip_address, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
        [
          user.id,
          refreshHash,
          metadata.userAgent || null,
          metadata.ip || null,
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        ],
      );

      return { accessToken, refreshToken };
    } catch (err) {
      console.error('Login error:', err);
      throw new UnauthorizedException('Invalid credentials');
    }
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token required');
    }

    let payload: Payload;

    try {
      payload = jwt.verify(refreshToken, process.env.JWT_SECRET!) as Payload;
    } catch (error) {
      console.error('Refresh token error:', error);
      throw new UnauthorizedException('Invalid refresh token');
    }

    const [sessions] = await this.pool.query<SessionRow[]>(
      'SELECT * FROM user_sessions WHERE user_id = ? AND is_revoked = FALSE',
      [payload.id],
    );

    let matchedSession: SessionRow | null = null;

    for (const session of sessions) {
      const isMatch = await bcrypt.compare(
        refreshToken,
        session.refresh_token_hash,
      );
      if (isMatch) {
        matchedSession = session;
        break;
      }
    }

    if (!matchedSession) {
      // Potential reuse attack → revoke all sessions
      await this.pool.query(
        'UPDATE user_sessions SET is_revoked = TRUE WHERE user_id = ?',
        [payload.id],
      );

      throw new UnauthorizedException('Refresh token reuse detected');
    }

    // Rotate refresh token
    const newRefreshToken = jwt.sign(
      {
        id: payload.id,
        email: payload.email,
        role: payload.role,
      },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' },
    );

    const newHash = await bcrypt.hash(newRefreshToken, 10);

    await this.pool.query(
      'UPDATE user_sessions SET refresh_token_hash = ? WHERE id = ?',
      [newHash, matchedSession.id],
    );

    const newAccessToken = jwt.sign(
      {
        id: payload.id,
        email: payload.email,
        role: payload.role,
      },
      process.env.JWT_SECRET!,
      { expiresIn: '15m' },
    );

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token required');
    }

    let payload: Payload;

    try {
      payload = jwt.verify(refreshToken, process.env.JWT_SECRET!) as Payload;
    } catch (error) {
      console.error('Logout error:', error);
      throw new UnauthorizedException('Invalid token');
    }

    const [sessions] = await this.pool.query<SessionRow[]>(
      'SELECT * FROM user_sessions WHERE user_id = ? AND is_revoked = FALSE',
      [payload.id],
    );

    let matchedSession: SessionRow | null = null;

    for (const session of sessions) {
      const isMatch = await bcrypt.compare(
        refreshToken,
        session.refresh_token_hash,
      );
      if (isMatch) {
        matchedSession = session;
        break;
      }
    }

    if (!matchedSession) {
      throw new UnauthorizedException('Invalid token');
    }

    await this.pool.query<SessionRow[]>(
      'UPDATE user_sessions SET is_revoked = TRUE WHERE id = ?',
      [matchedSession.id],
    );

    return { message: 'Logged out from this device successfully' };
  }

  async requestReset(email: string) {
    const token = randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 1000 * 60 * 15);

    await this.pool.query<mysql.ResultSetHeader>(
      'UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE email = ?',
      [token, expiry, email],
    );

    return { message: 'Reset token generated', token };
  }

  async resetPassword(token: string, newPassword: string) {
    const [rows] = await this.pool.query<UserRow[]>(
      'SELECT * FROM users WHERE reset_token = ? AND reset_token_expiry > NOW()',
      [token],
    );

    const user = rows[0];
    if (!user) {
      throw new BadRequestException('Invalid or expired token');
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await this.pool.query<mysql.ResultSetHeader>(
      'UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?',
      [hashed, user.id],
    );

    return { message: 'Password reset successful' };
  }
}
