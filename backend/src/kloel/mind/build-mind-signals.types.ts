import type { AgentAssistService } from './knowledge/agent-assist.service';
import type { StructuredLogger } from '../../logging/structured-logger';
import type { AttentionService } from './attention.service';
import type { ValenceAggregatorService } from './valence-aggregator.service';
import type { MindBeliefService } from './inference/mind-belief.service';
import type { MindConceptService } from './memory/mind-concepts.service';
import type { MindPredictionService } from './mind-prediction.service';
import type { SelfHealthService } from '../self-awareness/self-health.service';
import type { SelfGapsService } from '../self-awareness/self-gaps.service';
import type { RiskClassService } from '../risk-class/risk-class.service';
import type { SpineEventRef } from './mind.types';
import type { KnowledgeBaseService } from './knowledge/knowledge-base.service';

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
  mindBeliefService?: Pick<MindBeliefService, 'getActiveBeliefs'>;
  mindConceptService?: Pick<MindConceptService, 'detect'>;
  mindPredictionService?: MindPredictionService;
  selfHealthService?: Pick<SelfHealthService, 'snapshot'>;
  selfGapsService?: Pick<SelfGapsService, 'diffRegistryVsDispatcher'>;
  riskClassService?: Pick<RiskClassService, 'classify'>;
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
  knowledgeBaseService?: Pick<KnowledgeBaseService, 'search'>;
  agentAssistService?: Pick<AgentAssistService, 'suggestActions'>;
  /**
   * Optional in-process spine emitter (PI P2-1). When present, the live
   * reply's just-emitted percepts (recentEventsAsRef) are merged ALONGSIDE
   * the persisted autopilotEvent rows into the attention window, so a reply's
   * own emitted cognition informs its own perception window (not only the
   * next EVERY_MINUTE tick). Read-path only — never written to.
   */
  spineEmitterService?: {
    recentEventsAsRef?: (limit?: number) => readonly SpineEventRef[];
  };
  logger: Pick<StructuredLogger, 'warn'>;
}
