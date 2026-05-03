import { Injectable } from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import { adminErrors } from '../common/admin-api-errors';

/** Admin sessions service. */
@Injectable()
export class AdminSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  /** List own. */
  // PULSE_OK: bounded by single admin user's sessions
  async listOwn(adminUserId: string) {
    return this.prisma.adminSession.findMany({
      where: { adminUserId },
      orderBy: [{ revokedAt: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        ip: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
  }

  /** List for user. */
  // PULSE_OK: bounded by single target user's sessions
  async listForUser(targetId: string) {
    return this.prisma.adminSession.findMany({
      where: { adminUserId: targetId },
      orderBy: [{ revokedAt: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        adminUserId: true,
        ip: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
  }

  /** Revoke. */
  async revoke(sessionId: string, actorId: string, actorRole: AdminRole): Promise<void> {
    const session = await this.prisma.adminSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw adminErrors.sessionNotFound();
    }

    const isOwnSession = session.adminUserId === actorId;
    const isOwner = actorRole === AdminRole.OWNER;
    if (!isOwnSession && !isOwner) {
      throw adminErrors.cannotRevokeOther();
    }

    if (session.revokedAt) {
      return;
    }

    await this.prisma.$transaction(
      async (tx) => {
        await tx.adminSession.update({
          where: { id: sessionId },
          data: { revokedAt: new Date() },
        });

        await tx.adminAuditLog.create({
          data: {
            adminUserId: actorId,
            action: 'admin.sessions.revoked',
            entityType: 'AdminSession',
            entityId: sessionId,
            details: { targetAdminId: session.adminUserId, byOwner: !isOwnSession && isOwner },
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }
}
