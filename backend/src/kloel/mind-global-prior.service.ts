import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface GlobalPriorArmEntry {
  arm: string;
  aggregateAlpha: number;
  aggregateBeta: number;
  aggregateMean: number;
  aggregatePulls: number;
  aggregateWins: number;
  workspaceCount: number;
}

export interface GlobalPrior {
  decisionType: string;
  arms: GlobalPriorArmEntry[];
  totalPulls: number;
  meanSuccessRate: number;
}

type MindGlobalPriorDelegate = {
  createMany(input: {
    data: Array<{
      id: string;
      workspaceId: string;
      domain: string;
      predicate: string;
      context: Prisma.InputJsonObject;
      mean: number;
      variance: number;
      samples: number;
      anonymizedBy: string;
    }>;
    skipDuplicates: boolean;
  }): Promise<unknown>;
  deleteMany(input: { where: { domain: string; predicate: string } }): Promise<unknown>;
};

function hasGlobalPriorDelegate(
  prisma: PrismaService,
): prisma is PrismaService & { mindGlobalPrior: MindGlobalPriorDelegate } {
  const candidate = prisma as unknown as { mindGlobalPrior?: Partial<MindGlobalPriorDelegate> };
  return (
    typeof candidate.mindGlobalPrior?.createMany === 'function' &&
    typeof candidate.mindGlobalPrior?.deleteMany === 'function'
  );
}

@Injectable()
export class MindGlobalPriorService {
  private readonly logger = new Logger(MindGlobalPriorService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async listWorkspaceIds(): Promise<string[]> {
    const workspaces = await this.prisma.workspace.findMany({
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return workspaces.map((workspace) => workspace.id);
  }

  async getPrior(decisionType: string): Promise<GlobalPrior> {
    const startedAt = Date.now();

    const workspaceIds = await this.listWorkspaceIds();
    const arms =
      workspaceIds.length > 0
        ? await this.prisma.mindBanditArm.findMany({
            where: { workspaceId: { in: workspaceIds }, decisionType, pulls: { gt: 0 } },
            select: {
              workspaceId: true,
              arm: true,
              alpha: true,
              beta: true,
              pulls: true,
              wins: true,
            },
          })
        : [];

    const grouped = new Map<
      string,
      {
        arm: string;
        totalAlpha: number;
        totalBeta: number;
        totalPulls: number;
        totalWins: number;
        workspaces: Set<string>;
      }
    >();

    for (const row of arms) {
      const existing = grouped.get(row.arm);
      if (existing) {
        existing.totalAlpha += row.alpha;
        existing.totalBeta += row.beta;
        existing.totalPulls += row.pulls;
        existing.totalWins += row.wins;
        existing.workspaces.add(row.workspaceId);
      } else {
        grouped.set(row.arm, {
          arm: row.arm,
          totalAlpha: row.alpha,
          totalBeta: row.beta,
          totalPulls: row.pulls,
          totalWins: row.wins,
          workspaces: new Set([row.workspaceId]),
        });
      }
    }

    let totalPulls = 0;
    let totalWins = 0;

    const armEntries: GlobalPriorArmEntry[] = [];
    for (const [, entry] of grouped) {
      totalPulls += entry.totalPulls;
      totalWins += entry.totalWins;
      armEntries.push({
        arm: entry.arm,
        aggregateAlpha: entry.totalAlpha,
        aggregateBeta: entry.totalBeta,
        aggregateMean:
          entry.totalAlpha + entry.totalBeta > 0
            ? entry.totalAlpha / (entry.totalAlpha + entry.totalBeta)
            : 0,
        aggregatePulls: entry.totalPulls,
        aggregateWins: entry.totalWins,
        workspaceCount: entry.workspaces.size,
      });
    }

    armEntries.sort((a, b) => b.aggregatePulls - a.aggregatePulls);

    const meanSuccessRate = totalPulls > 0 ? totalWins / totalPulls : 0;
    await this.persistPriorSnapshot(decisionType, workspaceIds[0], armEntries);

    this.logger.debug({
      operation: 'mind.global_prior.get_prior',
      status: 'ok',
      durationMs: Date.now() - startedAt,
      decisionType,
      armCount: armEntries.length,
      totalPulls,
    });

    return {
      decisionType,
      arms: armEntries,
      totalPulls,
      meanSuccessRate,
    };
  }

  async suggestedPrior(input: {
    arm: string;
    decisionType: string;
    fallbackAlpha?: number;
    fallbackBeta?: number;
  }): Promise<{ alpha: number; beta: number; fromGlobal: boolean }> {
    const prior = await this.getPrior(input.decisionType);

    const match = prior.arms.find((a) => a.arm === input.arm);
    if (match && match.aggregatePulls >= 50) {
      return {
        alpha: match.aggregateAlpha,
        beta: match.aggregateBeta,
        fromGlobal: true,
      };
    }

    return {
      alpha: input.fallbackAlpha ?? 1,
      beta: input.fallbackBeta ?? 1,
      fromGlobal: false,
    };
  }

  async listDecisionTypes(): Promise<string[]> {
    const decisionTypes = new Set<string>();
    const workspaceIds = await this.listWorkspaceIds();

    if (workspaceIds.length > 0) {
      const rows = await this.prisma.mindBanditArm.findMany({
        where: { workspaceId: { in: workspaceIds }, pulls: { gt: 0 } },
        select: { decisionType: true },
        distinct: ['decisionType'],
        orderBy: { decisionType: 'asc' },
      });
      for (const row of rows) {
        decisionTypes.add(row.decisionType);
      }
    }

    return Array.from(decisionTypes).sort();
  }

  private async persistPriorSnapshot(
    decisionType: string,
    workspaceId: string | undefined,
    arms: GlobalPriorArmEntry[],
  ): Promise<void> {
    if (!workspaceId || arms.length === 0 || !hasGlobalPriorDelegate(this.prisma)) {
      return;
    }

    const predicate = `bandit:${decisionType}`;
    await this.prisma.mindGlobalPrior.deleteMany({
      where: { domain: 'global_anonymous', predicate },
    });
    await this.prisma.mindGlobalPrior.createMany({
      data: arms.map((arm) => ({
        id: `${decisionType}:${arm.arm}`.slice(0, 191),
        workspaceId,
        domain: 'global_anonymous',
        predicate,
        context: { arm: arm.arm },
        mean: arm.aggregateMean,
        variance:
          arm.aggregateAlpha + arm.aggregateBeta > 0
            ? (arm.aggregateMean * (1 - arm.aggregateMean)) /
              (arm.aggregateAlpha + arm.aggregateBeta + 1)
            : 0.25,
        samples: arm.aggregatePulls,
        anonymizedBy: 'workspace_aggregate_bandit',
      })),
      skipDuplicates: true,
    });
  }
}
