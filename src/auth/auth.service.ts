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
import { createHash } from 'crypto';

interface UserRow extends mysql.RowDataPacket {
  id: number;
  email: string;
  role: string;
  password?: string;
  reset_token?: string | null;
  reset_token_expiry?: Date | null;
  unique_id?: string;
}

interface SessionRow extends mysql.RowDataPacket {
  id: number;
  user_id: number;
  refresh_token_hash: string;
  user_agent: string | null;
  ip_address: string | null;
  expires_at: Date;
  is_revoked: string; // Yes or No
}

interface Payload {
  id: string;
  email: string;
  role: string;
  staff_id?: number | null;
  unique_id: string;
}

interface RequestMetadata {
  userAgent: string | null;
  ip: string | null;
}

@Injectable()
export class AuthService {
  constructor(@Inject('MYSQL_POOL') private readonly pool: mysql.Pool) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async register(email: string, password: string, role: string = 'User') {
    //ensure data is not empty and valid
    if (!email || !password || !role) {
      throw new BadRequestException('Email and password are required');
    }

    // validating role

    if (!['User', 'Admin', 'Superadmin'].includes(role)) {
      throw new BadRequestException('Invalid role');
    }
    try {
      //Check if employee exists in employees table
      const [empRows] = await this.pool.query<UserRow[]>(
        'SELECT id FROM employee WHERE email = ?',
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

      const unique_id: string = randomBytes(16).toString('hex');

      await this.pool.query<mysql.ResultSetHeader>(
        'INSERT INTO users (email, password, role, unique_id) VALUES (?, ?, ?, ?)',
        [email, hashed, role, unique_id],
      );

      return { message: 'User registered successfully', unique_id };
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
        unique_id: user.unique_id,
      };

      console.log(payload);

      // Generate Access Token
      const accessToken = jwt.sign(payload, process.env.JWT_SECRET!, {
        expiresIn: '15m',
      });
      // Generate Refresh Token
      const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, {
        expiresIn: '7d',
      });

      const refreshHash = await bcrypt.hash(this.hashToken(refreshToken), 10);

      // ✅ Delete existing session for this device before inserting new one
      await this.pool.query(
        'DELETE FROM user_sessions WHERE user_id = ? AND user_agent = ?',
        [user.unique_id, metadata.userAgent || null],
      );

      await this.pool.query(
        `INSERT INTO user_sessions 
     (user_id, refresh_token_hash, user_agent, ip_address, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
        [
          user.unique_id,
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
      payload = jwt.verify(
        refreshToken,
        process.env.JWT_REFRESH_SECRET!,
      ) as Payload;
    } catch (error) {
      console.error('Refresh token error:', error);
      throw new UnauthorizedException('Invalid refresh token');
    }

    const [sessions] = await this.pool.query<SessionRow[]>(
      'SELECT * FROM user_sessions WHERE user_id = ? AND is_revoked = "No"',
      [payload.unique_id],
    );

    console.log('Sessions found:', sessions.length); // 👈
    console.log(
      'Session IDs:',
      sessions.map((s) => s.id),
    ); // 👈

    let matchedSession: SessionRow | null = null;

    for (const session of sessions) {
      console.log('Comparing token:', refreshToken.slice(-20)); // last 20 chars
      console.log('Against hash:', session.refresh_token_hash);
      const isMatch = await bcrypt.compare(
        this.hashToken(refreshToken),
        session.refresh_token_hash,
      );

      console.log(`Session ${session.id} isMatch:`, isMatch); // 👈
      if (isMatch) {
        matchedSession = session;
        break;
      }
    }

    console.log('matchedSession:', matchedSession?.id ?? 'NULL'); // 👈

    if (!matchedSession) {
      // Potential reuse attack → delete all sessions
      await this.pool.query('DELETE FROM user_sessions WHERE user_id = ?', [
        payload.unique_id,
      ]);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    //  DELETE old session immediately before creating new one
    await this.pool.query('DELETE FROM user_sessions WHERE id = ?', [
      matchedSession.id,
    ]);

    const newRefreshToken = jwt.sign(
      {
        id: payload.id,
        email: payload.email,
        role: payload.role,
        unique_id: payload.unique_id,
      },
      process.env.JWT_REFRESH_SECRET!,
      { expiresIn: '7d' },
    );

    console.log('OLD refreshToken:', refreshToken); // 👈
    console.log('NEW refreshToken:', newRefreshToken); // 👈
    console.log('Are they the same?:', refreshToken === newRefreshToken); // 👈

    const newHash = await bcrypt.hash(this.hashToken(newRefreshToken), 10);

    console.log('New hash:', newHash);

    // verify exactly what we are storing
    const verifyHash = await bcrypt.compare(
      this.hashToken(newRefreshToken),
      newHash,
    );
    const verifyOldHash = await bcrypt.compare(
      this.hashToken(refreshToken),
      newHash,
    );

    console.log('newRefreshToken matches newHash:', verifyHash); // should be true
    console.log('OLD refreshToken matches newHash:', verifyOldHash); // should be false

    //  INSERT new session
    await this.pool.query(
      `INSERT INTO user_sessions 
     (user_id, refresh_token_hash, user_agent, ip_address, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
      [
        payload.unique_id,
        newHash,
        matchedSession.user_agent,
        matchedSession.ip_address,
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ],
    );

    const newAccessToken = jwt.sign(
      {
        id: payload.id,
        email: payload.email,
        role: payload.role,
        unique_id: payload.unique_id,
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
      payload = jwt.verify(
        refreshToken,
        process.env.JWT_REFRESH_SECRET!,
      ) as Payload;
    } catch (error) {
      console.error('Logout error:', error);
      throw new UnauthorizedException('Invalid token');
    }

    const [sessions] = await this.pool.query<SessionRow[]>(
      'SELECT * FROM user_sessions WHERE user_id = ? AND is_revoked = "No"',
      [payload.unique_id],
    );

    let matchedSession: SessionRow | null = null;

    for (const session of sessions) {
      const isMatch = await bcrypt.compare(
        this.hashToken(refreshToken),
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
      'UPDATE user_sessions SET is_revoked = "Yes" WHERE id = ?',
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
