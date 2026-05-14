import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MIND_DECISION_CATALOG } from './mind-decision-catalog';
import { MindBeliefService } from './mind-belief.service';
import { MindPolicyService } from './mind-policy.service';
import { MindSimulatorService } from './mind-simulator.service';

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

@Injectable()
export class MindReportService {
  private readonly logger = StructuredLogger.from(MindReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly beliefs: MindBeliefService,
    private readonly policy: MindPolicyService,
    private readonly simulator: MindSimulatorService,
  ) {
    this.logger.debug?.(`MindReportService initialized`);}

  async generateDaily(workspaceId: string, reportDate = startOfDay(new Date())) {
    const [state, concepts] = await Promise.all([
      this.prisma.mindWorkspaceState.findUnique({ where: { workspaceId } }),
      this.prisma.mindConceptDetection.findMany({
        where: { workspaceId, occurredAt: { gte: reportDate } },
        orderBy: { occurredAt: 'desc' },
        take: 100,
      }),
    ]);

    const lifts = await Promise.all(
      MIND_DECISION_CATALOG.map((spec) =>
        this.policy.harness(workspaceId, spec.decisionType, 14).then((lift) => ({
          decisionType: spec.decisionType,
          ...lift,
        })),
      ),
    );
    const replyBeliefs = await this.beliefs.list(workspaceId, 'P(reply|template,hour,channel)');
    const syntheticSimulation = this.simulator.simulateSyntheticWorkspace(
      workspaceId,
      Number.parseInt(reportDate.toISOString().slice(0, 10).replace(/-/g, ''), 10),
    );

    const content = [
      `# Relatorio diario MIND — ${reportDate.toISOString().slice(0, 10)}`,
      '',
      `Workspace: ${workspaceId}`,
      `Ultimo tick: ${state?.lastTickAt?.toISOString() ?? 'sem tick registrado'}`,
      `Ticks totais: ${state?.tickCount ?? 0}`,
      `Eventos percebidos na janela: ${state?.perceivedWindow ?? 0}`,
      `Surpresa acumulada na janela: ${(state?.surpriseWindow ?? 0).toFixed(3)}`,
      '',
      '## Lift por decisao',
      ...lifts.map(
        (lift) =>
          `- ${lift.decisionType}: lift=${(lift.lift * 100).toFixed(1)}%, mind=${(lift.mindMean * 100).toFixed(1)}%, baseline=${(lift.baselineMean * 100).toFixed(1)}%, n=${lift.n}, z=${lift.pZScore.toFixed(2)}`,
      ),
      '',
      '## Conceitos detectados',
      ...concepts
        .slice(0, 20)
        .map(
          (item) => `- ${item.concept}: ${(item.confidence * 100).toFixed(0)}% em ${item.subject}`,
        ),
      '',
      '## Crenças de resposta',
      ...replyBeliefs
        .slice(0, 10)
        .map(
          (belief) =>
            `- ${belief.subject}: mean=${(belief.mean * 100).toFixed(1)}%, variance=${belief.variance.toFixed(4)}, n=${belief.samples}`,
        ),
      '',
      '## Simulacao sintetica',
      `- verdict=${syntheticSimulation.summary.overallVerdict}, decisoes=${syntheticSimulation.summary.totalDecisions}, quality_failed=${syntheticSimulation.summary.qualityFailed}`,
    ].join('\n');

    const metrics = {
      lifts,
      concepts: concepts.length,
      replyBeliefs: replyBeliefs.length,
      syntheticSimulation: {
        verdict: syntheticSimulation.summary.overallVerdict,
        totalDecisions: syntheticSimulation.summary.totalDecisions,
        qualityFailed: syntheticSimulation.summary.qualityFailed,
      },
      state: state
        ? {
            lastTickAt: state.lastTickAt?.toISOString() ?? null,
            tickCount: state.tickCount,
            perceivedWindow: state.perceivedWindow,
            surpriseWindow: state.surpriseWindow,
          }
        : null,
    };

    return this.prisma.mindDailyReport.upsert({
      where: { workspaceId_reportDate: { workspaceId, reportDate } },
      update: { content, metrics },
      create: {
        id: randomUUID(),
        workspaceId,
        reportDate,
        content,
        metrics,
      },
    });
  }
}
