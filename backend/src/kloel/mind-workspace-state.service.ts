import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { MindTick } from './mind.types';

@Injectable()
export class MindWorkspaceStateService {
  constructor(private readonly prisma: PrismaService) {}

  async watermark(workspaceId: string, fallback: Date): Promise<Date> {
    const state = await this.prisma.mindWorkspaceState.findUnique({
      where: { workspaceId },
      select: { lastWatermark: true },
    });
    return state?.lastWatermark ?? fallback;
  }

  async recordSuccess(input: {
    health?: Prisma.InputJsonObject;
    lastWatermark: Date;
    tick: MindTick;
  }) {
    await this.prisma.mindWorkspaceState.upsert({
      where: { workspaceId: input.tick.workspaceId },
      update: {
        lastWatermark: input.lastWatermark,
        lastTickAt: new Date(),
        lastTickMs: input.tick.durationMs,
        tickCount: { increment: 1 },
        lastError: null,
        perceivedWindow: input.tick.perceived,
        surpriseWindow: input.tick.surpriseTotal,
        openDecisions: input.tick.decisionsMade,
        health: input.health ?? {},
      },
      create: {
        id: randomUUID(),
        workspaceId: input.tick.workspaceId,
        lastWatermark: input.lastWatermark,
        lastTickAt: new Date(),
        lastTickMs: input.tick.durationMs,
        tickCount: 1,
        perceivedWindow: input.tick.perceived,
        surpriseWindow: input.tick.surpriseTotal,
        openDecisions: input.tick.decisionsMade,
        health: input.health ?? {},
      },
    });
  }

  async recordFailure(workspaceId: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await this.prisma.mindWorkspaceState.upsert({
      where: { workspaceId },
      update: {
        lastTickAt: new Date(),
        lastError: message.slice(0, 500),
        health: { status: 'error' },
      },
      create: {
        id: randomUUID(),
        workspaceId,
        lastTickAt: new Date(),
        lastError: message.slice(0, 500),
        health: { status: 'error' },
      },
    });
  }
}
