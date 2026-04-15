import type { PrismaService } from '../../../prisma/prisma.service';

export interface KycQueueRow {
  agentId: string;
  agentName: string;
  agentEmail: string;
  workspaceId: string;
  workspaceName: string;
  kycStatus: string;
  kycSubmittedAt: string | null;
  documentCount: number;
}

export interface KycQueueResult {
  items: KycQueueRow[];
  total: number;
}

/**
 * Lists Agents whose KYC is pending/submitted review, oldest submission
 * first so operators naturally tackle the aging backlog.
 */
export async function listKycQueue(prisma: PrismaService, limit = 50): Promise<KycQueueResult> {
  const where = {
    kycStatus: { in: ['submitted', 'pending'] },
  };

  const [agents, total] = await prisma.$transaction([
    prisma.agent.findMany({
      where,
      orderBy: [{ kycSubmittedAt: 'asc' }, { createdAt: 'asc' }],
      take: Math.min(200, Math.max(1, limit)),
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
    prisma.agent.count({ where }),
  ]);

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
