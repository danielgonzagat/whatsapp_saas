import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { MindBelief, MindJson } from './mind.types';

function betaVariance(alpha: number, beta: number): number {
  const sum = alpha + beta;
  return (alpha * beta) / (sum * sum * (sum + 1));
}

function jsonValue(value: MindJson): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function jsonFilter(value: MindJson): Prisma.JsonFilter<'MindBelief'> {
  return { equals: jsonValue(value) };
}

@Injectable()
export class MindBeliefService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrInit(
    workspaceId: string,
    subject: string,
    predicate: string,
    context: MindJson,
  ): Promise<MindBelief> {
    const alpha = 1;
    const beta = 1;
    const contextJson = JSON.stringify(context);
    const rows = await this.prisma.$queryRaw<MindBelief[]>`
      INSERT INTO "RAC_MindBelief"
        ("id","workspaceId","subject","predicate","context","mean","variance","samples","alpha","beta")
      VALUES
        (${randomUUID()}, ${workspaceId}, ${subject}, ${predicate}, ${contextJson}::jsonb,
         ${alpha / (alpha + beta)}, ${betaVariance(alpha, beta)}, 0, ${alpha}, ${beta})
      ON CONFLICT ("workspaceId", "subject", "predicate", "context") DO NOTHING
      RETURNING *
    `;
    const inserted = rows[0];
    if (inserted) {
      return inserted;
    }

    const existing = await this.prisma.mindBelief.findFirst({
      where: { workspaceId, subject, predicate, context: jsonFilter(context) },
    });
    if (existing) {
      return existing as unknown as MindBelief;
    }

    throw new Error('mind_belief_get_or_init_failed');
  }

  async observeBinary(
    workspaceId: string,
    subject: string,
    predicate: string,
    context: MindJson,
    outcome: 0 | 1,
  ): Promise<MindBelief> {
    const current = await this.getOrInit(workspaceId, subject, predicate, context);
    const alpha = current.alpha + outcome;
    const beta = current.beta + (1 - outcome);
    const mean = alpha / (alpha + beta);
    const variance = betaVariance(alpha, beta);
    const samples = current.samples + 1;

    const updated = await this.prisma.mindBelief.update({
      where: { id: current.id! },
      data: {
        alpha,
        beta,
        mean,
        variance,
        samples,
        lastUpdate: new Date(),
      },
    });
    return updated as unknown as MindBelief;
  }

  async list(workspaceId: string, predicate: string, subject?: string): Promise<MindBelief[]> {
    const rows = await this.prisma.mindBelief.findMany({
      where: {
        workspaceId,
        predicate,
        ...(subject ? { subject } : {}),
      },
      orderBy: { samples: 'desc' },
      take: 200,
    });
    return rows as unknown as MindBelief[];
  }
}
