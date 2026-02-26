import { Controller, Post, Body, Get, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RequestResetDto } from './dto/requestReset.dto';
import { ResetPasswordDto } from './dto/resetPassword.dto';
import { RequestRefreshDto } from './dto/refresh.dto';
import { Public } from '../decorators/public.decorator';
import { RequestMetadata } from '../decorators/requestMetadata.decorator';
interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    email: string;
  };
}

interface RequestMetadata {
  userAgent: string | null;
  ip: string | null;
}

@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto.email, dto.password, dto.role);
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto, @RequestMetadata() metadata: RequestMetadata) {
    try {
      return this.authService.login(dto.email, dto.password, metadata);
    } catch (err) {
      console.error('Login error:', err);
      return { message: 'Login failed' };
    }
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RequestRefreshDto) {
    return this.authService.refresh(dto.token);
  }

  @Public()
  @Post('logout')
  logout(@Body('refreshToken') refreshToken: string) {
    return this.authService.logout(refreshToken);
  }

  @Public()
  @Post('request-reset')
  requestReset(@Body() dto: RequestResetDto) {
    return this.authService.requestReset(dto.email);
  }

  @Public()
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Get('profile')
  getProfile(@Req() req: AuthenticatedRequest) {
    return {
      message: 'Protected route',
      user: req.user,
    };
  }
}
