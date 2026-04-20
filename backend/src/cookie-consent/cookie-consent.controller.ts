import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { Public } from '../auth/public.decorator';
import { CookieConsentService } from './cookie-consent.service';

const COOKIE_NAME = 'kloel_consent';
const COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 365;

type JwtLikePayload = {
  sub?: string;
};

function resolveCookieDomain(host?: string | null): string | undefined {
  const hostname = String(host || '')
    .trim()
    .toLowerCase()
    .split(':')[0];

  if (!hostname) {
    return undefined;
  }
  if (hostname === 'kloel.com' || hostname.endsWith('.kloel.com')) {
    return '.kloel.com';
  }

  if (hostname.endsWith('.localhost')) {
    const parts = hostname.split('.');
    if (parts.length > 2) {
      return `.${parts.slice(1).join('.')}`;
    }
  }

  return undefined;
}

/** Cookie consent controller. */
@Public()
@Controller('api/v1/cookie-consent')
export class CookieConsentController {
  constructor(
    private readonly cookieConsentService: CookieConsentService,
    private readonly jwtService: JwtService,
  ) {}

  private getTokenFromRequest(request: Request): string | null {
    const authHeader = request.headers.authorization;
    if (authHeader) {
      const [scheme, token] = authHeader.split(' ');
      if (scheme === 'Bearer' && token) {
        return token;
      }
    }

    return request.cookies?.kloel_access_token || request.cookies?.kloel_token || null;
  }

  private async resolveAgentId(request: Request): Promise<string | null> {
    const token = this.getTokenFromRequest(request);
    if (!token) {
      return null;
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtLikePayload>(token);
      return typeof payload?.sub === 'string' && payload.sub.trim() ? payload.sub : null;
    } catch {
      return null;
    }
  }

  private setConsentCookie(request: Request, response: Response, serialized: string) {
    const domain = resolveCookieDomain(request.headers.host);
    response.cookie(COOKIE_NAME, serialized, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE_MS,
      ...(domain ? { domain } : {}),
    });
  }

  @Get()
  async getConsent(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const agentId = await this.resolveAgentId(request);

    if (agentId) {
      const consent = await this.cookieConsentService.getForAgent(agentId);
      if (consent) {
        this.setConsentCookie(
          request,
          response,
          this.cookieConsentService.serializeCookieValue(consent),
        );
      }
      return { consent };
    }

    return {
      consent: this.cookieConsentService.parseCookieValue(request.cookies?.[COOKIE_NAME] || null),
    };
  }

  @Post()
  async saveConsent(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: { necessary?: boolean; analytics?: boolean; marketing?: boolean } | null,
  ) {
    const agentId = await this.resolveAgentId(request);
    const consent = agentId
      ? await this.cookieConsentService.saveForAgent(agentId, body)
      : this.cookieConsentService.normalize(body);

    this.setConsentCookie(
      request,
      response,
      this.cookieConsentService.serializeCookieValue(consent),
    );

    return {
      success: true,
      consent,
    };
  }
}
