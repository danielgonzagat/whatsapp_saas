import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CommercialGraphNode {
  id: string;
  kind: 'action' | 'belief' | 'contact' | 'event' | 'intent' | 'policy' | 'status' | 'workspace';
  label: string;
  weight: number;
}

export interface CommercialGraphEdge {
  from: string;
  label: string;
  to: string;
  weight: number;
}

export interface CommercialGraphRecommendation {
  action: string;
  confidence: number;
  reason: string;
}

export interface CommercialGraphWindow {
  beliefCount?: number;
  eventCount: number;
  policyCount?: number;
  take: number;
}

type MindBeliefGraphRow = {
  context: unknown;
  mean: number;
  predicate: string;
  samples: number;
  subject: string;
  variance: number;
};

type MindPolicyGraphRow = {
  baseline: string;
  chosen: string;
  decisionType: string;
  outcome: number | null;
  subject: string;
};

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

function outcomeWeight(status: string): number {
  if (status === 'executed' || status === 'completed') {
    return 1;
  }
  if (status === 'failed' || status === 'error') {
    return -1;
  }
  return 0.25;
}

@Injectable()
export class BrainCommercialGraphService {
  constructor(private readonly prisma: PrismaService) {}

  async buildWorkspaceGraph(workspaceId: string): Promise<{
    edges: CommercialGraphEdge[];
    nodes: CommercialGraphNode[];
    window: CommercialGraphWindow;
  }> {
    const [events, beliefs, policies] = await Promise.all([
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
      this.readMindBeliefs(workspaceId),
      this.readMindPolicies(workspaceId),
    ]);
    const nodes = new Map<string, CommercialGraphNode>();
    const edges = new Map<string, CommercialGraphEdge>();
    const workspaceNode = `workspace:${workspaceId}`;

    incrementNode(nodes, {
      id: workspaceNode,
      kind: 'workspace',
      label: 'workspace',
      weight: 1,
    });

    for (const event of events) {
      const eventDay = event.createdAt.toISOString().slice(0, 10);
      const eventNode = `event:${eventDay}`;
      const intentNode = `intent:${event.intent}`;
      const actionNode = `action:${event.action}`;
      const statusNode = `status:${event.status}`;
      const weight = outcomeWeight(event.status);

      incrementNode(nodes, { id: eventNode, kind: 'event', label: eventDay, weight: 1 });
      incrementNode(nodes, { id: intentNode, kind: 'intent', label: event.intent, weight });
      incrementNode(nodes, { id: actionNode, kind: 'action', label: event.action, weight });
      incrementNode(nodes, { id: statusNode, kind: 'status', label: event.status, weight: 1 });
      incrementEdge(edges, { from: workspaceNode, label: 'observed', to: eventNode, weight: 1 });
      incrementEdge(edges, { from: eventNode, label: 'intent', to: intentNode, weight });
      incrementEdge(edges, { from: intentNode, label: 'triggered', to: actionNode, weight });
      incrementEdge(edges, { from: actionNode, label: 'resulted_in', to: statusNode, weight });

      if (event.contactId) {
        const contactNode = `contact:${event.contactId}`;
        incrementNode(nodes, {
          id: contactNode,
          kind: 'contact',
          label: event.contactId,
          weight,
        });
        incrementEdge(edges, { from: contactNode, label: 'caused', to: intentNode, weight });
      }
    }

    for (const belief of beliefs) {
      const beliefNode = `belief:${belief.subject}:${belief.predicate}:${JSON.stringify(
        belief.context,
      )}`;
      const subjectNode = belief.subject;
      const weight = Math.max(0.01, belief.mean) * Math.max(1, belief.samples);

      incrementNode(nodes, {
        id: beliefNode,
        kind: 'belief',
        label: `${belief.predicate} mean=${belief.mean.toFixed(2)} var=${belief.variance.toFixed(3)}`,
        weight,
      });
      incrementNode(nodes, {
        id: subjectNode,
        kind: subjectNode.startsWith('contact:') ? 'contact' : 'workspace',
        label: belief.subject,
        weight,
      });
      incrementEdge(edges, { from: workspaceNode, label: 'believes', to: beliefNode, weight });
      incrementEdge(edges, { from: subjectNode, label: 'conditioned_by', to: beliefNode, weight });
    }

    for (const policy of policies) {
      const policyNode = `policy:${policy.decisionType}:${policy.chosen}`;
      const subjectNode = policy.subject;
      const outcome = policy.outcome ?? 0;
      const weight = outcome > 0 ? outcome : -0.25;

      incrementNode(nodes, {
        id: policyNode,
        kind: 'policy',
        label: `${policy.decisionType}:${policy.chosen}`,
        weight,
      });
      incrementNode(nodes, {
        id: subjectNode,
        kind: subjectNode.startsWith('contact:') ? 'contact' : 'workspace',
        label: policy.subject,
        weight,
      });
      incrementEdge(edges, { from: subjectNode, label: 'policy_chose', to: policyNode, weight });
      incrementEdge(edges, {
        from: policyNode,
        label: 'compared_to',
        to: `action:${policy.baseline}`,
        weight,
      });
    }

    return {
      nodes: Array.from(nodes.values()).sort(
        (left, right) => Math.abs(right.weight) - Math.abs(left.weight),
      ),
      edges: Array.from(edges.values()).sort(
        (left, right) => Math.abs(right.weight) - Math.abs(left.weight),
      ),
      window: {
        beliefCount: beliefs.length,
        eventCount: events.length,
        policyCount: policies.length,
        take: 500,
      },
    };
  }

