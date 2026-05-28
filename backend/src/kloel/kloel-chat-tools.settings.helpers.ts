import type { PrismaService } from '../prisma/prisma.service';
import type { ToolResult } from './kloel-chat-tools.agent-runtime.helpers';

export async function runGetAffiliateConfig(
  prisma: PrismaService,
  workspaceId: string,
): Promise<ToolResult> {
  try {
    const [partners] = await Promise.all([
      prisma.affiliatePartner.findMany({
        where: { workspaceId },
        select: {
          id: true,
          partnerName: true,
          commissionRate: true,
          commissionType: true,
          status: true,
          totalSales: true,
          totalCommission: true,
          affiliateCode: true,
        },
        orderBy: { totalSales: 'desc' },
        take: 10,
      }),
    ]);
    return {
      success: true,
      partners,
      partnerCount: partners.length,
      activeCount: partners.filter((p) => p.status === 'ACTIVE').length,
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'unknown_error' };
  }
}

export async function runGetSettings(
  prisma: PrismaService,
  workspaceId: string,
): Promise<ToolResult> {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, providerSettings: true },
    });
    return { success: true, settings: workspace?.providerSettings ?? {}, name: workspace?.name };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'unknown_error' };
  }
}
