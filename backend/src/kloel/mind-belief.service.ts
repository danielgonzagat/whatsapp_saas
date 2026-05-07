import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { MindBelief, MindJson } from './mind.types';

function betaVariance(alpha: number, beta: number): number {
  const sum = alpha + beta;
  return (alpha * beta) / (sum * sum * (sum + 1));
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
    const existing = await this.prisma.$queryRaw<MindBelief[]>`
      SELECT * FROM "RAC_MindBelief"
      WHERE "workspaceId" = ${workspaceId}
        AND "subject" = ${subject}
        AND "predicate" = ${predicate}
        AND "context" = ${JSON.stringify(context)}::jsonb
      LIMIT 1
    `;
    if (existing[0]) {
      return existing[0];
    }

    const alpha = 1;
    const beta = 1;
    const belief: MindBelief = {
      id: randomUUID(),
      workspaceId,
      subject,
      predicate,
      context,
      mean: alpha / (alpha + beta),
      variance: betaVariance(alpha, beta),
      samples: 0,
      alpha,
      beta,
    };
    await this.prisma.$executeRaw`
      INSERT INTO "RAC_MindBelief"
        ("id","workspaceId","subject","predicate","context","mean","variance","samples","alpha","beta")
      VALUES
        (${belief.id}, ${workspaceId}, ${subject}, ${predicate}, ${JSON.stringify(context)}::jsonb,
         ${belief.mean}, ${belief.variance}, 0, ${alpha}, ${beta})
    `;
    return belief;
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

    await this.prisma.$executeRaw`
      UPDATE "RAC_MindBelief"
      SET "alpha" = ${alpha},
          "beta" = ${beta},
          "mean" = ${mean},
          "variance" = ${variance},
          "samples" = ${samples},
          "lastUpdate" = NOW(),
          "updatedAt" = NOW()
      WHERE "id" = ${current.id}
    `;

    return { ...current, alpha, beta, mean, variance, samples };
  }

  list(workspaceId: string, predicate: string, subject?: string): Promise<MindBelief[]> {
    if (subject) {
      return this.prisma.$queryRaw<MindBelief[]>`
        SELECT * FROM "RAC_MindBelief"
        WHERE "workspaceId" = ${workspaceId}
          AND "predicate" = ${predicate}
          AND "subject" = ${subject}
        ORDER BY "samples" DESC
        LIMIT 200
      `;
    }

    return this.prisma.$queryRaw<MindBelief[]>`
      SELECT * FROM "RAC_MindBelief"
      WHERE "workspaceId" = ${workspaceId}
        AND "predicate" = ${predicate}
      ORDER BY "samples" DESC
      LIMIT 200
    `;
  }
}
