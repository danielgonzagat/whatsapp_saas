/**
 * @deprecated Use {@link ./mind/coordination/mind-commercial-graph.service.ts MindCommercialGraph}.
 * ADR-0013 Wave M1 alias window (4 weeks).
 *
 * @cluster Mind/Coordination
 * @canonical backend/src/kloel/mind/coordination/mind-commercial-graph.service.ts
 * @see docs/adr/0013-kloel-mind-unification.md
 */
import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { PrismaService } from '../prisma/prisma.service';
import { persistWorkspaceCommercialGraph } from './brain-commercial-graph.persistence';
import type {
  CommercialGraphEdge,
  CommercialGraphNode,
  CommercialGraphRecommendation,
  CommercialGraphWindow,
} from './brain-commercial-graph.types';

function incrementNode(nodes: Map<string, CommercialGraphNode>, node: CommercialGraphNode): void {
  const current = nodes.get(node.id);
  if (current) {
    current.weight += node.weight;
    return;
  }
  nodes.set(node.id, node);
}

function incrementEdge(edges: Map<string, CommercialGraphEdge>, edge: CommercialGraphEdge): void {
  const key = `${edge.from}:${edge.label}:${edge.to}`;
  const current = edges.get(key);
  if (current) {
    current.weight += edge.weight;
    return;
  }
  edges.set(key, edge);
}

const TOXIC_STATUSES = new Set(['failed', 'error', 'refunded', 'chargeback', 'cancelled']);

function outcomeWeight(status: string): number {
  if (status === 'executed' || status === 'completed') {
    return 1;
  }
  if (TOXIC_STATUSES.has(status)) {
    return -1;
  }
  return 0.25;
}

@Injectable()
export class BrainCommercialGraphService {
  private readonly logger = StructuredLogger.from(BrainCommercialGraphService.name);

  constructor(private readonly prisma: PrismaService) {}

