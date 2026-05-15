import { Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { KloelGlobalPriorService } from './kloel-global-prior.service';
import { extractChannel } from './mind-belief-by-channel';

function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export interface RecordDecisionInput {
  workspaceId: string;
  decisionType: string;
  chosenAction: string;
  baselineAction?: string;
  outcomeKey: string;
  expectedWindow: number;
  contextSnapshot: Record<string, unknown>;
}

export interface CloseOutcomeInput {
  outcomeKey: string;
  outcomeName: string;
  outcomeValue?: Record<string, unknown>;
  economicValue?: number;
  wonVsBaseline?: boolean;
}

@Injectable()
export class DecisionOutcomeService {
  private readonly logger = StructuredLogger.from(DecisionOutcomeService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly globalPrior?: KloelGlobalPriorService,
  ) {}

  async recordDecision(input: RecordDecisionInput) {
    await this.prisma.decisionOutcome.create({
      data: {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        decisionType: input.decisionType,
        chosenAction: input.chosenAction,
        baselineAction: input.baselineAction ?? null,
        outcomeKey: input.outcomeKey,
        expectedWindow: input.expectedWindow,
        contextSnapshot: inputJson(input.contextSnapshot),
      },
    });
  }

  async closeOutcome(input: CloseOutcomeInput) {
    const result = await this.prisma.decisionOutcome.updateMany({
      where: { outcomeKey: input.outcomeKey, outcomeAt: null },
      data: {
        outcomeAt: new Date(),
        outcomeName: input.outcomeName,
        ...(input.outcomeValue ? { outcomeValue: inputJson(input.outcomeValue) } : {}),
        economicValue: input.economicValue ?? null,
        wonVsBaseline: input.wonVsBaseline ?? null,
      },
    });

    if (result.count > 0) {
      const closed = await this.prisma.decisionOutcome.findFirst({
        where: { outcomeKey: input.outcomeKey },
        orderBy: { outcomeAt: 'desc' },
        select: { contextSnapshot: true, decisionType: true, chosenAction: true },
      });

      if (closed && this.globalPrior) {
        const channel = extractChannel(closed.contextSnapshot as Record<string, unknown>);
        if (channel) {
          try {
            await this.globalPrior.recordObservation(
              channel,
              closed.decisionType,
              closed.chosenAction,
              input.wonVsBaseline ?? false,
            );
          } catch (err: unknown) {
            this.logger.error('Failed to record global prior observation from closeOutcome', {
              outcomeKey: input.outcomeKey,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    }
  }

  async findOpenByWorkspace(workspaceId: string) {
    return this.prisma.decisionOutcome.findMany({
      where: { workspaceId, outcomeAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findClosedByDecisionType(workspaceId: string, decisionType: string, since: Date) {
    return this.prisma.decisionOutcome.findMany({
      where: {
        workspaceId,
        decisionType,
        outcomeAt: { not: null, gte: since },
      },
      orderBy: { outcomeAt: 'desc' },
    });
  }

  async findAllClosedSince(since: Date) {
    return this.prisma.decisionOutcome.findMany({
      where: { outcomeAt: { not: null, gte: since } },
      orderBy: { outcomeAt: 'desc' },
    });
  }

  async recordEvent(input: {
    workspaceId: string;
    eventType: string;
    eventKey: string;
    correlation?: Record<string, unknown>;
  }) {
    await this.prisma.decisionOutcomeEvent.create({
      data: {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        eventType: input.eventType,
        eventKey: input.eventKey,
        ...(input.correlation ? { correlation: inputJson(input.correlation) } : {}),
      },
    });
  }

  async sweepExpired(workspaceId: string, maxAgeHours: number) {
    const cutoff = new Date(Date.now() - maxAgeHours * 3600 * 1000);

    const expired = await this.prisma.decisionOutcome.findMany({
      where: {
        workspaceId,
        outcomeAt: null,
        createdAt: { lt: cutoff },
      },
      select: { id: true, outcomeKey: true },
    });

    if (expired.length > 0) {
      const outcomeKeys = expired.map((e) => e.outcomeKey);
      await this.prisma.decisionOutcome.updateMany({
        where: { id: { in: expired.map((e) => e.id) } },
        data: {
          outcomeAt: new Date(),
          outcomeName: 'inbound.silent_24h',
          wonVsBaseline: false,
          outcomeValue: inputJson({
            reason: 'expired_without_reply',
            maxAgeHours,
            outcomeKeys,
          }),
        },
      });
    }

    return expired.length;
  }
}
