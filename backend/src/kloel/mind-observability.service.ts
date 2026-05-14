import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { PrismaService } from '../prisma/prisma.service';
import { MIND_DECISION_CATALOG } from './mind-decision-catalog';
import { MindBanditService } from './mind-bandit.service';
import { MindBeliefService } from './mind-belief.service';
import { MindPolicyService } from './mind-policy.service';
import { MindReportService } from './mind-report.service';
import { MindVerbalizerService } from './mind-verbalizer.service';

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class MindObservabilityService {
  private readonly logger = StructuredLogger.from(MindObservabilityService.name);

  constructor(
    private readonly prisma: PrismaService,
    _beliefs: MindBeliefService,
    private readonly policy: MindPolicyService,
    private readonly verbalizer: MindVerbalizerService,
    private readonly reports: MindReportService,
    private readonly bandits: MindBanditService,
  ) {
    this.logger.debug?.(`MindObservabilityService initialized`);}

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
      MIND_DECISION_CATALOG.map(async (spec) => {
        const lift = await this.policy.harness(workspaceId, spec.decisionType, sinceDays);
        return {
          decisionType: spec.decisionType,
          fallbackActive: lift.lift < 0 && lift.pZScore <= -1.96 && lift.n >= 30,
          ...lift,
        };
      }),
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

  async runtimeEvidence(workspaceId: string) {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const [workspace, runtime, eventsLast24h, concepts, casesStored, consultedEvents, guards] =
      await Promise.all([
        this.prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { id: true, name: true },
        }),
        this.prisma.mindWorkspaceState.findUnique({ where: { workspaceId } }),
        this.prisma.autopilotEvent.count({ where: { workspaceId, createdAt: { gte: since } } }),
        this.concepts(workspaceId, 24),
        this.prisma.mindCase.count({ where: { workspaceId } }),
        this.prisma.autopilotEvent.findMany({
          where: {
            workspaceId,
            action: 'case_memory.consulted',
            createdAt: { gte: since },
          },
          orderBy: { createdAt: 'desc' },
          select: { meta: true },
          take: 500,
        }),
        this.guardEvidence(workspaceId, since),
      ]);

    const decisionEntries = await Promise.all(
      MIND_DECISION_CATALOG.map(async (spec) => {
        const [lift, openOutcomes, lastResolved] = await Promise.all([
          this.policy.harness(workspaceId, spec.decisionType, 14),
          this.prisma.mindPolicy.count({
            where: { workspaceId, decisionType: spec.decisionType, resolvedAt: null },
          }),
          this.prisma.mindPolicy.findFirst({
            where: { workspaceId, decisionType: spec.decisionType, resolvedAt: { not: null } },
            orderBy: { resolvedAt: 'desc' },
            select: { resolvedAt: true },
          }),
        ]);
        return [
          spec.decisionType,
          {
            fallbackActive: lift.lift < 0 && lift.pZScore <= -1.96 && lift.n >= 30,
            lastResolvedAt: lastResolved?.resolvedAt?.toISOString() ?? null,
            lift: lift.lift,
            n: lift.n,
            openOutcomes,
            zScore: lift.pZScore,
          },
        ] as const;
      }),
    );

    const [
      armsActive,
      selectionsLast24h,
      messagesProcessedLast24h,
      messagesViaOrchestratorLast24h,
    ] = await Promise.all([
      this.prisma.mindBanditArm.count({ where: { workspaceId, isActive: true } }),
      this.prisma.mindPolicy.count({ where: { workspaceId, createdAt: { gte: since } } }),
      this.prisma.autopilotEvent.count({
        where: { workspaceId, action: 'message.received', createdAt: { gte: since } },
      }),
      this.prisma.autopilotEvent.count({
        where: { workspaceId, action: 'predecided_actions.built', createdAt: { gte: since } },
      }),
    ]);
    const percentDeterministic =
      messagesProcessedLast24h > 0
        ? Number(((messagesViaOrchestratorLast24h / messagesProcessedLast24h) * 100).toFixed(2))
        : 0;

    return {
      bandits: { armsActive, selectionsLast24h },
      decisions: Object.fromEntries(decisionEntries),
      deterministicPipeline: {
        messagesProcessedLast24h,
        messagesViaOrchestratorLast24h,
        percentDeterministic,
      },
      guards,
      lastTickAt: runtime?.lastTickAt?.toISOString() ?? null,
      memory: {
        casesConsultedLast24h: consultedEvents.length,
        casesStored,
        topConsultedCaseTypes: this.topConsultedCaseTypes(consultedEvents),
      },
      perception: {
        conceptsDetectedLast24h: Object.fromEntries(
          concepts.concepts.map((row) => [row.concept, row.count]),
        ),
        eventsLast24h,
      },
      workspace: workspace ?? { id: workspaceId, name: null },
    };
  }

  private async guardEvidence(workspaceId: string, since: Date) {
    const [evaluationsLast24h, blocksLast24h, topBlockingRules] = await Promise.all([
      this.prisma.mindGuardAudit.count({ where: { workspaceId, createdAt: { gte: since } } }),
      this.prisma.mindGuardAudit.count({
        where: { workspaceId, allowed: false, createdAt: { gte: since } },
      }),
      this.prisma.mindGuardAudit.groupBy({
        by: ['guardName'],
        where: { workspaceId, allowed: false, createdAt: { gte: since } },
        _count: { guardName: true },
        orderBy: { _count: { guardName: 'desc' } },
        take: 5,
      }),
    ]);
    return {
      blocksLast24h,
      evaluationsLast24h,
      topBlockingRules: topBlockingRules.map((row) => row.guardName),
    };
  }

  private topConsultedCaseTypes(rows: Array<{ meta: unknown }>): string[] {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const concept = this.readCommercialPayloadString(row.meta, 'concept');
      if (concept) {
        counts.set(concept, (counts.get(concept) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([concept]) => concept);
  }

  private readCommercialPayloadString(meta: unknown, key: string): string | null {
    if (!isUnknownRecord(meta)) {
      return null;
    }
    const payload = meta.payload;
    if (!isUnknownRecord(payload)) {
      return null;
    }
    const value = payload[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
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

  async briefing(workspaceId: string) {
    const briefing = await this.verbalizer.narrate(workspaceId);
    return { briefing };
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
