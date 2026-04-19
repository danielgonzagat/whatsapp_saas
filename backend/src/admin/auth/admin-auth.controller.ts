import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../auth/public.decorator';
import { AdminAuthService } from './admin-auth.service';
import type { AuthenticatedAdmin } from './admin-token.types';
import { AdminPublic } from './decorators/admin-public.decorator';
import { AllowPendingMfa } from './decorators/allow-pending-mfa.decorator';
import { CurrentAdmin } from './decorators/current-admin.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { MfaVerifyDto } from './dto/mfa-verify.dto';
import { RefreshDto } from './dto/refresh.dto';
import { AdminAuthGuard } from './guards/admin-auth.guard';

function readForwardedForIp(header: string | string[] | undefined): string | null {
  if (typeof header !== 'string' || header.length === 0) return null;
  const first = header.split(',')[0].trim();
  return first.length > 0 ? first : null;
}

function extractClientIp(req: Request): string {
  const forwarded = readForwardedForIp(req.headers['x-forwarded-for']);
  if (forwarded) return forwarded;
  return req.ip ?? req.socket?.remoteAddress ?? '0.0.0.0';
}

function extractUserAgent(req: Request): string {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua : 'unknown';
}

@Public()
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Post('login')
  @AdminPublic()
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto.email, dto.password, extractClientIp(req), extractUserAgent(req));
  }

  @Post('change-password')
  @UseGuards(AdminAuthGuard)
  @AllowPendingMfa()
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    return this.auth.changePassword(
      admin,
      dto.newPassword,
      extractClientIp(req),
      extractUserAgent(req),
    );
  }

  @Post('mfa/setup')
  @UseGuards(AdminAuthGuard)
  @AllowPendingMfa()
  @HttpCode(HttpStatus.OK)
  async mfaSetup(@CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.auth.setupMfa(admin);
  }

  @Post('mfa/verify-initial')
  @UseGuards(AdminAuthGuard)
  @AllowPendingMfa()
  @HttpCode(HttpStatus.OK)
  async mfaVerifyInitial(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: MfaVerifyDto,
    @Req() req: Request,
  ) {
    return this.auth.verifyInitialMfa(admin, dto.code, extractClientIp(req), extractUserAgent(req));
  }

  @Post('mfa/verify')
  @UseGuards(AdminAuthGuard)
  @AllowPendingMfa()
  @HttpCode(HttpStatus.OK)
  async mfaVerify(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: MfaVerifyDto,
    @Req() req: Request,
  ) {
    return this.auth.verifyMfa(admin, dto.code, extractClientIp(req), extractUserAgent(req));
  }

  @Post('refresh')
  @AdminPublic()
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, extractClientIp(req), extractUserAgent(req));
  }

  @Post('logout')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentAdmin() admin: AuthenticatedAdmin, @Req() req: Request) {
    await this.auth.logout(admin, extractClientIp(req), extractUserAgent(req));
  }
}
