import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { MindTick } from './mind.types';

@Injectable()
export class MindWorkspaceStateService {
  constructor(private readonly prisma: PrismaService) {}

  async tryAcquireTickLease(
    workspaceId: string,
    owner: string,
    ttlMs = 5 * 60 * 1000,
  ): Promise<boolean> {
    const leaseUntil = new Date(Date.now() + ttlMs);
    const rows = await this.prisma.$queryRaw<Array<{ workspaceId: string }>>`
      INSERT INTO "RAC_MindWorkspaceState"
        ("id","workspaceId","tickLeaseOwner","tickLeaseUntil","createdAt","updatedAt")
      VALUES
        (${randomUUID()}, ${workspaceId}, ${owner}, ${leaseUntil}, NOW(), NOW())
      ON CONFLICT ("workspaceId") DO UPDATE
      SET "tickLeaseOwner" = EXCLUDED."tickLeaseOwner",
          "tickLeaseUntil" = EXCLUDED."tickLeaseUntil",
          "updatedAt" = NOW()
      WHERE "RAC_MindWorkspaceState"."tickLeaseUntil" IS NULL
         OR "RAC_MindWorkspaceState"."tickLeaseUntil" < NOW()
         OR "RAC_MindWorkspaceState"."tickLeaseOwner" = ${owner}
      RETURNING "workspaceId"
    `;
    return rows.length > 0;
  }

  async releaseTickLease(workspaceId: string, owner: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "RAC_MindWorkspaceState"
      SET "tickLeaseOwner" = NULL,
          "tickLeaseUntil" = NULL,
          "updatedAt" = NOW()
      WHERE "workspaceId" = ${workspaceId}
        AND "tickLeaseOwner" = ${owner}
    `;
  }

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
