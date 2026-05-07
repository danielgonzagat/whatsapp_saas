import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../auth/public.decorator';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { ComplianceService } from './compliance.service';

type RawBodyRequest = Request & {
  rawBody?: Buffer;
};

/** Compliance controller. */
@Controller()
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  /** Facebook data deletion. */
  @Public()
  @Post('auth/facebook/data-deletion')
  async facebookDataDeletion(@Body('signed_request') signedRequest?: string) {
    return this.complianceService.handleFacebookDataDeletion(String(signedRequest || ''));
  }

  /** Facebook deauthorize. */
  @Public()
  @HttpCode(200)
  @Post('auth/facebook/deauthorize')
  async facebookDeauthorize(@Body('signed_request') signedRequest?: string) {
    await this.complianceService.handleFacebookDeauthorize(String(signedRequest || ''));
    return {};
  }

  /** Google risc events. */
  @Public()
  @HttpCode(202)
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @Post('auth/google/risc-events')
  async googleRiscEvents(@Req() req: RawBodyRequest) {
    const rawJwt =
      req.rawBody?.toString('utf8') ||
      (typeof req.body === 'string' ? req.body : String(req.body || ''));
    return this.complianceService.handleGoogleRisc(rawJwt);
  }

  /** Deletion status. */
  // PULSE_OK: called from frontend/src/app/api/compliance/deletion-status/[code]/route.ts
  @Get('compliance/deletion-status/:code')
  async deletionStatus(@Param('code') code: string) {
    return this.complianceService.getDeletionStatus(code);
  }

  /** Data export. */
  // PULSE_TODO: verify if still needed, no caller detected
  @Get('user/data-export')
  async dataExport(@Req() req: AuthenticatedRequest) {
    return this.complianceService.exportUserData(req.user.sub, req.user.workspaceId);
  }

  /** Delete current user. */
  // PULSE_TODO: verify if still needed, no caller detected
  @Delete('user/data-deletion')
  async deleteCurrentUser(@Req() req: AuthenticatedRequest) {
    return this.complianceService.deleteCurrentUser(req.user.sub, req.user.workspaceId);
  }

  /** Unsubscribe from marketing emails (GET — user clicks link in email). */
  @Public()
  @Get('unsubscribe')
  async unsubscribeGet(@Query('token') token?: string) {
    if (!token) {
      return { unsubscribed: false, error: 'Token nao fornecido.' };
    }
    return this.complianceService.unsubscribeMarketingEmail(String(token));
  }

  /** Unsubscribe from marketing emails (POST — one-click RFC 8058 mail client). */
  @Public()
  @HttpCode(200)
  @Post('unsubscribe')
  async unsubscribePost(@Body('token') token?: string) {
    if (!token) {
      return { unsubscribed: false, error: 'Token nao fornecido.' };
    }
    return this.complianceService.unsubscribeMarketingEmail(String(token));
  }
}
