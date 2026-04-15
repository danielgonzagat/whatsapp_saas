import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AdminUser, AdminUserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import { adminErrors } from '../common/admin-api-errors';
import { generateRawRefreshToken, sha256Hex } from '../common/admin-crypto';
import type { AdminJwtPayload, AdminTokenScope, AuthenticatedAdmin } from './admin-token.types';
import { AdminLoginAttemptsService } from './admin-login-attempts.service';
import { AdminMfaService } from './admin-mfa.service';

interface SignScopeOptions {
  sub: string;
  scope: AdminTokenScope;
  ttlSeconds: number;
  sessionId?: string;
}

const TTL = {
  PASSWORD_CHANGE: 5 * 60,
  MFA_SETUP: 10 * 60,
  MFA_VERIFY: 5 * 60,
  ACCESS: 15 * 60,
} as const;

const BCRYPT_WORK_FACTOR = 12;

export interface LoginStateResponse {
  state: 'password_change_required' | 'mfa_setup_required' | 'mfa_required';
  token: string;
}

export interface AuthenticatedSession {
  state: 'authenticated';
  accessToken: string;
  refreshToken: string;
  admin: {
    id: string;
    name: string;
    email: string;
    role: AdminUser['role'];
  };
}

export interface MfaSetupPayload {
  otpauthUrl: string;
  qrDataUrl: string;
}

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);
  private readonly sessionTtlHours: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mfa: AdminMfaService,
    private readonly attempts: AdminLoginAttemptsService,
    private readonly audit: AdminAuditService,
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

  // ──────────────────────────────────────────────────────────
  // Login state machine
  // ──────────────────────────────────────────────────────────

  async login(
    email: string,
    password: string,
    ip: string,
    userAgent: string,
  ): Promise<LoginStateResponse | AuthenticatedSession> {
    const normalizedEmail = email.trim().toLowerCase();

    if (await this.attempts.isLocked(normalizedEmail, ip)) {
      await this.audit.append({
        action: 'admin.auth.login.rate_limited',
        details: { email: normalizedEmail },
        ip,
        userAgent,
      });
      throw adminErrors.rateLimited();
    }

    const user = await this.prisma.adminUser.findUnique({
      where: { email: normalizedEmail },
    });
    if (!user) {
      await this.attempts.record(normalizedEmail, ip, false);
      await this.audit.append({
        action: 'admin.auth.login.unknown_email',
        details: { email: normalizedEmail },
        ip,
        userAgent,
      });
      throw adminErrors.invalidCredentials();
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw adminErrors.accountLocked(user.lockedUntil);
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      await this.attempts.record(normalizedEmail, ip, false);
      await this.prisma.adminUser.update({
        where: { id: user.id },
        data: { failedLoginCount: { increment: 1 } },
      });
      await this.audit.append({
        adminUserId: user.id,
        action: 'admin.auth.login.bad_password',
        ip,
        userAgent,
      });
      throw adminErrors.invalidCredentials();
    }

    if (user.status === AdminUserStatus.SUSPENDED) throw adminErrors.userSuspended();
    if (user.status === AdminUserStatus.DEACTIVATED) throw adminErrors.userDeactivated();

    await this.attempts.record(normalizedEmail, ip, true);
    await this.prisma.adminUser.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });

    if (user.passwordChangeRequired) {
      const changeToken = await this.signScoped({
        sub: user.id,
        scope: 'password_change',
        ttlSeconds: TTL.PASSWORD_CHANGE,
      });
      await this.audit.append({
        adminUserId: user.id,
        action: 'admin.auth.login.password_change_required',
        ip,
        userAgent,
      });
      return { state: 'password_change_required', token: changeToken };
    }

    if (user.mfaPendingSetup || !user.mfaEnabled) {
      const setupToken = await this.signScoped({
        sub: user.id,
        scope: 'mfa_setup',
        ttlSeconds: TTL.MFA_SETUP,
      });
      await this.audit.append({
        adminUserId: user.id,
        action: 'admin.auth.login.mfa_setup_required',
        ip,
        userAgent,
      });
      return { state: 'mfa_setup_required', token: setupToken };
    }

    const mfaToken = await this.signScoped({
      sub: user.id,
      scope: 'mfa_verify',
      ttlSeconds: TTL.MFA_VERIFY,
    });
    await this.audit.append({
      adminUserId: user.id,
      action: 'admin.auth.login.mfa_required',
      ip,
      userAgent,
    });
    return { state: 'mfa_required', token: mfaToken };
  }

  // ──────────────────────────────────────────────────────────
  // Password change (forced on first login)
  // ──────────────────────────────────────────────────────────

  async changePassword(
    admin: AuthenticatedAdmin,
    newPassword: string,
    ip: string,
    userAgent: string,
  ): Promise<LoginStateResponse> {
    if (admin.scope !== 'password_change') throw adminErrors.invalidToken();

    const hash = await bcrypt.hash(newPassword, BCRYPT_WORK_FACTOR);
    const user = await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { passwordHash: hash, passwordChangeRequired: false },
    });

    await this.audit.append({
      adminUserId: user.id,
      action: 'admin.auth.password_changed',
      ip,
      userAgent,
    });

    if (user.mfaPendingSetup || !user.mfaEnabled) {
      const setupToken = await this.signScoped({
        sub: user.id,
        scope: 'mfa_setup',
        ttlSeconds: TTL.MFA_SETUP,
      });
      return { state: 'mfa_setup_required', token: setupToken };
    }
    const mfaToken = await this.signScoped({
      sub: user.id,
      scope: 'mfa_verify',
      ttlSeconds: TTL.MFA_VERIFY,
    });
    return { state: 'mfa_required', token: mfaToken };
  }

  // ──────────────────────────────────────────────────────────
  // MFA setup / verify
  // ──────────────────────────────────────────────────────────

  async setupMfa(admin: AuthenticatedAdmin): Promise<MfaSetupPayload> {
    if (admin.scope !== 'mfa_setup') throw adminErrors.invalidToken();
    const { encryptedSecret, otpauthUrl, qrDataUrl } = await this.mfa.createSetup(admin.email);
    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { mfaSecret: encryptedSecret, mfaEnabled: false, mfaPendingSetup: true },
    });
    await this.audit.append({
      adminUserId: admin.id,
      action: 'admin.auth.mfa.setup_started',
    });
    return { otpauthUrl, qrDataUrl };
  }

  async verifyInitialMfa(
    admin: AuthenticatedAdmin,
    code: string,
    ip: string,
    userAgent: string,
  ): Promise<AuthenticatedSession> {
    if (admin.scope !== 'mfa_setup') throw adminErrors.invalidToken();
    const user = await this.prisma.adminUser.findUnique({ where: { id: admin.id } });
    if (!user) throw adminErrors.invalidToken();
    this.mfa.verifyCode(user.mfaSecret, code);

    const updated = await this.prisma.adminUser.update({
      where: { id: user.id },
      data: { mfaEnabled: true, mfaPendingSetup: false, lastLoginAt: new Date() },
    });
    await this.audit.append({
      adminUserId: user.id,
      action: 'admin.auth.mfa.enabled',
      ip,
      userAgent,
    });
    return this.createFullSession(updated, ip, userAgent);
  }

  async verifyMfa(
    admin: AuthenticatedAdmin,
    code: string,
    ip: string,
    userAgent: string,
  ): Promise<AuthenticatedSession> {
    if (admin.scope !== 'mfa_verify') throw adminErrors.invalidToken();
    const user = await this.prisma.adminUser.findUnique({ where: { id: admin.id } });
    if (!user) throw adminErrors.invalidToken();
    this.mfa.verifyCode(user.mfaSecret, code);

    const updated = await this.prisma.adminUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await this.audit.append({
      adminUserId: user.id,
      action: 'admin.auth.login.completed',
      ip,
      userAgent,
    });
    return this.createFullSession(updated, ip, userAgent);
  }

  // ──────────────────────────────────────────────────────────
  // Refresh + logout
  // ──────────────────────────────────────────────────────────

  async refresh(
    rawRefreshToken: string,
    ip: string,
    userAgent: string,
  ): Promise<AuthenticatedSession> {
    const tokenHash = sha256Hex(rawRefreshToken);
    const session = await this.prisma.adminSession.findUnique({
      where: { tokenHash },
      include: { adminUser: true },
    });
    if (!session || session.revokedAt) throw adminErrors.invalidToken();
    if (session.expiresAt.getTime() < Date.now()) throw adminErrors.tokenExpired();
    if (session.adminUser.status !== AdminUserStatus.ACTIVE) {
      throw adminErrors.userSuspended();
    }

    const newRawRefresh = generateRawRefreshToken();
    const newHash = sha256Hex(newRawRefresh);
    const newExpiresAt = new Date(Date.now() + this.sessionTtlHours * 60 * 60 * 1000);

    const rotated = await this.prisma.adminSession.update({
      where: { id: session.id },
      data: { tokenHash: newHash, expiresAt: newExpiresAt, ip, userAgent },
    });

    const accessToken = await this.signScoped({
      sub: session.adminUser.id,
      scope: 'full',
      ttlSeconds: TTL.ACCESS,
      sessionId: rotated.id,
    });

    await this.audit.append({
      adminUserId: session.adminUser.id,
      action: 'admin.auth.session.refreshed',
      ip,
      userAgent,
    });

    return {
      state: 'authenticated',
      accessToken,
      refreshToken: newRawRefresh,
      admin: {
        id: session.adminUser.id,
        name: session.adminUser.name,
        email: session.adminUser.email,
        role: session.adminUser.role,
      },
    };
  }

  async logout(admin: AuthenticatedAdmin, ip: string, userAgent: string): Promise<void> {
    if (!admin.sessionId) return;
    await this.prisma.adminSession.updateMany({
      where: { id: admin.sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.append({
      adminUserId: admin.id,
      action: 'admin.auth.logout',
      ip,
      userAgent,
    });
  }

  // ──────────────────────────────────────────────────────────
  // Internals
  // ──────────────────────────────────────────────────────────

  private async signScoped(options: SignScopeOptions): Promise<string> {
    const payload: Omit<AdminJwtPayload, 'iat' | 'exp'> = {
      sub: options.sub,
      scope: options.scope,
      aud: 'adm.kloel.com',
      sid: options.sessionId,
    };
    return this.jwt.signAsync(payload, { expiresIn: options.ttlSeconds });
  }

  private async createFullSession(
    user: AdminUser,
    ip: string,
    userAgent: string,
  ): Promise<AuthenticatedSession> {
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
      ttlSeconds: TTL.ACCESS,
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

  /** Hash a password with the service's configured work factor. */
  static async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_WORK_FACTOR);
  }
}
