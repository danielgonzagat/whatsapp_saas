import { Controller, Get, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { RouteClass } from '../common/throttler/route-class.decorator';
import { MailboxGmailOAuthService } from './mailbox-gmail-oauth.service';

function normalizeFrontendUrl(config: ConfigService): string {
  const raw =
    config.get<string>('FRONTEND_URL') ||
    config.get<string>('NEXT_PUBLIC_APP_URL') ||
    process.env.FRONTEND_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000';
  return String(raw).replace(/\/+$/, '');
}

function buildRedirect(config: ConfigService, returnTo: string, params: Record<string, string>) {
  const target =
    returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/marketing/email';
  const url = new URL(target, normalizeFrontendUrl(config));
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

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
