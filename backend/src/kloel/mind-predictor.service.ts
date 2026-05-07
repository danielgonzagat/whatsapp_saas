import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MindBeliefService } from './mind-belief.service';
import type { MindContext, MindJson, MindPrediction } from './mind.types';

@Injectable()
export class MindPredictorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly beliefs: MindBeliefService,
  ) {}

  async predictReply(ctx: MindContext, horizonSec: number): Promise<MindPrediction> {
    return this.predict(
      ctx,
      'P(reply|template,hour,channel)',
      this.normalizeContext(ctx.features, ['template', 'hour', 'channel']),
      horizonSec,
    );
  }

  async predictConversion(ctx: MindContext, horizonSec: number): Promise<MindPrediction> {
    return this.predict(
      ctx,
      'P(conversion|segment,price_band,channel,hour)',
      this.normalizeContext(ctx.features, ['segment', 'price_band', 'channel', 'hour']),
      horizonSec,
    );
  }

  async predict(
    ctx: MindContext,
    predicate: string,
    context: MindJson,
    horizonSec: number,
  ): Promise<MindPrediction> {
    const belief = await this.beliefs.getOrInit(ctx.workspaceId, ctx.subject, predicate, context);
    const prediction: MindPrediction = {
      id: randomUUID(),
      workspaceId: ctx.workspaceId,
      subject: ctx.subject,
      predicate,
      context,
      predictedMean: belief.mean,
      predictedVariance: belief.variance,
      horizonSec,
      deadline: new Date(Date.now() + horizonSec * 1000),
    };

    await this.prisma.$executeRaw`
      INSERT INTO "RAC_MindPrediction"
        ("id","workspaceId","subject","predicate","context","predictedMean",
         "predictedVariance","horizonSec","deadline")
      VALUES
        (${prediction.id}, ${prediction.workspaceId}, ${prediction.subject}, ${prediction.predicate},
         ${JSON.stringify(prediction.context)}::jsonb, ${prediction.predictedMean},
         ${prediction.predictedVariance}, ${prediction.horizonSec}, ${prediction.deadline})
    `;

    return prediction;
  }

  async findOpen(
    workspaceId: string,
    subject: string,
    predicate: string,
  ): Promise<MindPrediction | null> {
    const rows = await this.prisma.$queryRaw<MindPrediction[]>`
      SELECT *
      FROM "RAC_MindPrediction"
      WHERE "workspaceId" = ${workspaceId}
        AND "subject" = ${subject}
        AND "predicate" = ${predicate}
        AND "resolvedAt" IS NULL
      ORDER BY "createdAt" DESC
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async listResolved(workspaceId: string, days = 7): Promise<MindPrediction[]> {
    const since = new Date(Date.now() - days * 86400 * 1000);
    return this.prisma.$queryRaw<MindPrediction[]>`
      SELECT *
      FROM "RAC_MindPrediction"
      WHERE "workspaceId" = ${workspaceId}
        AND "resolvedAt" >= ${since}
      ORDER BY "resolvedAt" DESC
      LIMIT 200
    `;
  }

  async resolve(predictionId: string, actual: number, surprise: number): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "RAC_MindPrediction"
      SET "actual" = ${actual},
          "surprise" = ${surprise},
          "resolvedAt" = NOW(),
          "updatedAt" = NOW()
      WHERE "id" = ${predictionId}
    `;
  }

  private normalizeContext(features: MindJson, keep: string[]): MindJson {
    const out: MindJson = {};
    for (const key of keep) {
      const value = features[key];
      if (value === null || value === undefined) continue;
      out[key] =
        typeof value === 'number'
          ? key === 'hour'
            ? Math.max(0, Math.min(23, Math.floor(value)))
            : this.bucketize(value)
          : this.toStableString(value).slice(0, 64);
    }
    return out;
  }

  private bucketize(value: number): string {
    if (value <= 0) return '0';
    if (value < 10) return 'under_10';
    if (value < 100) return '10_99';
    if (value < 500) return '100_499';
    if (value < 1000) return '500_999';
    return '1000_plus';
  }

  private toStableString(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return value.toString();
    }
    return JSON.stringify(value);
  }
}
