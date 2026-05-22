import type { PrismaService } from '../prisma/prisma.service';
import type { ToolResult } from './kloel-chat-tools.agent-runtime.helpers';

export async function runGetAffiliateConfig(
  prisma: PrismaService,
  workspaceId: string,
): Promise<ToolResult> {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = (workspace?.providerSettings ?? {}) as Record<string, unknown>;
    return { success: true, config: settings.affiliate || {}, message: 'Config de afiliados.' };
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
