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
import { MailService } from '../mail/mail.service';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

interface UserRow extends mysql.RowDataPacket {
  id: number;
  email: string;
  role: string;
  password?: string;
  reset_token?: string | null;
  reset_token_expiry?: Date | null;
  unique_id?: string;
  first_name?: string | null;
  last_name?: string | null;
  staff_id?: number | null;
  status?: string | null;
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
  first_name?: string | null;
  last_name?: string | null;
}

interface RequestMetadata {
  userAgent: string | null;
  ip: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject('MYSQL_POOL') private readonly pool: mysql.Pool,
    private mailService: MailService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async approveUser(
    email: string,
    role: string = 'User',
    supervisorEmail: string,
  ) {
    //check email must be @mercycorps.org
    if (!email.endsWith('@mercycorps.org')) {
      throw new BadRequestException('Email must be a mercycorps.org address');
    }
    // Validate inputs
    if (!email || !role || !supervisorEmail) {
      throw new BadRequestException(
        'Email, role, and supervisor email are required',
      );
    }

    // Validate role exists
    const [roleRows] = await this.pool.query<UserRow[]>(
      'SELECT name FROM roles WHERE name = ?',
      [role],
    );
    if (roleRows.length === 0) {
      throw new BadRequestException('Invalid role');
    }

    // Validate supervisor exists — status is deliberately not checked here.
    // This is a new system: most staff (including future supervisors) are
    // still Pending until HR gets around to approving them individually, so
    // requiring the supervisor to already be Active would make it
    // impossible to build out a reporting chain in order. Any employee
    // record can be selected as a supervisor at approval time.
    const [supRows] = await this.pool.query<UserRow[]>(
      'SELECT unique_id FROM employee WHERE email = ?',
      [supervisorEmail],
    );
    if (supRows.length === 0) {
      throw new BadRequestException('Invalid supervisor email');
    }

    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      // Check employee exists
      const [empRows] = await connection.query<UserRow[]>(
        'SELECT id FROM employee WHERE email = ?',
        [email],
      );
      if (empRows.length === 0) {
        throw new BadRequestException('No employee found with this email');
      }

      // A user row may already exist for this email — either it's Active
      // (a genuine duplicate approval, rejected below) or Inactive (this
      // person was deactivated and is now being re-approved after
      // re-registering). Reactivate the existing row rather than reject
      // it, so their old unique_id stays stable for anything referencing it.
      const [userRows] = await connection.query<UserRow[]>(
        'SELECT id, unique_id, status FROM users WHERE email = ?',
        [email],
      );
      if (userRows.length > 0 && userRows[0].status !== 'Inactive') {
        throw new BadRequestException('User already exists for this email');
      }
      const isReactivation = userRows.length > 0;

      // Generate credentials
      const password = randomBytes(16).toString('hex').slice(0, 12);
      const hashed = await bcrypt.hash(password, 10);
      const unique_id = isReactivation
        ? (userRows[0].unique_id as string)
        : randomBytes(16).toString('hex');

      if (isReactivation) {
        await connection.query<mysql.ResultSetHeader>(
          'UPDATE users SET password = ?, role = ?, passChanged = 0, status = "Active" WHERE email = ?',
          [hashed, role, email],
        );
      } else {
        await connection.query<mysql.ResultSetHeader>(
          'INSERT INTO users (email, password, role, unique_id, passChanged, status) VALUES (?, ?, ?, ?, ?, ?)',
          [email, hashed, role, unique_id, 0, 'Active'],
        );
      }

      // Activate employee
      await connection.query<mysql.ResultSetHeader>(
        'UPDATE employee SET status = "Active", supervisor=? WHERE email = ?',
        [supRows[0].unique_id, email],
      );

      await connection.commit();

      // Non-fatal — the account is already committed at this point. A mail
      // failure here must not roll back (there's nothing left to roll back)
      // or report the approval as failed when it actually succeeded.
      try {
        await this.mailService.sendCaseNotification({
          to: email,
          subject: 'Welcome to PeopleCentral — Your Account is Ready',
          subjectFull: 'Your Account Has Been Created',
          message: `Your PeopleCentral account has been created successfully. Your temporary password is: ${password} Please log in and change your password immediately`,
          siteName: 'PeopleCentral',
        });
      } catch (mailErr) {
        console.error('approveUser welcome-email error:', mailErr);
      }

      return { message: 'User approved successfully', unique_id, password };
    } catch (err) {
      await connection.rollback();

      if (err instanceof BadRequestException) throw err;

      console.error('approveUser error:', err);
      throw new BadRequestException('Failed to approve user');
    } finally {
      connection.release();
    }
  }

  // HR-triggered reset: generates a fresh temporary password and emails it
  // to the account holder. Unlike resetPassword() below (self-service,
  // requires the user's own JWT), this is for HR resetting someone else's
  // forgotten/locked-out password — @Roles('HR','HR Lead','Superadmin')
  // gates it at the controller.
  async resetUserPassword(email: string) {
    if (!email.endsWith('@mercycorps.org')) {
      throw new BadRequestException('Email must be a mercycorps.org address');
    }

    const [rows] = await this.pool.query<UserRow[]>(
      'SELECT id FROM users WHERE email = ?',
      [email],
    );
    if (rows.length === 0) {
      throw new BadRequestException('No account found for this email');
    }

    const password = randomBytes(16).toString('hex').slice(0, 12);
    const hashed = await bcrypt.hash(password, 10);

    // Send the new password BEFORE touching the DB. If the email fails,
    // the old password stays valid and nothing is broken — if we updated
    // the password first and the send then failed, the person would be
    // locked out with no way to learn their new password.
    try {
      await this.mailService.sendCaseNotification({
        to: email,
        subject: 'Mercy Corps PeopleCentral — Password Reset',
        subjectFull: 'Your Password Has Been Reset',
        message: `Your PeopleCentral password has been reset by HR. Your new temporary password is: ${password}\n\nPlease log in and change your password immediately.`,
        siteName: 'PeopleCentral',
      });
    } catch (err) {
      console.error('resetUserPassword mail error:', err);
      throw new BadRequestException(
        'Could not email the new password — the password was not changed. Please try again.',
      );
    }

    await this.pool.query<mysql.ResultSetHeader>(
      'UPDATE users SET password = ?, passChanged = 0 WHERE email = ?',
      [hashed, email],
    );

    return { message: `New password sent to ${email}` };
  }

  async login(email: string, password: string, metadata: RequestMetadata) {
    try {
      const [rows] = await this.pool.query<UserRow[]>(
        'SELECT a.*,e.staff_id, e.first_name as first_name, e.last_name as last_name FROM users a LEFT JOIN employee e ON a.email = e.email WHERE a.email = ?',
        [email],
      );

      const user = rows[0];
      if (!user || !user.password) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) throw new UnauthorizedException('Invalid credentials');

      // Deactivating an employee (DELETE /employees/:id) flips this to
      // "Inactive" — without this check that account could still log in.
      if (user.status === 'Inactive') {
        throw new UnauthorizedException(
          'This account has been deactivated. Please contact HR.',
        );
      }

      const payload = {
        id: user.id,
        email: user.email,
        role: user.role,
        unique_id: user.unique_id,
        first_name: user.first_name,
        last_name: user.last_name,
        staff_id: user.staff_id,
      };

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
      await this.pool.query('DELETE FROM user_sessions WHERE user_id = ?', [
        payload.unique_id,
      ]);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    // Re-fetch the current account from the DB rather than trusting the old
    // token's payload — a refresh token lives for 7 days, and every refresh
    // was just re-signing whatever role/identity was baked in at the
    // original login, so a role change (or deactivation) made mid-session
    // would never take effect until the refresh token itself expired.
    const [rows] = await this.pool.query<UserRow[]>(
      'SELECT a.*, e.staff_id, e.first_name AS first_name, e.last_name AS last_name FROM users a LEFT JOIN employee e ON a.email = e.email WHERE a.unique_id = ?',
      [payload.unique_id],
    );
    const current = rows[0];
    if (!current) {
      throw new UnauthorizedException('Account no longer exists');
    }
    if (current.status === 'Inactive') {
      throw new UnauthorizedException(
        'This account has been deactivated. Please contact HR.',
      );
    }

    //  DELETE old session immediately before creating new one
    await this.pool.query('DELETE FROM user_sessions WHERE id = ?', [
      matchedSession.id,
    ]);

    const newRefreshToken = jwt.sign(
      {
        id: current.id,
        email: current.email,
        role: current.role,
        unique_id: current.unique_id,
        first_name: current.first_name,
        last_name: current.last_name,
        staff_id: current.staff_id,
      },
      process.env.JWT_REFRESH_SECRET!,
      { expiresIn: '7d' },
    );
    const newHash = await bcrypt.hash(this.hashToken(newRefreshToken), 10);

    //  INSERT new session
    await this.pool.query(
      `INSERT INTO user_sessions
     (user_id, refresh_token_hash, user_agent, ip_address, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
      [
        current.unique_id,
        newHash,
        matchedSession.user_agent,
        matchedSession.ip_address,
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ],
    );

    const newAccessToken = jwt.sign(
      {
        id: current.id,
        email: current.email,
        role: current.role,
        unique_id: current.unique_id,
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

  async resetPassword(user: RequestUser, newPassword: string) {
    const [rows] = await this.pool.query<UserRow[]>(
      'SELECT * FROM users WHERE email = ? AND passChanged = 0',
      [user.email],
    );

    if (rows.length === 0) {
      throw new BadRequestException('User not found');
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await this.pool.query<mysql.ResultSetHeader>(
      'UPDATE users SET password = ?, passChanged = 1 WHERE email = ?',
      [hashed, user.email],
    );

    return { message: 'Password reset successful' };
  }
}
