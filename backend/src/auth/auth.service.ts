import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRedis } from '@nestjs-modules/ioredis';
import type { Redis } from 'ioredis';
import { AuditService } from '../audit/audit.service';
import { ConnectService } from '../payments/connect/connect.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';
import { FacebookAuthService } from './facebook-auth.service';
import { GoogleAuthService } from './google-auth.service';
import { TikTokAuthService } from './tiktok-auth.service';
import { RateLimitService } from './rate-limit.service';

import type { AuthPartsDeps } from './__parts__/auth-service/register-login';
import {
  checkEmail,
  createAnonymous,
  register,
  login,
} from './__parts__/auth-service/register-login';
import { issueTokensForAgentId, refreshToken } from './__parts__/auth-service/tokens';
import {
  oauthLogin,
  loginWithGoogleCredential,
  loginWithFacebookAccessToken,
  loginWithAppleCredential,
  loginWithTikTokAuthorizationCode,
  loginWithTikTokAccessToken,
} from './__parts__/auth-service/oauth-entry';
import { requestMagicLink, verifyMagicLink } from './__parts__/auth-service/magic-link';
import { sendWhatsAppCode, verifyWhatsAppCode } from './__parts__/auth-service/whatsapp';
import {
  forgotPassword,
  resetPassword,
  sendVerificationEmail,
  verifyEmail,
  resendVerificationEmail,
} from './__parts__/auth-service/password-verification';

/** Auth service. */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly facebookAuthService: FacebookAuthService,
    private readonly tikTokAuthService: TikTokAuthService,
    private readonly connectService: ConnectService,
    private readonly rateLimitService: RateLimitService,
    @Optional() @InjectRedis() private readonly redis?: Redis,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  private buildDeps(): AuthPartsDeps {
    return {
      prisma: this.prisma,
      jwt: this.jwt,
      emailService: this.emailService,
      config: this.config,
      googleAuthService: this.googleAuthService,
      facebookAuthService: this.facebookAuthService,
      tikTokAuthService: this.tikTokAuthService,
      connectService: this.connectService,
      rateLimitService: this.rateLimitService,
      redis: this.redis,
      auditService: this.auditService,
      logger: this.logger,
    };
  }

  async checkEmail(email: string): Promise<{ exists: boolean }> {
    return checkEmail(this.prisma, email);
  }

  async createAnonymous(ip?: string) {
    return createAnonymous(this.buildDeps(), ip);
  }

  async register(data: {
    name?: string;
    email: string;
    password: string;
    workspaceName?: string;
    affiliateInviteToken?: string;
    ip?: string;
  }) {
    return register(this.buildDeps(), data);
  }

  async login(data: { email: string; password: string; ip?: string }) {
    return login(this.buildDeps(), data);
  }

  async issueTokensForAgentId(agentId: string) {
    return issueTokensForAgentId(this.prisma, this.jwt, this.logger, agentId);
  }

  async refresh(token: string) {
    return refreshToken(this.prisma, this.jwt, this.logger, token);
  }

  async oauthLogin(data: {
    provider?: 'google' | 'apple';
    providerId?: string;
    email?: string;
    name?: string;
    image?: string;
    credential?: string;
    ip?: string;
  }) {
    return oauthLogin(this.buildDeps(), data);
  }

  async loginWithGoogleCredential(data: { credential: string; ip?: string }) {
    return loginWithGoogleCredential(this.buildDeps(), data);
  }

  async loginWithFacebookAccessToken(data: { accessToken: string; userId?: string; ip?: string }) {
    return loginWithFacebookAccessToken(this.buildDeps(), data);
  }

  async loginWithAppleCredential(data: {
    identityToken: string;
    user?: { name?: { firstName?: string; lastName?: string }; email?: string };
    ip?: string;
  }) {
    return loginWithAppleCredential(this.buildDeps(), data);
  }

  async loginWithTikTokAuthorizationCode(data: {
    code: string;
    redirectUri?: string;
    ip?: string;
  }) {
    return loginWithTikTokAuthorizationCode(this.buildDeps(), data);
  }

  async loginWithTikTokAccessToken(data: {
    accessToken: string;
    openId?: string;
    refreshToken?: string;
    expiresInSeconds?: number;
    ip?: string;
  }) {
    return loginWithTikTokAccessToken(this.buildDeps(), data);
  }

  async requestMagicLink(data: { email: string; redirectTo?: string; ip?: string }) {
    return requestMagicLink(this.buildDeps(), data);
  }

  async verifyMagicLink(token: string, ip?: string) {
    return verifyMagicLink(this.buildDeps(), token, ip);
  }

  async sendWhatsAppCode(phone: string, ip?: string) {
    return sendWhatsAppCode(this.buildDeps(), phone, ip);
  }

  async verifyWhatsAppCode(phone: string, code: string, ip?: string) {
    return verifyWhatsAppCode(this.buildDeps(), phone, code, ip);
  }

  async forgotPassword(email: string, ip?: string) {
    return forgotPassword(this.buildDeps(), email, ip);
  }

  async resetPassword(token: string, newPassword: string, ip?: string) {
    return resetPassword(this.buildDeps(), token, newPassword, ip);
  }

  async sendVerificationEmail(agentId: string) {
    return sendVerificationEmail(this.buildDeps(), agentId);
  }

  async verifyEmail(token: string, ip?: string) {
    return verifyEmail(this.buildDeps(), token, ip);
  }

  async resendVerificationEmail(email: string, ip?: string) {
    return resendVerificationEmail(this.buildDeps(), email, ip);
  }
}
