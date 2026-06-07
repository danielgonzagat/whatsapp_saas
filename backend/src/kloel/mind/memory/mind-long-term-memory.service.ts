import { Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../../../logging/structured-logger';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { SpineEmitterService } from '../../spine/spine-emitter.service';

const CONSOLIDATION_INTERVAL_MS = 6 * 3600 * 1000;
const OLD_CASE_AGE_MS = 7 * 24 * 3600 * 1000;
const RECENT_WINDOW_MS = 24 * 3600 * 1000;
const SIMILARITY_THRESHOLD = 0.5;
const LOW_CONFIDENCE_THRESHOLD = 0.3;
const HIGH_FREQUENCY_THRESHOLD = 10;
const MAX_OLD_CASES = 500;
const MAX_RECENT_CASES = 500;

const TOKEN_RE = /[\p{L}\p{N}]+/gu;

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

@Injectable()
export class CaseConsolidationService {
  private readonly logger = StructuredLogger.from(CaseConsolidationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly spine?: SpineEmitterService,
  ) {
    this.logger.debug?.('CaseConsolidationService initialized');
  }

  async consolidate(workspaceId: string): Promise<{ consolidated: number; pruned: number }> {
    try {
      const shouldRun = await this.shouldConsolidate(workspaceId);
      if (!shouldRun) {
        return { consolidated: 0, pruned: 0 };
      }

      const now = Date.now();
      const oldThreshold = new Date(now - OLD_CASE_AGE_MS);
      const recentThreshold = new Date(now - RECENT_WINDOW_MS);

      const [oldCases, recentCases] = await Promise.all([
        this.prisma.mindCase.findMany({
          where: { workspaceId, occurredAt: { lt: oldThreshold } },
          orderBy: { occurredAt: 'desc' },
          take: MAX_OLD_CASES,
        }),
        this.prisma.mindCase.findMany({
          where: { workspaceId, occurredAt: { gte: recentThreshold } },
          orderBy: { occurredAt: 'desc' },
          take: MAX_RECENT_CASES,
        }),
      ]);

      let consolidated = 0;
      let pruned = 0;

      for (const oldCase of oldCases) {
        const oldTokens = tokenize(oldCase.text);
        if (oldTokens.length === 0) {
          continue;
        }

        const similarRecent = recentCases
          .map((rc) => ({ case: rc, sim: jaccard(oldTokens, tokenize(rc.text)) }))
          .filter((r) => r.sim >= SIMILARITY_THRESHOLD)
          .sort((a, b) => b.sim - a.sim);

        if (similarRecent.length > 0) {
          const bestSim = similarRecent[0].sim;
          const concept = oldCase.caseType;
          const evidence = oldCase.text.slice(0, 500);

          await this.prisma.mindConceptDetection.create({
            data: {
              id: randomUUID(),
              workspaceId,
              subject: oldCase.subject,
              concept,
              confidence: Math.min(0.95, 0.5 + bestSim * 0.45),
              evidence,
              features: oldCase.features,
              occurredAt: oldCase.occurredAt,
            },
          });
          consolidated += 1;
        }
      }

      const pruneResult = await this.prisma.mindConceptDetection.deleteMany({
        where: {
          workspaceId,
          confidence: { lt: LOW_CONFIDENCE_THRESHOLD },
          occurredAt: { lt: oldThreshold },
        },
      });
      pruned = pruneResult.count;

      const conceptCounts = await this.prisma.mindConceptDetection.groupBy({
        by: ['concept'],
        where: { workspaceId, occurredAt: { gte: recentThreshold } },
        _count: { id: true },
      });

      for (const group of conceptCounts) {
        if (group._count.id >= HIGH_FREQUENCY_THRESHOLD) {
          await this.prisma.mindConceptDetection.updateMany({
            where: {
              workspaceId,
              concept: group.concept,
              occurredAt: { gte: recentThreshold },
            },
            data: { confidence: { multiply: 1.1 } },
          });
        }
      }

      // Clamp boosted confidences (raw: Prisma multiply cannot cap)
      await this.prisma.$executeRaw`
        UPDATE "RAC_MindConceptDetection"
        SET "confidence" = 0.95
        WHERE "workspaceId" = ${workspaceId}
          AND "confidence" > 0.95
      `;

      await this.recordConsolidationWatermark(workspaceId, new Date(now));

      await this.spine?.emit({
        eventName: 'cognition.memory.consolidated',
        workspaceId,
        truthMode: 'inferred',
        provenance: {
          source: 'production',
          processor: 'MindLongTermMemoryService',
          processorVersion: '1.0.0',
          schemaVersion: '1.0',
        },
        payload: { consolidated, pruned, oldCasesConsidered: oldCases.length },
      });

      this.logger.log(
        `Memory consolidation workspace=${workspaceId} consolidated=${consolidated} pruned=${pruned}`,
      );

      return { consolidated, pruned };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Memory consolidation failed workspace=${workspaceId}: ${message}`);
      return { consolidated: 0, pruned: 0 };
    }
  }

  private async shouldConsolidate(workspaceId: string): Promise<boolean> {
    const state = await this.prisma.mindWorkspaceState.findUnique({
      where: { workspaceId },
      select: { health: true },
    });

    if (!state?.health) {
      return true;
    }

    const health = state.health as Record<string, unknown>;
    const lastAt = health['lastConsolidationAt'];
    if (typeof lastAt !== 'string') {
      return true;
    }

    const lastMs = Date.parse(lastAt);
    if (Number.isNaN(lastMs)) {
      return true;
    }

    return Date.now() - lastMs >= CONSOLIDATION_INTERVAL_MS;
  }

  private async recordConsolidationWatermark(workspaceId: string, at: Date): Promise<void> {
    const existing = await this.prisma.mindWorkspaceState.findUnique({
      where: { workspaceId },
      select: { id: true, health: true },
    });

    const health = (existing?.health as Record<string, unknown> | null) ?? {};
    health['lastConsolidationAt'] = at.toISOString();

    if (existing?.id) {
      await this.prisma.mindWorkspaceState.update({
        where: { workspaceId },
        data: { health: health as Prisma.InputJsonValue },
      });
    } else {
      await this.prisma.mindWorkspaceState.create({
        data: {
          id: randomUUID(),
          workspaceId,
          health: health as Prisma.InputJsonValue,
        },
      });
    }
  }
}
