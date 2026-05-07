import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MIND_DECISION_CATALOG } from './mind-decision-catalog';
import { MindBanditService } from './mind-bandit.service';
import { MindBeliefService } from './mind-belief.service';
import { MindPolicyService } from './mind-policy.service';
import { MindReportService } from './mind-report.service';
import { MindVerbalizerService } from './mind-verbalizer.service';

@Injectable()
export class MindObservabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly beliefs: MindBeliefService,
    private readonly policy: MindPolicyService,
    private readonly verbalizer: MindVerbalizerService,
    private readonly reports: MindReportService,
    private readonly bandits: MindBanditService,
  ) {}

  async state(workspaceId: string) {
    const [runtime, strongest, uncertain] = await Promise.all([
      this.prisma.mindWorkspaceState.findUnique({ where: { workspaceId } }),
      this.prisma.mindBelief.findMany({
        where: { workspaceId },
        orderBy: [{ samples: 'desc' }, { variance: 'asc' }],
        take: 25,
      }),
      this.prisma.mindBelief.findMany({
        where: { workspaceId },
        orderBy: [{ variance: 'desc' }, { samples: 'asc' }],
        take: 25,
      }),
    ]);
    return { workspaceId, runtime, strongest, uncertain };
  }

  async surprise(workspaceId: string, take = 50) {
    return this.prisma.mindPrediction.findMany({
      where: { workspaceId, resolvedAt: { not: null }, surprise: { not: null } },
      orderBy: { surprise: 'desc' },
      take,
    });
  }

  async lift(workspaceId: string, sinceDays = 14) {
    const rows = await Promise.all(
      MIND_DECISION_CATALOG.map((spec) =>
        this.policy.harness(workspaceId, spec.decisionType, sinceDays).then((lift) => ({
          decisionType: spec.decisionType,
          fallbackActive: lift.lift < 0 && lift.pZScore <= -1.96 && lift.n >= 30,
          ...lift,
        })),
      ),
    );
    return { workspaceId, sinceDays, decisions: rows };
  }

  async concepts(workspaceId: string, hours = 24) {
    const since = new Date(Date.now() - hours * 3600 * 1000);
    const rows = await this.prisma.mindConceptDetection.findMany({
      where: { workspaceId, occurredAt: { gte: since } },
      orderBy: { occurredAt: 'desc' },
      take: 500,
    });
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.concept, (counts.get(row.concept) ?? 0) + 1);
    return {
      workspaceId,
      hours,
      concepts: [...counts.entries()].map(([concept, count]) => ({ concept, count })),
      examples: rows.slice(0, 50),
    };
  }

  async health(workspaceId: string) {
    const [runtime, pendingOutbox, openPredictions, openDecisions] = await Promise.all([
      this.prisma.mindWorkspaceState.findUnique({ where: { workspaceId } }),
      this.prisma.mindOutboxEvent.count({ where: { workspaceId, status: 'pending' } }),
      this.prisma.mindPrediction.count({ where: { workspaceId, resolvedAt: null } }),
      this.prisma.mindPolicy.count({ where: { workspaceId, resolvedAt: null } }),
    ]);
    return { workspaceId, runtime, pendingOutbox, openPredictions, openDecisions };
  }

  async trace(workspaceId: string, policyId: string) {
    const policy = await this.prisma.mindPolicy.findFirst({ where: { id: policyId, workspaceId } });
    if (!policy) return null;
    const [similarCases, graphEdges] = await Promise.all([
      this.prisma.mindCase.findMany({
        where: { workspaceId, subject: policy.subject },
        orderBy: { occurredAt: 'desc' },
        take: 10,
      }),
      this.prisma.mindGraphEdge.findMany({
        where: { workspaceId },
        orderBy: { weight: 'desc' },
        take: 20,
      }),
    ]);
    return { policy, similarCases, graphEdges };
  }

  briefing(workspaceId: string) {
    return this.verbalizer.narrate(workspaceId).then((briefing) => ({ briefing }));
  }

  async ask(workspaceId: string, question: string) {
    const [state, lift, concepts] = await Promise.all([
      this.state(workspaceId),
      this.lift(workspaceId, 14),
      this.concepts(workspaceId, 24),
    ]);
    if (!question.trim()) return { answer: 'Pergunta vazia.', state, lift, concepts };
    const briefing = await this.verbalizer.narrate(workspaceId);
    return {
      answer: `${briefing}\n\nPergunta recebida: ${question}. Use os campos JSON anexos para auditar os números.`,
      state,
      lift,
      concepts,
    };
  }

  report(workspaceId: string) {
    return this.reports.generateDaily(workspaceId);
  }

  bandit(workspaceId: string, decisionType: string) {
    return this.bandits.status(workspaceId, decisionType);
  }
}