  async recommendNextActions(workspaceId: string): Promise<{
    recommendations: CommercialGraphRecommendation[];
    window: { eventCount: number; take: number };
  }> {
    const events = await this.prisma.autopilotEvent.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        action: true,
        status: true,
      },
    });
    const outcomes = new Map<string, { executed: number; failed: number; skipped: number }>();
    for (const event of events) {
      const current = outcomes.get(event.action) ?? { executed: 0, failed: 0, skipped: 0 };
      if (event.status === 'executed' || event.status === 'completed') {
        current.executed += 1;
      } else if (event.status === 'failed' || event.status === 'error') {
        current.failed += 1;
      } else {
        current.skipped += 1;
      }
      outcomes.set(event.action, current);
    }

    const recommendations = Array.from(outcomes.entries())
      .map(([action, outcome]) => {
        const total = outcome.executed + outcome.failed + outcome.skipped;
        const confidence = total > 0 ? outcome.executed / total : 0;
        const reason =
          outcome.failed > outcome.executed
            ? `Priorizar correção: ${outcome.failed} falha(s) recentes contra ${outcome.executed} execução(ões).`
            : `Caminho forte: ${outcome.executed} execução(ões) recentes em ${total} evento(s).`;
        return { action, confidence, reason };
      })
      .sort((left, right) => {
        const leftIsFix = left.reason.startsWith('Priorizar');
        const rightIsFix = right.reason.startsWith('Priorizar');
        if (leftIsFix !== rightIsFix) {
          return leftIsFix ? -1 : 1;
        }
        return right.confidence - left.confidence;
      })
      .slice(0, 10);

    return {
      recommendations,
      window: { eventCount: events.length, take: 500 },
    };
  }

  private readMindBeliefs(workspaceId: string): Promise<MindBeliefGraphRow[]> {
    return this.prisma.$queryRaw<MindBeliefGraphRow[]>`
      SELECT subject, predicate, context, mean, variance, samples
      FROM "RAC_MindBelief"
      WHERE "workspaceId" = ${workspaceId}
      ORDER BY samples DESC, "lastUpdate" DESC
      LIMIT 100
    `;
  }

  private readMindPolicies(workspaceId: string): Promise<MindPolicyGraphRow[]> {
    return this.prisma.$queryRaw<MindPolicyGraphRow[]>`
      SELECT subject, "decisionType", chosen, baseline, outcome
      FROM "RAC_MindPolicy"
      WHERE "workspaceId" = ${workspaceId}
      ORDER BY "createdAt" DESC
      LIMIT 100
    `;
  }
}
