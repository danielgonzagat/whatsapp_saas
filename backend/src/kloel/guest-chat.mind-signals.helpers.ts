import { buildMindSignals } from './mind/build-mind-signals.helper';
import { buildKloelMindSignalsDeps } from './kloel-reply-engine.cognitive-state.helpers';
import type { PrismaService } from '../prisma/prisma.service';
import type { StructuredLogger } from '../logging/structured-logger';
import type { AttentionService } from './mind/attention.service';
import type { ValenceAggregatorService } from './mind/valence-aggregator.service';
import type { MindBeliefService } from './mind/inference/mind-belief.service';
import type { MindConceptService } from './mind/memory/mind-concepts.service';
import type { SelfHealthService } from './self-awareness/self-health.service';
import type { SelfGapsService } from './self-awareness/self-gaps.service';
import type { RiskClassService } from './risk-class/risk-class.service';
/**
 * Build mindSignals for guest chat cognitive parity (PI-K19-A).
 * Extracted from GuestChatService to keep the service below the 500 LOC cap.
 */
export interface GuestMindSignalsServices {
  attentionService?: AttentionService;
  valenceAggregatorService?: ValenceAggregatorService;
  mindBeliefService?: MindBeliefService;
  mindConceptService?: MindConceptService;
  selfHealthService?: SelfHealthService;
  selfGapsService?: SelfGapsService;
  riskClassService?: RiskClassService;
}

export async function buildGuestMindSignals(
  prisma: PrismaService | undefined,
  services: GuestMindSignalsServices,
  logger: Pick<StructuredLogger, 'warn'>,
  workspaceId: string,
  userMessage: string,
): Promise<Record<string, unknown> | null> {
  if (!prisma) {
    return null;
  }

  const deps = buildKloelMindSignalsDeps(prisma, logger, {
    attentionService: services.attentionService,
    valenceAggregatorService: services.valenceAggregatorService,
    mindBeliefService: services.mindBeliefService,
    mindConceptService: services.mindConceptService,
    selfHealthService: services.selfHealthService,
    selfGapsService: services.selfGapsService,
    riskClassService: services.riskClassService,
  });

  try {
    return await buildMindSignals(deps, workspaceId, userMessage);
  } catch {
    return null;
  }
}
