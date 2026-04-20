import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { type AdminRole, AdminUserStatus } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../../../prisma/prisma.service';
import { adminErrors } from '../../common/admin-api-errors';
import type { AdminJwtPayload, AuthenticatedAdmin } from '../admin-token.types';
import { ADMIN_PUBLIC_KEY } from '../decorators/admin-public.decorator';
import { ALLOW_PENDING_MFA_KEY } from '../decorators/allow-pending-mfa.decorator';

const S_RE = /\s+/;

/**
 * Resolve the admin JWT secret at verify time. The app-level
 * JwtModule is registered globally with JWT_SECRET, which means
 * AdminAuthGuard may be constructed with the wrong JwtService
 * instance when NestJS resolves @Inject(JwtService). Passing an
 * explicit secret on verify bypasses the DI collision entirely.
 *
 * Keeps the same CI/test fallback as AdminGuardsModule.
 */
function resolveAdminJwtSecret(): string {
  const explicit = process.env.ADMIN_JWT_SECRET;
  if (explicit && explicit.length > 0) {
    return explicit;
  }
  if (process.env.NODE_ENV === 'test' || process.env.CI === 'true') {
    return 'kloel-admin-ci-test-secret-not-for-production';
  }
  throw new Error('ADMIN_JWT_SECRET must be set to verify admin tokens');
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }
  const parts = header.split(S_RE);
  if (parts.length !== 2) {
    return null;
  }
  if (parts[0].toLowerCase() !== 'bearer') {
    return null;
  }
  return parts[1] || null;
}

/**
 * Verifies the admin JWT, checks the session row, and attaches the
 * AuthenticatedAdmin snapshot to the request.
 *
 * The guard is tolerant of short-lived scope tokens (`password_change`,
 * `mfa_setup`, `mfa_verify`) ONLY on routes that opt in with
 * `@AllowPendingMfa()` or `@AdminPublic()`. Otherwise it demands a full
 * session token and will refuse the request if the admin's MFA is not yet
 * enabled or the password change is still pending.
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  /** Can activate. */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isPublicRoute(context)) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request & { admin?: AuthenticatedAdmin }>();
    const payload = await this.verifyBearer(req);
    this.assertScopeAllowed(context, payload);

    const admin = await this.loadAdmin(payload.sub);
    this.assertAdminStatus(admin);

    if (payload.scope === 'full') {
      this.assertFullScopeReadiness(admin);
      await this.assertSessionActive(payload.sid, admin.id);
    }

    req.admin = {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      sessionId: payload.sid ?? '',
      scope: payload.scope,
    };
    return true;
  }

  private isPublicRoute(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(ADMIN_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    );
  }

  private async verifyBearer(req: Request): Promise<AdminJwtPayload> {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      throw adminErrors.invalidToken();
    }
    try {
      return await this.jwt.verifyAsync<AdminJwtPayload>(token, {
        audience: 'adm.kloel.com',
        secret: resolveAdminJwtSecret(),
      });
    } catch {
      throw adminErrors.invalidToken();
    }
  }

  private assertScopeAllowed(context: ExecutionContext, payload: AdminJwtPayload): void {
    const allowPending = this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_MFA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!allowPending && payload.scope !== 'full') {
      throw adminErrors.invalidToken();
    }
  }

  private async loadAdmin(sub: string): Promise<AdminRowForGuard> {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: sub },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        mfaEnabled: true,
        mfaPendingSetup: true,
        passwordChangeRequired: true,
      },
    });
    if (!admin) {
      throw adminErrors.invalidToken();
    }
    return admin;
  }

  private assertAdminStatus(admin: AdminRowForGuard): void {
    if (admin.status === AdminUserStatus.SUSPENDED) {
      throw adminErrors.userSuspended();
    }
    if (admin.status === AdminUserStatus.DEACTIVATED) {
      throw adminErrors.userDeactivated();
    }
  }

  private assertFullScopeReadiness(admin: AdminRowForGuard): void {
    if (admin.passwordChangeRequired) {
      throw adminErrors.invalidToken();
    }
    if (!admin.mfaEnabled || admin.mfaPendingSetup) {
      throw adminErrors.invalidToken();
    }
  }

  private async assertSessionActive(
    sessionId: string | undefined,
    adminUserId: string,
  ): Promise<void> {
    if (!sessionId) {
      throw adminErrors.invalidToken();
    }
    const session = await this.prisma.adminSession.findUnique({
      where: { id: sessionId },
      select: { id: true, adminUserId: true, revokedAt: true, expiresAt: true },
    });
    if (!session || session.adminUserId !== adminUserId) {
      throw adminErrors.invalidToken();
    }
    if (session.revokedAt) {
      throw adminErrors.invalidToken();
    }
    if (session.expiresAt.getTime() < Date.now()) {
      throw adminErrors.tokenExpired();
    }
  }
}

type AdminRowForGuard = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  status: AdminUserStatus;
  mfaEnabled: boolean;
  mfaPendingSetup: boolean;
  passwordChangeRequired: boolean;
};
