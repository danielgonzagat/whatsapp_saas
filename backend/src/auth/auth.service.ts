import { InjectRedis } from '@nestjs-modules/ioredis';
import { BadRequestException, forwardRef, Inject, Injectable, Optional } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt'; // PULSE_OK: reasonable expiry (30m)
import type { Redis } from 'ioredis';
import { WelcomeAndOnboardingEmailService } from '../notifications/welcome-onboarding-email.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthOAuthService } from './auth-oauth.service';
import { AuthPartnerService } from './auth-partner.service';
import { AuthVerificationService } from './auth-verification.service';
import { assertAgentCanAuthenticate } from './auth.helpers';
import { AuthPasswordService } from './auth.password.service';
import { AuthTokenService } from './auth.token.service';
import { GoogleVerifiedProfile } from './google-auth.service';
import { RateLimitService } from './rate-limit.service';

/** Auth service — public entry point that composes the extracted token / password
 *  collaborators and delegates verification / OAuth / partner-invite flows to
 *  dedicated sub-services. The DI surface (constructor signature) is preserved so
 *  existing call sites and unit tests continue to wire it the same way. */
@Injectable()
export class AuthService {
  private readonly rateLimitService: RateLimitService;
  private readonly tokenService: AuthTokenService;
  private readonly passwordService: AuthPasswordService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly authOAuthService: AuthOAuthService,
    private readonly authPartnerService: AuthPartnerService,
    private readonly authVerificationService: AuthVerificationService,
    @Optional() @InjectRedis() private readonly redis?: Redis,
    @Optional()
    @Inject(forwardRef(() => WelcomeAndOnboardingEmailService))
    private readonly welcomeEmailService?: WelcomeAndOnboardingEmailService,
  ) {
    this.rateLimitService = new RateLimitService(this.redis || null);
    this.tokenService = new AuthTokenService(this.prisma, this.jwt);
    this.passwordService = new AuthPasswordService(
      this.prisma,
      this.tokenService,
      this.authPartnerService,
      this.rateLimitService,
    );
  }

  /** Issue tokens for agent id. */
  async issueTokensForAgentId(agentId: string) {
    return this.tokenService.issueTokensForAgentId(agentId);
  }

  /** Check email. */
  async checkEmail(email: string): Promise<{ exists: boolean }> {
    return this.passwordService.checkEmail(email);
  }

  /** Create anonymous. */
  async createAnonymous(ip?: string) {
    return this.passwordService.createAnonymous(ip);
  }

  /** Register. */
  async register(data: {
    name?: string;
    email: string;
    password: string;
    workspaceName?: string;
    affiliateInviteToken?: string;
    ip?: string;
  }) {
    const result = await this.passwordService.register(data);
    this.triggerWelcomeFlow(
      result?.user?.email ?? data.email,
      result?.user?.name ?? data.name ?? 'Usuario',
      result?.workspace?.name ?? data.workspaceName ?? 'Meu Workspace',
    );
    return result;
  }

  /** Login. */
  async login(data: { email: string; password: string; ip?: string }) {
    return this.passwordService.login(data);
  }

  /** Refresh. */
  async refresh(refreshToken: string) {
    return this.tokenService.refresh(refreshToken);
  }

  /**
   * Endpoint legado. Bloqueia payload OAuth "cru" vindo do cliente.
   */
  async oauthLogin(data: {
    provider?: 'google' | 'apple';
    providerId?: string;
    email?: string;
    name?: string;
    image?: string;
    credential?: string;
    ip?: string;
  }) {
    if (data?.provider === 'google' && data?.credential) {
      return this.loginWithGoogleCredential({ credential: data.credential, ip: data.ip });
    }
    throw new BadRequestException({
      error: 'legacy_oauth_payload_disabled',
      message: 'Use o endpoint seguro /auth/oauth/google com a credential emitida pelo Google.',
    });
  }

  /** Login with google credential. */
  async loginWithGoogleCredential(data: { credential: string; ip?: string }) {
    const profile = await this.authOAuthService.verifyGoogleCredential(data);
    return this.completeTrustedOAuthLogin(profile);
  }

  /** Login with facebook access token. */
  async loginWithFacebookAccessToken(data: { accessToken: string; userId?: string; ip?: string }) {
    const profile = await this.authOAuthService.verifyFacebookAccessToken(data);
    return this.completeTrustedOAuthLogin(profile);
  }

  /** Login with apple credential. */
  async loginWithAppleCredential(data: {
    identityToken?: string;
    authorizationCode?: string;
    redirectUri?: string;
    user?: { name?: { firstName?: string; lastName?: string }; email?: string };
    ip?: string;
  }) {
    const profile = await this.authOAuthService.verifyAppleIdentityToken(data);
    return this.completeTrustedOAuthLogin(profile);
  }

  /** Login with TikTok authorization code. */
  async loginWithTikTokAuthorizationCode(data: {
    code: string;
    redirectUri?: string;
    ip?: string;
  }) {
    const profile = await this.authOAuthService.verifyTikTokAuthorizationCode(data);
    return this.completeTrustedOAuthLogin(profile);
  }

  /** Login with TikTok access token. */
  async loginWithTikTokAccessToken(data: {
    accessToken: string;
    openId?: string;
    refreshToken?: string;
    expiresInSeconds?: number;
    ip?: string;
  }) {
    const profile = await this.authOAuthService.verifyTikTokAccessToken(data);
    return this.completeTrustedOAuthLogin(profile);
  }

  private async completeTrustedOAuthLogin(profile: GoogleVerifiedProfile) {
    const { agent, isNewUser } = await this.authOAuthService.resolveAgentForProfile(profile);
    assertAgentCanAuthenticate(agent);
    const result = await this.tokenService.issueTokens(agent, { isNewUser });
    if (isNewUser) {
      this.triggerWelcomeFlow(
        result?.user?.email ?? agent.email,
        result?.user?.name ?? agent.name ?? 'Usuario',
        result?.workspace?.name ?? 'Meu Workspace',
      );
    }
    return result;
  }

  // =========================================
  // MAGIC LINK — delegated to AuthVerificationService
  // =========================================

  /** Request magic link. */
  async requestMagicLink(data: { email: string; redirectTo?: string; ip?: string }) {
    return this.authVerificationService.requestMagicLink(data);
  }

  /** Verify magic link. */
  async verifyMagicLink(token: string, ip?: string) {
    const { agent, isNewUser, redirectTo } = await this.authVerificationService.verifyMagicLink(
      token,
      ip,
    );
    assertAgentCanAuthenticate(agent);
    const result = {
      ...(await this.tokenService.issueTokens(agent, { isNewUser })),
      redirectTo,
    };
    if (isNewUser) {
      this.triggerWelcomeFlow(
        result?.user?.email ?? agent.email,
        result?.user?.name ?? agent.name ?? 'Usuario',
        result?.workspace?.name ?? 'Meu Workspace',
      );
    }
    return result;
  }

  // =========================================
  // WHATSAPP OTP — delegated to AuthVerificationService
  // =========================================

  /** Send WhatsApp OTP. */
  async sendWhatsAppCode(phone: string, ip?: string) {
    return this.authVerificationService.sendWhatsAppCode(phone, ip);
  }

  /** Verify WhatsApp OTP and issue tokens. */
  async verifyWhatsAppCode(phone: string, code: string, ip?: string) {
    const agent = await this.authVerificationService.verifyWhatsAppCode(phone, code, ip);
    return this.tokenService.issueTokens(agent);
  }

  // =========================================
  // PASSWORD RECOVERY — delegated to AuthVerificationService
  // =========================================

  /** Forgot password. */
  async forgotPassword(email: string, ip?: string) {
    return this.authVerificationService.forgotPassword(email, ip);
  }

  /** Reset password. */
  async resetPassword(token: string, newPassword: string, ip?: string) {
    return this.authVerificationService.resetPassword(token, newPassword, ip);
  }

  // =========================================
  // EMAIL VERIFICATION — delegated to AuthVerificationService
  // =========================================

  /** Send verification email. */
  async sendVerificationEmail(agentId: string) {
    return this.authVerificationService.sendVerificationEmail(agentId);
  }

  /** Verify email. */
  async verifyEmail(token: string, ip?: string) {
    return this.authVerificationService.verifyEmail(token, ip);
  }

  /** Resend verification email. */
  async resendVerificationEmail(email: string, ip?: string) {
    return this.authVerificationService.resendVerificationEmail(email, ip);
  }

  /**
   * Fire-and-forget welcome email + onboarding sequence scheduling.
   * Errors are caught and logged — never blocks the auth response.
   */
  private triggerWelcomeFlow(email: string, name: string, workspaceName: string) {
    if (!this.welcomeEmailService) {
      return;
    }
    void this.welcomeEmailService.sendWelcomeEmail(email, name, workspaceName);
    void this.welcomeEmailService.scheduleOnboardingSequence(email, name);
  }
}
