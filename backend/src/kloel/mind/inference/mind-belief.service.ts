import { Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../../../logging/structured-logger';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { MindGlobalPriorService } from '../memory/mind-global-prior.service';
import type { MindBelief, MindJson } from '../../mind.types';

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
  private readonly logger = StructuredLogger.from(MindBeliefService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly globalPrior?: MindGlobalPriorService,
  ) {}

  async getOrInit(
    workspaceId: string,
    subject: string,
    predicate: string,
    context: MindJson,
  ): Promise<MindBelief> {
    const startedAt = Date.now();
    try {
      const prior = (await this.globalPrior?.lookupPrior(subject, predicate, context)) ?? null;
      const hasPrior = prior !== null;
      const alpha = prior?.alpha ?? 1;
      const beta = prior?.beta ?? 1;
      const contextJson = JSON.stringify(context);
      // Raw justified: INSERT ... ON CONFLICT DO NOTHING RETURNING is the
      // atomic insert-or-read race guard Prisma cannot express for this JSONB
      // unique key without a read-before-write window.
      const rows = await this.prisma
        .$queryRaw/* raw justified: atomic insert-or-read for JSONB composite key */ <MindBelief[]>`
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
        this.logSuccess('mind.belief.get_or_init', startedAt, workspaceId, subject, predicate, {
          hasPrior,
          priorAlpha: prior?.alpha,
          priorBeta: prior?.beta,
        });
        return inserted;
      }

      const existing = await this.prisma.mindBelief.findFirst({
        where: { workspaceId, subject, predicate, context: jsonFilter(context) },
      });
      if (existing) {
        this.logSuccess('mind.belief.get_or_init', startedAt, workspaceId, subject, predicate, {
          hasPrior,
          priorSkipped: true,
        });
        return existing as MindBelief;
      }

      throw new Error('mind_belief_get_or_init_failed');
    } catch (error: unknown) {
      this.logFailure('mind.belief.get_or_init', startedAt, workspaceId, subject, predicate, error);
      throw error;
    }
  }

  async observeBinary(
    workspaceId: string,
    subject: string,
    predicate: string,
    context: MindJson,
    outcome: 0 | 1,
  ): Promise<MindBelief> {
    const startedAt = Date.now();
    const current = await this.getOrInit(workspaceId, subject, predicate, context);
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        // Raw justified: SELECT … FOR UPDATE provides row-level pessimistic
        // locking that Prisma has no equivalent for. This guarantees atomic
        // read-modify-write on a single belief row inside a concurrent
        // observeBinary call.
        const lockedRows = await tx.$queryRaw/* raw justified: row-level lock for belief update */ <
          MindBelief[]
        >`
          SELECT * FROM "RAC_MindBelief"
          WHERE "id" = ${current.id!}
            AND "workspaceId" = ${workspaceId}
            AND "subject" = ${subject}
            AND "predicate" = ${predicate}
          FOR UPDATE
        `;
        const locked = lockedRows[0];
        if (!locked) {
          throw new Error('mind_belief_not_found');
        }
        const alpha = locked.alpha + outcome;
        const beta = locked.beta + (1 - outcome);
        const mean = alpha / (alpha + beta);
        const variance = betaVariance(alpha, beta);
        const samples = locked.samples + 1;

        await tx.mindBelief.updateMany({
          where: { id: locked.id!, workspaceId, subject, predicate },
          data: {
            alpha,
            beta,
            mean,
            variance,
            samples,
            lastUpdate: new Date(),
          },
        });
        return tx.mindBelief.findFirstOrThrow({
          where: { id: locked.id!, workspaceId, subject, predicate },
        });
      });
      this.logSuccess('mind.belief.observe_binary', startedAt, workspaceId, subject, predicate);
      return updated as MindBelief;
    } catch (error: unknown) {
      this.logFailure(
        'mind.belief.observe_binary',
        startedAt,
        workspaceId,
        subject,
        predicate,
        error,
      );
      throw error;
    }
  }

  async list(workspaceId: string, predicate: string, subject?: string): Promise<MindBelief[]> {
    const startedAt = Date.now();
    try {
      const rows = await this.prisma.mindBelief.findMany({
        where: {
          workspaceId,
          predicate,
          ...(subject ? { subject } : {}),
        },
        orderBy: { samples: 'desc' },
        take: 200,
      });
      this.logSuccess('mind.belief.list', startedAt, workspaceId, subject, predicate);
      return rows as MindBelief[];
    } catch (error: unknown) {
      this.logFailure('mind.belief.list', startedAt, workspaceId, subject, predicate, error);
      throw error;
    }
  }

  private logSuccess(
    operation: string,
    startedAt: number,
    workspaceId: string,
    subject?: string,
    predicate?: string,
    trace?: Record<string, unknown>,
  ): void {
    this.logger.debug({
      operation,
      status: 'ok',
      durationMs: Date.now() - startedAt,
      workspaceId,
      subject,
      predicate,
      ...(trace ?? {}),
    });
  }

  private logFailure(
    operation: string,
    startedAt: number,
    workspaceId: string,
    subject: string | undefined,
    predicate: string | undefined,
    error: unknown,
  ): void {
    this.logger.warn({
      operation,
      status: 'error',
      durationMs: Date.now() - startedAt,
      workspaceId,
      subject,
      predicate,
      errorCode: error instanceof Error ? error.message : 'unknown',
    });
  }
}
