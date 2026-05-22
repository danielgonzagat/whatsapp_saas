import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { MindTick } from './mind.types';

@Injectable()
export class MindWorkspaceStateService {
  private readonly logger = StructuredLogger.from(MindWorkspaceStateService.name);

  constructor(private readonly prisma: PrismaService) {
    this.logger.debug?.(`MindWorkspaceStateService initialized`);
  }

  async tryAcquireTickLease(
    workspaceId: string,
    owner: string,
    ttlMs = 5 * 60 * 1000,
  ): Promise<boolean> {
    const leaseUntil = new Date(Date.now() + ttlMs);
    // Raw justified: INSERT … ON CONFLICT DO UPDATE WHERE provides an
    // atomic conditional upsert that Prisma's upsert cannot express —
    // the WHERE clause on the DO UPDATE branch rejects stale or stolen
    // leases in a single statement, avoiding a check-then-update race.
    const rows = await this.prisma.$queryRaw/* raw justified: atomic conditional lease upsert */ <
      Array<{ workspaceId: string }>
    >`
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
    await this.prisma.mindWorkspaceState.updateMany({
      where: { workspaceId, tickLeaseOwner: owner },
      data: { tickLeaseOwner: null, tickLeaseUntil: null },
    });
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
