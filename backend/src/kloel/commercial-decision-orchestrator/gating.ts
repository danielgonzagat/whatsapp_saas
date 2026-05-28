import { PrismaService } from '../../prisma/prisma.service';
import type { InboundDecision } from './types';

type GatingResult =
  | { mode: 'legacy'; decision: InboundDecision }
  | { mode: 'shadow' | 'active'; pipelineMode: 'shadow' | 'active' };

const AUTO_GRADUATE_DECISION_TYPES = ['tom', 'message_format', 'objection_response'] as const;
const AUTO_GRADUATE_MIN_POSITIVE_OUTCOMES = 30;
const AUTO_GRADUATE_WINDOW_DAYS = 30;

function autoGraduateEnabled(): boolean {
  return process.env.COMMERCIAL_ORCHESTRATOR_AUTO_GRADUATE === 'true';
}

async function evaluateAutoGraduation(
  prisma: PrismaService,
  workspaceId: string,
): Promise<'shadow' | 'active'> {
  if (!autoGraduateEnabled()) {
    return 'shadow';
  }

  const since = new Date(Date.now() - AUTO_GRADUATE_WINDOW_DAYS * 86400 * 1000);

  const positiveCount = await prisma.decisionOutcome.count({
    where: {
      workspaceId,
      decisionType: { in: [...AUTO_GRADUATE_DECISION_TYPES] },
      wonVsBaseline: true,
      outcomeAt: { not: null, gte: since },
    },
  });

  return positiveCount >= AUTO_GRADUATE_MIN_POSITIVE_OUTCOMES ? 'active' : 'shadow';
}

export async function checkPipelineGate(
  prisma: PrismaService,
  workspaceId: string,
  channel: string,
): Promise<GatingResult> {
  const pipelineState = await prisma.pipelineState.findUnique({
    where: { workspaceId },
    select: { state: true, fallbackRate1h: true },
  });
  let pipelineMode = (pipelineState?.state ?? 'legacy') as 'legacy' | 'shadow' | 'active';

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

  if (pipelineMode === 'shadow') {
    const graduated = await evaluateAutoGraduation(prisma, workspaceId);
    if (graduated === 'active') {
      await prisma.pipelineState.update({
        where: { workspaceId },
        data: { state: 'active', transitionedAt: new Date() },
      });
      pipelineMode = 'active';
    }
  }

  return { mode: pipelineMode, pipelineMode };
}
