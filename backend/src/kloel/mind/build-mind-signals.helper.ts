import { StructuredLogger } from '../../logging/structured-logger';
import { SpineEventRef } from './mind.types';
import { AttentionService } from './attention.service';
import { ValenceAggregatorService } from './valence-aggregator.service';
import { MindBeliefService } from './inference/mind-belief.service';
import { MindConceptService } from './memory/mind-concepts.service';
import type { SelfHealthService } from '../self-awareness/self-health.service';
import type { SelfGapsService } from '../self-awareness/self-gaps.service';
/** Minimal prisma surface needed by the helper — only autopilotEvent queries. */
export interface MindSignalsPrisma {
  autopilotEvent: {
    findMany(args: {
      where: { workspaceId: string; createdAt: { gte: Date } };
      orderBy: { createdAt: 'desc' };
      take: number;
      select: { id: true; intent: true; action: true; createdAt: true };
    }): Promise<
      Array<{ id: string; intent: string | null; action: string | null; createdAt: Date }>
    >;
  };
}

export interface BuildMindSignalsDeps {
  prisma: MindSignalsPrisma;
  attentionService?: AttentionService;
  valenceAggregatorService?: ValenceAggregatorService;
  mindBeliefService?: MindBeliefService;
  mindConceptService?: MindConceptService;
  selfHealthService?: SelfHealthService;
  selfGapsService?: SelfGapsService;
  logger: Pick<StructuredLogger, 'warn'>;
}
/**
 * Build mindSignals for injection into LLM prompts.
 * Extracted from KloelReplyEngineService.buildChatModelMessages (K3/K4) so
 * conversational-onboarding can share the same wiring (K5).
 */
export async function buildMindSignals(
  deps: BuildMindSignalsDeps,
  workspaceId: string,
  userMessage: string,
): Promise<Record<string, unknown>> {
  const mindSignals: Record<string, unknown> = {};

  // ── Attention + Valence (PI-k4) ──────────────────────────────────
  if (deps.attentionService && deps.valenceAggregatorService) {
    try {
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
      let recentEvents: SpineEventRef[] = [];

      try {
        const rows = await Promise.race([
          deps.prisma.autopilotEvent.findMany({
            where: {
              workspaceId,
              createdAt: { gte: thirtyMinAgo },
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
            select: { id: true, intent: true, action: true, createdAt: true },
          }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 50)),
        ]);

        recentEvents = rows.map((r) => ({
          eventId: r.id,
          eventName: r.intent || r.action || 'unknown',
          workspaceId,
          occurredAt: r.createdAt.toISOString(),
          truthMode: 'observed' as const,
        }));
      } catch (error: unknown) {
        deps.logger.warn('kloel_event_source_timeout', {
          reason: error instanceof Error ? error.message : 'unknown error',
        });
      }

      const attention = deps.attentionService.allocate(recentEvents, {
        nowMs: Date.now(),
        halfLifeMinutes: 30,
      });

      Object.assign(mindSignals, {
        attention,
        source: 'autopilot_events',
        eventCount: recentEvents.length,
      });
    } catch (error: unknown) {
      deps.logger.warn('kloel_mind_signal_skipped', {
        reason: error instanceof Error ? error.message : 'unknown error',
      });
    }
  } else {
    mindSignals.status = 'no_services';
  }

  // ── Beliefs (PI-k4) ─────────────────────────────────────────────
  if (deps.mindBeliefService) {
    try {
      const beliefs = await Promise.race([
        deps.mindBeliefService.getActiveBeliefs(workspaceId),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('kloel_mind_belief_timeout')), 100),
        ),
      ]);
      mindSignals.beliefs = beliefs.map((b) => ({
        subject: b.subject,
        predicate: b.predicate,
        mean: b.mean,
        confidence: 1 / (1 + b.variance),
      }));
    } catch (error: unknown) {
      deps.logger.warn('kloel_mind_belief_skipped', {
        reason: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }

  // ── Concept detection (PI-k4) ────────────────────────────────────
  if (deps.mindConceptService) {
    try {
      const detections = await Promise.race([
        deps.mindConceptService.detect({
          workspaceId,
          text: userMessage,
          subject: 'kloel_chat',
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('MindConceptService.detect timed out after 200ms')),
            200,
          ),
        ),
      ]);
      mindSignals.concepts = detections
        .slice(0, 5)
        .map((d: { concept: string; confidence: number }) => ({
          concept: d.concept,
          confidence: d.confidence,
        }));
    } catch (error: unknown) {
      deps.logger.warn('kloel_mind_concept_skipped', {
        reason: error instanceof Error ? error.message : 'unknown error',
      });
      mindSignals.concepts = [];
    }
  } else {
    mindSignals.concepts = [];
  }

  // ── SelfModel (PI-k7) ────────────────────────────────────────────
  if (deps.selfHealthService || deps.selfGapsService) {
    try {
      const selfModel: Record<string, unknown> = {};

      let healthSnap: Awaited<ReturnType<SelfHealthService['snapshot']>> | null = null;
      if (deps.selfHealthService) {
        try {
          healthSnap = await Promise.race([
            deps.selfHealthService.snapshot(workspaceId),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('kloel_self_health_timeout')), 50),
            ),
          ]);
        } catch (healthErr: unknown) {
          deps.logger.warn('kloel_self_health_skipped', {
            reason: healthErr instanceof Error ? healthErr.message : 'unknown error',
          });
        }
      }

      let gapsResult: ReturnType<SelfGapsService['diffRegistryVsDispatcher']> | null = null;
      if (deps.selfGapsService) {
        try {
          gapsResult = deps.selfGapsService.diffRegistryVsDispatcher();
        } catch (gapsErr: unknown) {
          deps.logger.warn('kloel_self_gaps_skipped', {
            reason: gapsErr instanceof Error ? gapsErr.message : 'unknown error',
          });
        }
      }

      let lastFailureKind: string | null = null;
      if (healthSnap) {
        if (healthSnap.db === 'down') {
          lastFailureKind = 'db';
        } else if (healthSnap.redis === 'down') {
          lastFailureKind = 'redis';
        } else if (healthSnap.whatsapp === 'disconnected') {
          lastFailureKind = 'whatsapp';
        } else if (healthSnap.llm === 'degraded') {
          lastFailureKind = 'llm';
        }
      }

      selfModel.pulseHealth = healthSnap;
      selfModel.knownGapsCount = gapsResult?.unwired?.length ?? 0;
      selfModel.lastFailureKind = lastFailureKind;

      mindSignals.selfModel = selfModel;
    } catch (error: unknown) {
      deps.logger.warn('kloel_self_model_skipped', {
        reason: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }

  return mindSignals;
}
