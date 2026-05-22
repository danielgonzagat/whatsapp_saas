import { PrismaService } from '../../prisma/prisma.service';
import type { InboundDecision } from './types';

type GatingResult =
  | { mode: 'legacy'; decision: InboundDecision }
  | { mode: 'shadow' | 'active'; pipelineMode: 'shadow' | 'active' };

export async function checkPipelineGate(
  prisma: PrismaService,
  workspaceId: string,
  channel: string,
): Promise<GatingResult> {
  const pipelineState = await prisma.pipelineState.findUnique({
    where: { workspaceId },
    select: { state: true, fallbackRate1h: true },
  });
  const pipelineMode = (pipelineState?.state ?? 'legacy') as 'legacy' | 'shadow' | 'active';

  if (pipelineMode === 'legacy') {
    return {
      mode: 'legacy',
      decision: {
        actions: [],
        concepts: [],
        trace: {
          channel,
          pipelineState: 'legacy',
          skipped: true,
          delegatedToLegacy: true,
        },
      },
    };
  }

  return { mode: pipelineMode, pipelineMode };
}
