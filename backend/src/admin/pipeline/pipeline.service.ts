import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BrainEventSpineService } from '../../kloel/brain-event-spine.service';

type PipelineStateValue = 'legacy' | 'shadow' | 'active';

export type PipelineStateRow = {
  id: string;
  workspaceId: string;
  state: PipelineStateValue;
  transitionedAt: Date;
  transitionedBy: string | null;
  snapshot: unknown | null;
  fallbackRate1h: number;
};

export type DecisionShadowInput = {
  workspaceId: string;
  channel: string;
  inboundCorrelationId: string;
  orchestratorDecision: unknown;
  legacyBaseline: unknown;
  outcomeKey: string;
};

const FALLBACK_THRESHOLD = 0.05;

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: BrainEventSpineService,
  ) {}

  async getState(workspaceId: string): Promise<PipelineStateRow> {
    const existing = await this.prisma.pipelineState.findUnique({
      where: { workspaceId },
    });
    if (existing) {
      return existing as PipelineStateRow;
    }
    return this.prisma.pipelineState.create({
      data: { workspaceId, state: 'legacy' },
    }) as Promise<PipelineStateRow>;
  }

  async setState(
    workspaceId: string,
    state: PipelineStateValue,
    by?: string,
    reason?: string,
  ): Promise<PipelineStateRow> {
    const previous = await this.prisma.pipelineState.findUnique({
      where: { workspaceId },
    });
    const previousState = previous?.state ?? 'legacy';
    const snapshot = {
      previousState,
      reason: reason ?? 'manual transition',
    };
    const row = (await this.prisma.pipelineState.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        state,
        transitionedBy: by ?? null,
        snapshot,
        transitionedAt: new Date(),
        fallbackRate1h: 0,
      },
      update: {
        state,
        transitionedBy: by ?? null,
        snapshot,
        transitionedAt: new Date(),
        fallbackRate1h: 0,
      },
    })) as PipelineStateRow;

    await this.events.recordCommercial({
      workspaceId,
      subject: `workspace:${workspaceId}`,
      eventType: 'pipeline.state.changed',
      occurredAt: new Date(),
      idempotencyKey: `pipeline-state:${workspaceId}:${Date.now()}`,
      payload: {
        previousState,
        newState: state,
        reason: reason ?? 'manual transition',
        by: by ?? 'system',
      },
    });

    this.logger.log(
      `Pipeline state ${workspaceId}: ${previousState} -> ${state}`,
    );
    return row;
  }

  async recordShadow(input: DecisionShadowInput): Promise<void> {
    await this.prisma.decisionShadow.upsert({
      where: {
        workspaceId_inboundCorrelationId: {
          workspaceId: input.workspaceId,
          inboundCorrelationId: input.inboundCorrelationId,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        channel: input.channel,
        inboundCorrelationId: input.inboundCorrelationId,
        orchestratorDecision: input.orchestratorDecision as object,
        legacyBaseline: input.legacyBaseline as object,
        outcomeKey: input.outcomeKey,
      },
      update: {
        orchestratorDecision: input.orchestratorDecision as object,
        legacyBaseline: input.legacyBaseline as object,
        outcomeKey: input.outcomeKey,
      },
    });

    await this.events.recordCommercial({
      workspaceId: input.workspaceId,
      subject: `channel:${input.channel}`,
      eventType: 'pipeline.shadow_recorded',
      occurredAt: new Date(),
      idempotencyKey: `pipeline-shadow:${input.workspaceId}:${input.inboundCorrelationId}`,
      payload: {
        channel: input.channel,
        inboundCorrelationId: input.inboundCorrelationId,
        outcomeKey: input.outcomeKey,
      },
    });
  }

  async incrementFallback(workspaceId: string): Promise<void> {
    await this.prisma.pipelineState.updateMany({
      where: { workspaceId },
      data: {
        fallbackRate1h: { increment: 0.01 },
      },
    });

    const state = await this.getState(workspaceId);
    if (
      state.state === 'active' &&
      state.fallbackRate1h >= FALLBACK_THRESHOLD
    ) {
      await this.setState(
        workspaceId,
        'shadow',
        'system',
        `auto-fallback: fallbackRate1h ${state.fallbackRate1h.toFixed(3)} >= ${FALLBACK_THRESHOLD}`,
      );
      await this.events.recordCommercial({
        workspaceId,
        subject: `workspace:${workspaceId}`,
        eventType: 'pipeline.auto_fallback',
        occurredAt: new Date(),
        idempotencyKey: `pipeline-auto-fallback:${workspaceId}:${Date.now()}`,
        payload: {
          previousState: 'active',
          newState: 'shadow',
          fallbackRate1h: state.fallbackRate1h,
          threshold: FALLBACK_THRESHOLD,
        },
      });
      this.logger.warn(
        `Pipeline auto-fallback ${workspaceId}: active -> shadow (fallbackRate1h=${state.fallbackRate1h.toFixed(3)})`,
      );
    }
  }

  async getHealth(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace não encontrado');
    }

    const state = await this.getState(workspaceId);
    const shadowCount = await this.prisma.decisionShadow.count({
      where: { workspaceId },
    });
    const recentShadows = await this.prisma.decisionShadow.count({
      where: {
        workspaceId,
        createdAt: { gte: new Date(Date.now() - 3600_000) },
      },
    });

    return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      state: state.state,
      transitionedAt: state.transitionedAt,
      fallbackRate1h: state.fallbackRate1h,
      threshold: FALLBACK_THRESHOLD,
      totalShadows: shadowCount,
      recentShadows1h: recentShadows,
    };
  }
}
