import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { clampLimit } from '../../../common/pagination-clamp.pipe';

/** Kyc queue row shape. */
interface KycQueueRow {
  /** Agent id property. */
  agentId: string;
  /** Agent name property. */
  agentName: string;
  /** Agent email property. */
  agentEmail: string;
  /** Workspace id property. */
  workspaceId: string;
  /** Workspace name property. */
  workspaceName: string;
  /** Kyc status property. */
  kycStatus: string;
  /** Kyc submitted at property. */
  kycSubmittedAt: string | null;
  /** Document count property. */
  documentCount: number;
}

/** Kyc queue result shape. */
export interface KycQueueResult {
  /** Items property. */
  items: KycQueueRow[];
  /** Total property. */
  total: number;
}

/**
 * Lists Agents whose KYC is pending/submitted review, oldest submission
 * first so operators naturally tackle the aging backlog.
 */
export async function listKycQueue(prisma: PrismaService, limit = 50): Promise<KycQueueResult> {
  const where: Prisma.AgentWhereInput = {
    workspaceId: { not: '' },
    kycStatus: { in: ['submitted', 'pending'] },
  };

  const [agents, total] = await prisma.$transaction(
    [
      // @AdminGlobalOperation: KYC queue review spans all workspaces
      prisma.agent.findMany({
        where,
        orderBy: [{ kycSubmittedAt: 'asc' }, { createdAt: 'asc' }],
        take: clampLimit(limit, { default: 50, max: 200 }),
        select: {
          id: true,
          name: true,
          email: true,
          kycStatus: true,
          kycSubmittedAt: true,
          workspace: { select: { id: true, name: true } },
          _count: { select: { kycDocuments: true } },
        },
      }),
      // @AdminGlobalOperation: KYC queue total across all workspaces
      prisma.agent.count({ where }),
    ],
    { isolationLevel: 'ReadCommitted' },
  );

  return {
    items: agents.map((a) => ({
      agentId: a.id,
      agentName: a.name,
      agentEmail: a.email,
      workspaceId: a.workspace.id,
      workspaceName: a.workspace.name,
      kycStatus: a.kycStatus,
      kycSubmittedAt: a.kycSubmittedAt?.toISOString() ?? null,
      documentCount: a._count.kycDocuments,
    })),
    total,
  };
}
