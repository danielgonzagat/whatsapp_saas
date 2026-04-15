import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AdminAuditService } from '../../audit/admin-audit.service';
import { adminErrors } from '../../common/admin-api-errors';

/**
 * Admin-side KYC workflow. Drives the `Agent.kycStatus` state machine:
 *
 *   pending ──submit──▶ submitted ──approve──▶ approved
 *                                  ─reject ──▶ rejected ──reverify──▶ pending
 *
 * Each mutation writes one audit log row via AdminAuditService so the
 * global interceptor is not the only source of truth on this path. The
 * approve/reject operations also flip every pending KycDocument to the
 * matching status so the producer sees consistent state.
 */
@Injectable()
export class AdminKycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  async approveAgent(agentId: string, actorId: string, note: string | undefined): Promise<void> {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true, workspaceId: true, kycStatus: true },
    });
    if (!agent) throw adminErrors.userNotFound();

    await this.prisma.$transaction([
      this.prisma.agent.update({
        where: { id: agentId },
        data: {
          kycStatus: 'approved',
          kycApprovedAt: new Date(),
          kycRejectedReason: null,
        },
      }),
      this.prisma.kycDocument.updateMany({
        where: { agentId, status: 'pending' },
        data: {
          status: 'approved',
          reviewedAt: new Date(),
          rejectedReason: null,
        },
      }),
    ]);

    await this.audit.append({
      adminUserId: actorId,
      action: 'admin.kyc.approved',
      entityType: 'Agent',
      entityId: agentId,
      details: {
        workspaceId: agent.workspaceId,
        previousStatus: agent.kycStatus,
        note: note ?? null,
      },
    });
  }

  async rejectAgent(agentId: string, actorId: string, reason: string): Promise<void> {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true, workspaceId: true, kycStatus: true },
    });
    if (!agent) throw adminErrors.userNotFound();

    await this.prisma.$transaction([
      this.prisma.agent.update({
        where: { id: agentId },
        data: {
          kycStatus: 'rejected',
          kycRejectedReason: reason,
          kycApprovedAt: null,
        },
      }),
      this.prisma.kycDocument.updateMany({
        where: { agentId, status: 'pending' },
        data: {
          status: 'rejected',
          reviewedAt: new Date(),
          rejectedReason: reason,
        },
      }),
    ]);

    await this.audit.append({
      adminUserId: actorId,
      action: 'admin.kyc.rejected',
      entityType: 'Agent',
      entityId: agentId,
      details: {
        workspaceId: agent.workspaceId,
        previousStatus: agent.kycStatus,
        reason,
      },
    });
  }

  async reverifyAgent(agentId: string, actorId: string, reason: string): Promise<void> {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true, workspaceId: true, kycStatus: true },
    });
    if (!agent) throw adminErrors.userNotFound();

    await this.prisma.agent.update({
      where: { id: agentId },
      data: {
        kycStatus: 'pending',
        kycSubmittedAt: null,
        kycApprovedAt: null,
        kycRejectedReason: reason,
      },
    });

    await this.audit.append({
      adminUserId: actorId,
      action: 'admin.kyc.reverification_requested',
      entityType: 'Agent',
      entityId: agentId,
      details: {
        workspaceId: agent.workspaceId,
        previousStatus: agent.kycStatus,
        reason,
      },
    });
  }
}
