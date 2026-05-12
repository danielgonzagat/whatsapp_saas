import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface MindBanditArmStatus {
  arm: string;
  isActive: boolean;
  pulls: number;
  wins: number;
  mean: number;
  score: number;
  trafficShare: number;
}

export interface MindBanditStatus {
  workspaceId: string;
  decisionType: string;
  totalPulls: number;
  recommendation: string | null;
  lift: number;
  arms: MindBanditArmStatus[];
}

function score(alpha: number, beta: number, pulls: number, totalPulls: number): number {
  const mean = alpha / (alpha + beta);
  const uncertainty = Math.sqrt(Math.log(Math.max(2, totalPulls + 1)) / Math.max(1, pulls));
  return mean + uncertainty;
}

@Injectable()
export class MindBanditService {
  private readonly logger = new Logger(MindBanditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async register(input: {
    arms: string[];
    context?: Record<string, unknown>;
    decisionType: string;
    workspaceId: string;
  }) {
    const startedAt = Date.now();
    try {
      for (const arm of input.arms) {
        await this.prisma.mindBanditArm.upsert({
          where: {
            workspaceId_decisionType_arm: {
              workspaceId: input.workspaceId,
              decisionType: input.decisionType,
              arm,
            },
          },
          update: { isActive: true, context: (input.context ?? {}) as Prisma.InputJsonValue },
          create: {
            id: randomUUID(),
            workspaceId: input.workspaceId,
            decisionType: input.decisionType,
            arm,
            isActive: true,
            context: (input.context ?? {}) as Prisma.InputJsonValue,
          },
        });
      }
      this.logger.debug({
        operation: 'mind.bandit.register',
        status: 'ok',
        durationMs: Date.now() - startedAt,
        workspaceId: input.workspaceId,
        decisionType: input.decisionType,
        armCount: input.arms.length,
      });
      return this.status(input.workspaceId, input.decisionType);
    } catch (error: unknown) {
      this.logger.warn({
        operation: 'mind.bandit.register',
        status: 'error',
        durationMs: Date.now() - startedAt,
        workspaceId: input.workspaceId,
        decisionType: input.decisionType,
        errorCode: error instanceof Error ? error.message : 'unknown',
      });
      throw error;
    }
  }

  async choose(workspaceId: string, decisionType: string) {
    const startedAt = Date.now();
    try {
      const arms = await this.prisma.mindBanditArm.findMany({
        where: { workspaceId, decisionType, isActive: true },
      });
      const totalPulls = arms.reduce((sum, arm) => sum + arm.pulls, 0);
      const chosen = [...arms].sort(
        (left, right) =>
          score(right.alpha, right.beta, right.pulls, totalPulls) -
          score(left.alpha, left.beta, left.pulls, totalPulls),
      )[0];
      if (!chosen) return null;

      await this.prisma.mindBanditArm.updateMany({
        where: { id: chosen.id, workspaceId, decisionType },
        data: { pulls: { increment: 1 } },
      });
      this.logger.debug({
        operation: 'mind.bandit.choose',
        status: 'ok',
        durationMs: Date.now() - startedAt,
        workspaceId,
        decisionType,
        arm: chosen.arm,
      });
      return { arm: chosen.arm, decisionType, workspaceId };
    } catch (error: unknown) {
      this.logger.warn({
        operation: 'mind.bandit.choose',
        status: 'error',
        durationMs: Date.now() - startedAt,
        workspaceId,
        decisionType,
        errorCode: error instanceof Error ? error.message : 'unknown',
      });
      throw error;
    }
  }

  async recordOutcome(input: {
    arm: string;
    decisionType: string;
    outcome: 0 | 1;
    workspaceId: string;
  }) {
    const startedAt = Date.now();
    try {
      await this.prisma.mindBanditArm.update({
        where: {
          workspaceId_decisionType_arm: {
            workspaceId: input.workspaceId,
            decisionType: input.decisionType,
            arm: input.arm,
          },
        },
        data: {
          alpha: { increment: input.outcome },
          beta: { increment: 1 - input.outcome },
          wins: { increment: input.outcome },
        },
      });
      this.logger.debug({
        operation: 'mind.bandit.record_outcome',
        status: 'ok',
        durationMs: Date.now() - startedAt,
        workspaceId: input.workspaceId,
        decisionType: input.decisionType,
        arm: input.arm,
      });
      return this.status(input.workspaceId, input.decisionType);
    } catch (error: unknown) {
      this.logger.warn({
        operation: 'mind.bandit.record_outcome',
        status: 'error',
        durationMs: Date.now() - startedAt,
        workspaceId: input.workspaceId,
        decisionType: input.decisionType,
        arm: input.arm,
        errorCode: error instanceof Error ? error.message : 'unknown',
      });
      throw error;
    }
  }

  async status(workspaceId: string, decisionType: string): Promise<MindBanditStatus> {
    const arms = await this.prisma.mindBanditArm.findMany({
      where: { workspaceId, decisionType },
      orderBy: [{ isActive: 'desc' }, { pulls: 'desc' }],
    });
    const totalPulls = arms.reduce((sum, arm) => sum + arm.pulls, 0);
    const totalWins = arms.reduce((sum, arm) => sum + arm.wins, 0);

    const armStatuses: MindBanditArmStatus[] = arms.map((arm) => {
      const mean = arm.pulls > 0 ? arm.alpha / (arm.alpha + arm.beta) : 0;
      const trafficShare = totalPulls > 0 ? arm.pulls / totalPulls : 0;
      return {
        arm: arm.arm,
        isActive: arm.isActive,
        pulls: arm.pulls,
        wins: arm.wins,
        mean,
        score: score(arm.alpha, arm.beta, arm.pulls, totalPulls),
        trafficShare,
      };
    });

    const sortedByScore = [...armStatuses].sort((a, b) => b.score - a.score);
    const topRecommendation = sortedByScore[0];
    const recommendation = topRecommendation?.arm ?? null;

    const overallMean = totalPulls > 0 ? totalWins / totalPulls : 0;
    const recommendationMean = topRecommendation?.mean ?? 0;
    const lift = overallMean > 0 ? (recommendationMean - overallMean) / overallMean : 0;

    return {
      workspaceId,
      decisionType,
      totalPulls,
      recommendation,
      lift,
      arms: armStatuses,
    };
  }
}
