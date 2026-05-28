import { Controller, Get, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { RouteClass } from '../common/throttler/route-class.decorator';
import { MailboxGmailOAuthService } from './mailbox-gmail-oauth.service';
import { buildRedirect } from './mailbox-oauth-callback.helpers';

@Public()
@Controller('marketing/connect/email/gmail')
@RouteClass('mutate')
export class MailboxGmailOAuthCallbackController {
  constructor(
    private readonly gmailMailbox: MailboxGmailOAuthService,
    private readonly config: ConfigService,
  ) {}

  @Get('callback')
  async handleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    if (error) {
      return res.redirect(
        buildRedirect(this.config, '/marketing/email', {
          email: 'error',
          provider: 'gmail',
          reason: String(error).slice(0, 80),
        }),
      );
    }

    if (!code || !state) {
      return res.redirect(
        buildRedirect(this.config, '/marketing/email', {
          email: 'error',
          provider: 'gmail',
          reason: 'missing_code_or_state',
        }),
      );
    }

    try {
      const result = await this.gmailMailbox.completeOAuthCallback(String(code), String(state));
      return res.redirect(
        buildRedirect(this.config, result.returnTo, {
          email: 'connected',
          provider: 'gmail',
        }),
      );
    } catch {
      return res.redirect(
        buildRedirect(this.config, '/marketing/email', {
          email: 'error',
          provider: 'gmail',
          reason: 'oauth_callback_failed',
        }),
      );
    }
  }
}
