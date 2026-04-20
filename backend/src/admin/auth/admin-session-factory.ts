import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AdminUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { generateRawRefreshToken, sha256Hex } from '../common/admin-crypto';
import type { AdminJwtPayload, AdminTokenScope } from './admin-token.types';

interface SignScopeOptions {
  sub: string;
  scope: AdminTokenScope;
  ttlSeconds: number;
  sessionId?: string;
}

/** Admin_token_ttl. */
export const ADMIN_TOKEN_TTL = {
  PASSWORD_CHANGE: 5 * 60,
  MFA_SETUP: 10 * 60,
  MFA_VERIFY: 5 * 60,
  ACCESS: 15 * 60,
} as const;

/** Authenticated session payload shape. */
export interface AuthenticatedSessionPayload {
  /** State property. */
  state: 'authenticated';
  /** Access token property. */
  accessToken: string;
  /** Refresh token property. */
  refreshToken: string;
  /** Admin property. */
  admin: {
    id: string;
    name: string;
    email: string;
    role: AdminUser['role'];
  };
}

/**
 * Factory for admin tokens and full-session persistence. Extracted from
 * AdminAuthService so the latter can focus on the login state machine
 * without also being the JWT/bcrypt factory.
 *
 * - signScoped: signs a JWT with a given scope and TTL, audience
 *   'adm.kloel.com'. Used for both short-lived transition tokens and
 *   full session access tokens.
 * - createFullSession: materializes an AdminSession row with a hashed
 *   refresh token (I-ADMIN-10), signs a full-scope access token bound
 *   to the session id, and returns the pair plus the sanitized admin
 *   snapshot.
 */
@Injectable()
export class AdminSessionFactory {
  private readonly sessionTtlHours: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.sessionTtlHours = Number.parseInt(
      config.get<string>('ADMIN_SESSION_TTL_HOURS') ?? '8',
      10,
    );
    if (!Number.isFinite(this.sessionTtlHours) || this.sessionTtlHours <= 0) {
      throw new Error('ADMIN_SESSION_TTL_HOURS must be a positive integer');
    }
  }

  /** Sign scoped. */
  async signScoped(options: SignScopeOptions): Promise<string> {
    // IMPORTANT: do NOT put `aud` in the payload. The JwtModule
    // config in AdminGuardsModule already sets `audience` via
    // signOptions; jwt.sign() throws "Bad audience option" if the
    // payload already carries an aud. The audience is enforced on
    // verify via JwtModule's verifyOptions.audience.
    const payload: Omit<AdminJwtPayload, 'iat' | 'exp' | 'aud'> = {
      sub: options.sub,
      scope: options.scope,
      sid: options.sessionId,
    };
    return this.jwt.signAsync(payload, { expiresIn: options.ttlSeconds });
  }

  /** Create full session. */
  async createFullSession(
    user: AdminUser,
    ip: string,
    userAgent: string,
  ): Promise<AuthenticatedSessionPayload> {
    const rawRefresh = generateRawRefreshToken();
    const tokenHash = sha256Hex(rawRefresh);
    const expiresAt = new Date(Date.now() + this.sessionTtlHours * 60 * 60 * 1000);

    const session = await this.prisma.adminSession.create({
      data: {
        adminUserId: user.id,
        tokenHash,
        ip,
        userAgent,
        expiresAt,
      },
    });

    const accessToken = await this.signScoped({
      sub: user.id,
      scope: 'full',
      ttlSeconds: ADMIN_TOKEN_TTL.ACCESS,
      sessionId: session.id,
    });

    return {
      state: 'authenticated',
      accessToken,
      refreshToken: rawRefresh,
      admin: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }
}
