import { Injectable, Logger } from '@nestjs/common';
import { AdminUser, AdminUserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import { adminErrors } from '../common/admin-api-errors';
import { sha256Hex } from '../common/admin-crypto';
import { AdminLoginAttemptsService } from './admin-login-attempts.service';
import { AdminMfaService } from './admin-mfa.service';
import {
  ADMIN_TOKEN_TTL,
  AdminSessionFactory,
  type AuthenticatedSessionPayload,
} from './admin-session-factory';
import type { AuthenticatedAdmin } from './admin-token.types';

const BCRYPT_WORK_FACTOR = 12;

export interface LoginStateResponse {
  state: 'password_change_required' | 'mfa_setup_required' | 'mfa_required';
  token: string;
}

export type AuthenticatedSession = AuthenticatedSessionPayload;

export interface MfaSetupPayload {
  otpauthUrl: string;
  qrDataUrl: string;
}

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mfa: AdminMfaService,
    private readonly attempts: AdminLoginAttemptsService,
    private readonly audit: AdminAuditService,
    private readonly sessionFactory: AdminSessionFactory,
  ) {}

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

    return this.nextStateFor(user, ip, userAgent);
  }

  private async nextStateFor(
    user: AdminUser,
    ip: string,
    userAgent: string,
  ): Promise<LoginStateResponse> {
    if (user.passwordChangeRequired) {
      const changeToken = await this.sessionFactory.signScoped({
        sub: user.id,
        scope: 'password_change',
        ttlSeconds: ADMIN_TOKEN_TTL.PASSWORD_CHANGE,
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
      const setupToken = await this.sessionFactory.signScoped({
        sub: user.id,
        scope: 'mfa_setup',
        ttlSeconds: ADMIN_TOKEN_TTL.MFA_SETUP,
      });
      await this.audit.append({
        adminUserId: user.id,
        action: 'admin.auth.login.mfa_setup_required',
        ip,
        userAgent,
      });
      return { state: 'mfa_setup_required', token: setupToken };
    }

    const mfaToken = await this.sessionFactory.signScoped({
      sub: user.id,
      scope: 'mfa_verify',
      ttlSeconds: ADMIN_TOKEN_TTL.MFA_VERIFY,
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

    return this.nextStateFor(user, ip, userAgent);
  }

  // ──────────────────────────────────────────────────────────
  // MFA setup / verify
  // ──────────────────────────────────────────────────────────

  async setupMfa(admin: AuthenticatedAdmin): Promise<MfaSetupPayload> {
    if (admin.scope !== 'mfa_setup') throw adminErrors.invalidToken();

    // If the user already has a pending MFA secret (from a previous
    // setup call that they're still in the middle of), reuse it.
    // Otherwise the frontend re-mount (React Strict Mode, refresh,
    // network retry) would generate a fresh secret and overwrite
    // the one they just scanned into their authenticator.
    const existing = await this.prisma.adminUser.findUnique({
      where: { id: admin.id },
      select: { mfaSecret: true, mfaEnabled: true, mfaPendingSetup: true },
    });

    let encryptedSecret: string;
    let otpauthUrl: string;
    let qrDataUrl: string;

    if (existing && existing.mfaSecret && existing.mfaPendingSetup && !existing.mfaEnabled) {
      const resumed = await this.mfa.resumeSetup(admin.email, existing.mfaSecret);
      encryptedSecret = resumed.encryptedSecret;
      otpauthUrl = resumed.otpauthUrl;
      qrDataUrl = resumed.qrDataUrl;
    } else {
      const fresh = await this.mfa.createSetup(admin.email);
      encryptedSecret = fresh.encryptedSecret;
      otpauthUrl = fresh.otpauthUrl;
      qrDataUrl = fresh.qrDataUrl;
      await this.prisma.adminUser.update({
        where: { id: admin.id },
        data: { mfaSecret: encryptedSecret, mfaEnabled: false, mfaPendingSetup: true },
      });
    }

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
    return this.sessionFactory.createFullSession(updated, ip, userAgent);
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
    return this.sessionFactory.createFullSession(updated, ip, userAgent);
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

    // Rotate: create a new full session row (old one gets revoked so the
    // previous refresh token can no longer be replayed). The operator sees
    // the rotation as "session renewed" in the audit log.
    await this.prisma.adminSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    const newSession = await this.sessionFactory.createFullSession(
      session.adminUser,
      ip,
      userAgent,
    );

    await this.audit.append({
      adminUserId: session.adminUser.id,
      action: 'admin.auth.session.refreshed',
      ip,
      userAgent,
    });

    return newSession;
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

  /** Hash a password with the service's configured work factor. */
  static async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_WORK_FACTOR);
  }
}
