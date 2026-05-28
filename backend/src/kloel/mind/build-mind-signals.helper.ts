import type { AgentAssistService } from './knowledge/agent-assist.service';
import { StructuredLogger } from '../../logging/structured-logger';
import { SpineEventRef } from './mind.types';
import { AttentionService } from './attention.service';
import { ValenceAggregatorService } from './valence-aggregator.service';
import { MindBeliefService } from './inference/mind-belief.service';
import { MindConceptService } from './memory/mind-concepts.service';
import type { MindPredictionService } from './mind-prediction.service';
import type { SelfHealthService } from '../self-awareness/self-health.service';
import type { SelfGapsService } from '../self-awareness/self-gaps.service';
import type { RiskClassService } from '../risk-class/risk-class.service';
import type { ActionDescriptor } from '../risk-class/risk-class.types';

/** Infer an ActionDescriptor from user message and concept detections. */
function inferActionDescriptor(
  userMessage: string,
  concepts: Array<{ concept: string; confidence: number }> | undefined,
): ActionDescriptor {
  const normalized = userMessage.toLowerCase();

  const hasPayment =
    /\b(pagamento|pagar|pix|cobrança|boleto|cartão|preço|valor|desconto|cupom|reembolso|financial|payment)\b/.test(
      normalized,
    );
  const hasBlock = /\b(bloquear|suspender|banir|remover)\b/.test(normalized);
  const hasPublic = /\b(público|postar|publicar|anunciar|divulgar)\b/.test(normalized);

  const hasFinancialConcept = concepts?.some((c) =>
    /(price|payment|discount|financial|fee|charge|money)/i.test(c.concept),
  );

  if (hasBlock) {
    return { kind: 'lead_block', target: 'lead', reversible: true };
  }

  if (hasPayment || hasFinancialConcept) {
    return { kind: 'payment_action', target: 'lead', reversible: true, financialImpactCents: 0 };
  }

  if (hasPublic) {
    return { kind: 'public_response', target: 'public', reversible: true };
  }

  // Default: routine chat reply — lowest risk
  return { kind: 'message_send', target: 'lead', reversible: true };
}

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
  mindPredictionService?: MindPredictionService;
  selfHealthService?: SelfHealthService;
  selfGapsService?: SelfGapsService;
  riskClassService?: RiskClassService;
  mindVerbalizerService?: { narrate?: (workspaceId: string) => Promise<string> };
  mindBanditService?: {
    selectArm?: (
      workspaceId: string,
      decisionType: string,
    ) => Promise<{ arm: string; confidence: number; rationale?: string } | null>;
  };
  mindCaseMemoryService?: {
    findSimilarCases?: (
      workspaceId: string,
      context: Record<string, unknown>,
      limit: number,
    ) => Promise<Array<{ situation: string; outcome: string; similarity: number }>>;
  };
  mindGlobalPriorService?: {
    listTopPriors?: (
      limit: number,
    ) => Promise<Array<{ predicate: string; mean: number; samples: number }>>;
  };
  mindPerceptionService?: {
    perceive?: (ctx: { source: string; channel: string; raw: string; workspaceId: string }) => {
      subject: string;
      intent: string;
      salience: number;
      semanticContext: Record<string, unknown>;
    };
  };
  vectorService?: {
    similaritySearch: (
      workspaceId: string,
      query: string,
      k?: number,
    ) => Promise<Array<{ text: string; score: number }>>;
  };
  agentAssistService?: AgentAssistService;
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
  let rawConcepts: Array<{ concept: string; confidence: number }> | undefined;

  // ── Perception (PI-K16-C) — BEFORE attention/valence so other signals can reference it ──
  if (deps.mindPerceptionService?.perceive) {
    try {
      const perception = deps.mindPerceptionService.perceive({
        source: 'chat',
        channel: 'kloel_chat',
        raw: userMessage,
        workspaceId,
      });
      mindSignals.perception = {
        subject: perception.subject,
        intent: perception.intent,
        salience: perception.salience,
        semanticContext: perception.semanticContext,
      };
    } catch (error: unknown) {
      deps.logger.warn('kloel_mind_perception_skipped', {
        reason: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }

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

  // ── Global Priors — warm-start beliefs (PI-K16-A) ──────────────
  if (deps.mindGlobalPriorService?.listTopPriors) {
    try {
      const globalPriors = await deps.mindGlobalPriorService.listTopPriors(5);
      if (globalPriors.length > 0) {
        mindSignals.globalPriors = globalPriors;
      }
    } catch (error: unknown) {
      deps.logger.warn('kloel_global_prior_skipped', {
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
      rawConcepts = detections;
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

  // ── Semantic vector similarity (PI-K17-B) ──────────────────────
  if (deps.vectorService) {
    try {
      const semanticMatches = await deps.vectorService.similaritySearch(
        workspaceId,
        userMessage,
        5,
      );
      mindSignals.semanticMatches = semanticMatches;
    } catch (error: unknown) {
      deps.logger.warn('kloel_vector_search_skipped', {
        reason: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }

  // ── Case memory — prior similar cases (PI-K15-B) ──────────────
  if (deps.mindCaseMemoryService?.findSimilarCases) {
    try {
      const priorCases = await deps.mindCaseMemoryService.findSimilarCases(
        workspaceId,
        { userMessage },
        3,
      );
      mindSignals.priorCases = priorCases;
    } catch (error: unknown) {
      deps.logger.warn('kloel_mind_case_memory_skipped', {
        reason: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }

  // ── Agent Assist — heuristic action suggestions (PI-K18-A) ─────────
  if (deps.agentAssistService) {
    try {
      const suggestions = await deps.agentAssistService.suggestActions(
        workspaceId,
        userMessage,
        { concepts: rawConcepts, priorCases: mindSignals.priorCases },
      );
      if (suggestions.length > 0) {
        mindSignals.agentAssist = suggestions;
      }
    } catch (error: unknown) {
      deps.logger.warn('kloel_agent_assist_skipped', {
        reason: error instanceof Error ? error.message : 'unknown error',
      });
    }
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

  // ── RiskClass (PI-k8) ────────────────────────────────────────────
  if (deps.riskClassService) {
    try {
      const actionDesc = inferActionDescriptor(userMessage, rawConcepts);
      const classification = await Promise.race([
        Promise.resolve(deps.riskClassService.classify(actionDesc)),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('kloel_risk_class_timeout')), 30),
        ),
      ]);
      mindSignals.riskClass = {
        tier: classification.class,
        reasons: [...classification.rollback].slice(0, 3),
        recommendedAction: classification.autonomyMode,
      };
    } catch (error: unknown) {
      deps.logger.warn('kloel_risk_class_skipped', {
        reason: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }

  // ── Bandit strategy selection (PI-K14-B) ─────────────────────────
  if (deps.mindBanditService?.selectArm) {
    try {
      const banditResult = await deps.mindBanditService.selectArm(workspaceId, 'chat_strategy');
      if (banditResult) {
        mindSignals.strategy = {
          arm: banditResult.arm,
          confidence: banditResult.confidence,
          rationale: banditResult.rationale ?? `Bandit selected arm "${banditResult.arm}"`,
        };
      }
    } catch (error: unknown) {
      deps.logger.warn('kloel_mind_bandit_skipped', {
        reason: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }

  // ── Prediction (PI-K12-C) ────────────────────────────────────────
  if (deps.mindPredictionService) {
    try {
      const prediction = deps.mindPredictionService.predict({
        workspaceId,
        userMessage,
      });
      if (prediction) {
        mindSignals.prediction = {
          expected: prediction.expected,
          confidence: prediction.confidence,
        };
      }
    } catch (error: unknown) {
      deps.logger.warn('kloel_mind_prediction_skipped', {
        reason: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }

  // ── Verbalizer (PI-K12-A) ─────────────────────────────────────────
  if (deps.mindVerbalizerService?.narrate) {
    try {
      const summary = await deps.mindVerbalizerService.narrate(workspaceId);
      if (summary) {
        mindSignals.verbalSummary = summary;
      }
    } catch (error: unknown) {
      deps.logger.warn('kloel_mind_verbalizer_skipped', {
        reason: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }

  return mindSignals;
}