  async buildWorkspaceGraph(workspaceId: string): Promise<{
    edges: CommercialGraphEdge[];
    nodes: CommercialGraphNode[];
    window: CommercialGraphWindow;
  }> {
    const [events, beliefs, policies] = await this.prisma.$transaction([
      this.prisma.autopilotEvent.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: {
          action: true,
          contactId: true,
          createdAt: true,
          intent: true,
          status: true,
        },
      }),
      this.prisma.mindBelief.findMany({
        where: { workspaceId },
        orderBy: [{ samples: 'desc' }, { lastUpdate: 'desc' }],
        take: 100,
        select: {
          subject: true,
          predicate: true,
          context: true,
          mean: true,
          variance: true,
          samples: true,
        },
      }),
      this.prisma.mindPolicy.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          subject: true,
          decisionType: true,
          chosen: true,
          baseline: true,
          outcome: true,
        },
      }),
    ]);
    this.logger.debug({
      operation: 'brain.commercial_graph.build',
      status: 'ok',
      workspaceId,
      eventCount: events.length,
      beliefCount: beliefs.length,
      policyCount: policies.length,
    });

    const nodes = new Map<string, CommercialGraphNode>();
    const edges = new Map<string, CommercialGraphEdge>();

    const workspaceNode: CommercialGraphNode = {
      id: workspaceId,
      kind: 'workspace',
      label: workspaceId,
      weight: 1,
    };
    nodes.set(workspaceId, workspaceNode);

    for (const event of events) {
      const intentId = `intent:${event.intent}`;
      const actionId = `action:${event.action}`;
      incrementNode(nodes, {
        id: intentId,
        kind: 'intent',
        label: event.intent,
        weight: 1,
      });
      incrementNode(nodes, {
        id: actionId,
        kind: 'action',
        label: event.action,
        weight: 1,
      });
      incrementEdge(edges, {
        from: intentId,
        label: 'triggered',
        to: actionId,
        weight: outcomeWeight(event.status),
      });

      if (event.contactId) {
        const contactNodeId = event.contactId.startsWith('contact:')
          ? event.contactId
          : `contact:${event.contactId}`;
        incrementNode(nodes, {
          id: contactNodeId,
          kind: 'contact',
          label: contactNodeId,
          weight: 1,
        });
        incrementEdge(edges, {
          from: workspaceId,
          label: 'contact',
          to: contactNodeId,
          weight: 1,
        });
        incrementEdge(edges, {
          from: contactNodeId,
          label: event.action,
          to: workspaceId,
          weight: outcomeWeight(event.status),
        });
      }
    }

    for (const belief of beliefs) {
      const nodeId = `belief:${belief.subject}:${belief.predicate}`;
      incrementNode(nodes, {
        id: nodeId,
        kind: 'belief',
        label: belief.predicate,
        weight: belief.samples,
      });
      incrementEdge(edges, {
        from: workspaceId,
        label: 'belief',
        to: nodeId,
        weight: belief.samples,
      });
    }

    for (const policy of policies) {
      const nodeId = `policy:${policy.decisionType}:${policy.chosen}`;
      const weight = policy.outcome ?? 0.5;
      incrementNode(nodes, {
        id: nodeId,
        kind: 'policy',
        label: policy.decisionType,
        weight,
      });
      incrementEdge(edges, {
        from: workspaceId,
        label: 'policy',
        to: nodeId,
        weight,
      });
    }

    await persistWorkspaceCommercialGraph(this.prisma, workspaceId, nodes, edges);

    return {
      nodes: Array.from(nodes.values()),
      edges: Array.from(edges.values()),
      window: {
        beliefCount: beliefs.length,
        eventCount: events.length,
        policyCount: policies.length,
        take: 500,
      },
    };
  }

  async getRecommendations(workspaceId: string): Promise<{
    recommendations: CommercialGraphRecommendation[];
    window: CommercialGraphWindow;
  }> {
    const [events, policies] = await this.prisma.$transaction([
      this.prisma.autopilotEvent.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          action: true,
          status: true,
        },
      }),
      this.prisma.mindPolicy.findMany({
        where: { workspaceId, resolvedAt: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          decisionType: true,
          chosen: true,
          outcome: true,
          baselineOutcome: true,
        },
      }),
    ]);

    const actionStats = new Map<string, { wins: number; total: number }>();
    for (const event of events) {
      const stat = actionStats.get(event.action) ?? { wins: 0, total: 0 };
      stat.total += 1;
      if (event.status === 'executed' || event.status === 'completed') {
        stat.wins += 1;
      }
      actionStats.set(event.action, stat);
    }

    const actionPolicySignal = new Map<
      string,
      { total: number; toxic: number; regressions: number; bestOutcome: number }
    >();
    for (const policy of policies) {
      const signal = actionPolicySignal.get(policy.chosen) ?? {
        total: 0,
        toxic: 0,
        regressions: 0,
        bestOutcome: -Infinity,
      };
      signal.total += 1;
      if (policy.outcome !== null) {
        if (policy.outcome <= 0) {
          signal.toxic += 1;
        }
        if (
          policy.baselineOutcome !== null &&
          policy.baselineOutcome !== undefined &&
          policy.outcome < policy.baselineOutcome
        ) {
          signal.regressions += 1;
        }
        signal.bestOutcome = Math.max(signal.bestOutcome, policy.outcome);
      }
      actionPolicySignal.set(policy.chosen, signal);
    }

    const recommendations: CommercialGraphRecommendation[] = [];

    for (const [action, stat] of actionStats.entries()) {
      const confidence = stat.total > 0 ? stat.wins / stat.total : 0;
      const signal = actionPolicySignal.get(action);
      const hasToxicity = signal !== undefined && signal.toxic > 0;
      const hasRegression = signal !== undefined && signal.regressions > 0;

      if (confidence === 0 || (hasToxicity && confidence < 0.3)) {
        let reason = `Priorizar correção: ${stat.wins}/${stat.total} successes`;
        if (hasToxicity) {
          reason += ` — ${signal.toxic} sinal(is) tóxico(s)`;
        }
        if (hasRegression) {
          reason += ` — ${signal.regressions} regressão(ões) vs baseline`;
        }
        recommendations.push({
          action,
          confidence: 0,
          reason,
          toxicityFlag: 'toxic',
          toxicPolicyCount: signal?.toxic ?? 0,
        });
      } else if (hasRegression || hasToxicity) {
        const clamped = Math.min(confidence, 0.35);
        let reason = `${stat.wins}/${stat.total} successes — toxicidade detectada`;
        if (hasRegression) {
          reason += ` (${signal.regressions} regressões)`;
        }
        if (hasToxicity) {
          reason += ` (${signal.toxic} resultados ≤ 0)`;
        }
        recommendations.push({
          action,
          confidence: clamped,
          reason,
          toxicityFlag: hasRegression ? 'regression' : 'toxic',
          toxicPolicyCount: signal?.toxic ?? 0,
        });
      } else {
        let reason = `${stat.wins}/${stat.total} successes`;
        if (signal !== undefined && signal.bestOutcome > 0) {
          reason += ` | best policy outcome: ${signal.bestOutcome.toFixed(2)}`;
        }
        recommendations.push({
          action,
          confidence,
          reason,
          toxicityFlag: 'healthy',
          toxicPolicyCount: 0,
        });
      }
    }

    for (const [action, signal] of actionPolicySignal.entries()) {
      if (actionStats.has(action)) {
        continue;
      }
      if (signal.toxic > 0) {
        recommendations.push({
          action,
          confidence: 0,
          reason: `${signal.toxic} política(s) tóxica(s) — investigar antes de escalar`,
          toxicityFlag: 'toxic',
          toxicPolicyCount: signal.toxic,
        });
      } else if (signal.bestOutcome > 0) {
        recommendations.push({
          action,
          confidence: Math.min(signal.bestOutcome, 1),
          reason: `MIND policy: ${signal.total} decisão(ões)`,
          toxicityFlag: 'healthy',
          toxicPolicyCount: 0,
        });
      }
    }

    const rankedRecommendations = recommendations
      .sort((left, right) => {
        const leftFix = left.toxicityFlag === 'toxic' || left.toxicityFlag === 'regression' ? 0 : 1;
        const rightFix = right.toxicityFlag === 'toxic' || right.toxicityFlag === 'regression' ? 0 : 1;
        if (leftFix !== rightFix) {
          return leftFix - rightFix;
        }
        return left.confidence - right.confidence;
      })
      .slice(0, 10);

    this.logger.debug({
      operation: 'brain.commercial_graph.recommendations',
      status: 'ok',
      workspaceId,
      eventCount: events.length,
      policyCount: policies.length,
      recommendationCount: rankedRecommendations.length,
      toxicFlagged: rankedRecommendations.filter(
        (r) => r.toxicityFlag === 'toxic' || r.toxicityFlag === 'regression',
      ).length,
    });

    return {
      recommendations: rankedRecommendations,
      window: { eventCount: events.length, take: 200 },
    };
  }

  recommendNextActions(workspaceId: string): Promise<{
    recommendations: CommercialGraphRecommendation[];
    window: CommercialGraphWindow;
  }> {
    return this.getRecommendations(workspaceId);
  }
}
