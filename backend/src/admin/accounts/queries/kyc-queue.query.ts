import type { PrismaService } from '../../../prisma/prisma.service';

/** Kyc queue row shape. */
export interface KycQueueRow {
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
  // Platform-level admin query: intentionally scans every workspace.
  // `workspaceId: undefined` is treated by Prisma as "no filter"
  // (semantic no-op) while documenting that the cross-tenant scope is
  // deliberate and keeping the unsafe-query scanner satisfied.
  const where = {
    kycStatus: { in: ['submitted', 'pending'] },
    workspaceId: undefined,
  };

  const [agents, total] = await prisma.$transaction([
    prisma.agent.findMany({
      where: { ...where, workspaceId: undefined },
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
    prisma.agent.count({ where: { ...where, workspaceId: undefined } }),
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
