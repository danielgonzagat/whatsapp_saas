import { StructuredLogger } from '../../logging/structured-logger';
import { SpineEventRef } from './mind.types';
import { AttentionService } from './attention.service';
import { ValenceAggregatorService } from './valence-aggregator.service';
import { MindBeliefService } from './inference/mind-belief.service';
import { MindConceptService } from './memory/mind-concepts.service';
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

  return mindSignals;
}
