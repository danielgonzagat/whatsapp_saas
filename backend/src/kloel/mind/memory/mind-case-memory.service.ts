import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../../logging/structured-logger';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';

const TOKEN_RE = /[\p{L}\p{N}]+/gu;
const MAX_OUTCOME_BOOST = 0.25;

function tokenize(text: string): string[] {
  const matches: string[] = text.toLowerCase().match(TOKEN_RE) ?? [];
  return Array.from(new Set(matches.filter((token) => token.length > 2))).slice(0, 80);
}

function jaccard(left: string[], right: string[]): number {
  const l = new Set(left);
  const r = new Set(right);
  const intersection = [...l].filter((token) => r.has(token)).length;
  const union = new Set([...l, ...r]).size;
  return union > 0 ? intersection / union : 0;
}

function featureOverlap(left: Record<string, unknown>, right: Record<string, unknown>): number {
  const keys = Object.keys(left).filter((key) => right[key] !== undefined);
  if (keys.length === 0) {
    return 0;
  }
  const matches = keys.filter((key) => String(left[key]) === String(right[key])).length;
  return matches / keys.length;
}

@Injectable()
export class MindCaseMemoryService {
  private readonly logger = StructuredLogger.from(MindCaseMemoryService.name);

  constructor(private readonly prisma: PrismaService) {
    this.logger.debug?.(`MindCaseMemoryService initialized`);
  }

  async recordCase(input: {
    action: string;
    caseType: string;
    features: Record<string, unknown>;
    occurredAt?: Date;
    outcome?: number;
    subject: string;
    text: string;
    workspaceId: string;
  }) {
    return this.prisma.mindCase.create({
      data: {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        subject: input.subject,
        caseType: input.caseType,
        text: input.text,
        tokens: tokenize(input.text),
        features: input.features as Prisma.InputJsonValue,
        action: input.action,
        outcome: input.outcome ?? null,
        occurredAt: input.occurredAt ?? new Date(),
      },
    });
  }

  /**
   * Public API for chat reasoning: find historically similar cases given
   * a current context. Maps internal similar() rows to a shape the LLM
   * can reference (situation / outcome / similarity).
   *
   * Scope is strictly isolated by workspaceId.
   */
  async findSimilarCases(
    workspaceId: string,
    context: Record<string, unknown>,
    limit: number,
  ): Promise<Array<{ situation: string; outcome: string; similarity: number }>> {
    const userMessage =
      typeof context.userMessage === 'string' && context.userMessage.length > 0
        ? context.userMessage
        : JSON.stringify(context);

    const results = await this.similar({
      workspaceId,
      text: userMessage,
      limit,
    });

    return results.map((r) => ({
      situation: r.text,
      outcome: r.outcome != null ? String(r.outcome) : 'unknown',
      similarity: r.similarity,
    }));
  }

  async similar(input: {
    caseType?: string;
    features?: Record<string, unknown>;
    limit?: number;
    text: string;
    workspaceId: string;
  }) {
    const queryTokens = tokenize(input.text);
    const rows = await this.prisma.mindCase.findMany({
      where: {
        workspaceId: input.workspaceId,
        ...(input.caseType ? { caseType: input.caseType } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      take: 500,
    });

    return rows
      .map((row) => {
        const tokenScore = jaccard(queryTokens, row.tokens);
        const featureScore = featureOverlap(
          input.features ?? {},
          row.features as Record<string, unknown>,
        );
        const outcomeBoost =
          typeof row.outcome === 'number'
            ? Math.min(Math.max(0, row.outcome) * 0.25, MAX_OUTCOME_BOOST)
            : 0;
        return { ...row, similarity: tokenScore * 0.65 + featureScore * 0.35 + outcomeBoost };
      })
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, input.limit ?? 10);
  }
}
