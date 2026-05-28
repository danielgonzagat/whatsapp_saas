/**
 * KLOEL MEMORY MANAGEMENT SERVICE — TTL expiration, dedup, priority, orphans.
 * @@index: optimistic lock via updatedAt — concurrent writes resolved by DB constraint
 */
import { Injectable, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import { StructuredLogger } from '../logging/structured-logger';
import { Counter, Gauge, register } from 'prom-client';
import { AuditService } from '../audit/audit.service';
import { forEachSequential } from '../common/async-sequence';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { computeMemoryStats, type MemoryStats } from './memory-stats';
import {
  MEMORY_EXPIRATION_DAYS,
  buildMemoryCleanupAuditDetails,
  buildWorkspaceCleanupFilter,
  composeMemoryPriorityValue,
  cutoffDateForCategory,
  findDuplicateMemoryIds,
  findOrphanWorkspaceIds,
  groupMemoriesByKeyPrefix,
  knownMemoryCategories,
  pickStaleSemanticDuplicateIds,
} from './memory-management.policies';
import {
  buildSemanticDuplicateAuditDetails,
  buildWorkspaceCleanupAuditDetails,
  emptyMemoryStats,
  formatCategoryCleanupFailureMessage,
  formatCleanupFailureMessage,
  formatCleanupSummaryMessage,
  formatDeduplicationFailureMessage,
  formatGetStatsFailureMessage,
  formatOrphanCleanupFailureMessage,
  formatStaleUncategorizedFailureMessage,
  formatStatsFailureMessage,
  formatWorkspaceCleanupMessage,
  type MemoryCleanupResult,
} from './memory-management.service.helpers';

// Cache.invalidate — memory cleanup runs via cron; no external Redis cache to invalidate
@Injectable()
export class MemoryManagementService {
  private readonly logger = StructuredLogger.from(MemoryManagementService.name);

  // Configurações de expiração por categoria (em dias).
  // Source of truth lives in `memory-management.policies` for reuse and testing.
  private readonly EXPIRATION_DAYS: Readonly<Record<string, number>> = MEMORY_EXPIRATION_DAYS;

  // Métricas
  private readonly memoriesGauge =
    (register.getSingleMetric('kloel_memories_total') as Gauge<string>) ||
    new Gauge({
      name: 'kloel_memories_total',
      help: 'Total memories by category',
      labelNames: ['category'],
    });

  private readonly cleanupCounter =
    (register.getSingleMetric('kloel_memory_cleanup_total') as Counter<string>) ||
    new Counter({
      name: 'kloel_memory_cleanup_total',
      help: 'Memory cleanup operations',
      labelNames: ['type'],
    });

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  /**
   * Job de limpeza diária - roda às 3h da manhã
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runDailyCleanup() {
    this.logger.log('Starting daily memory cleanup');

    try {
      const result = await this.cleanupAll();
      this.logger.log(formatCleanupSummaryMessage(result));
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'MemoryManagementService.runDailyCleanup');
      this.logger.error(formatCleanupFailureMessage(error));
    }
  }

  /**
   * Job de métricas a cada hora
   */
  @Cron(CronExpression.EVERY_HOUR)
  async updateMetrics() {
    try {
      const stats = await this.getStats();

      for (const [category, count] of Object.entries(stats.byCategory)) {
        this.memoriesGauge.set({ category }, count);
      }
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'MemoryManagementService.getStats');
      this.logger.error(formatStatsFailureMessage(error));
    }
  }

  /**
   * Executa limpeza completa
   */
  async cleanupAll(): Promise<MemoryCleanupResult> {
    const start = Date.now();

    // @CrossWorkspaceMaintenance: cleanup audit metric, global by design
    const totalBefore =
      (await this.prisma.kloelMemory.count({ where: { workspaceId: { not: '' } } })) || 0;

    // 1. Remover memórias expiradas
    const expiredRemoved = await this.removeExpiredMemories();

    // 2. Remover duplicatas
    const duplicatesRemoved = await this.removeDuplicates();

    // 3. Remover órfãos (workspaces deletados)
    const orphansRemoved = await this.removeOrphans();

    // @CrossWorkspaceMaintenance: cleanup audit metric, global by design
    const totalAfter =
      (await this.prisma.kloelMemory.count({ where: { workspaceId: { not: '' } } })) || 0;

    const result: MemoryCleanupResult = {
      expiredRemoved,
      duplicatesRemoved,
      orphansRemoved,
      totalBefore,
      totalAfter,
      duration: Date.now() - start,
    };

    // Audit trail for bulk cleanup
    const auditDetails = buildMemoryCleanupAuditDetails({
      expiredRemoved,
      duplicatesRemoved,
      orphansRemoved,
      totalBefore,
      totalAfter,
      durationMs: result.duration,
    });
    if (auditDetails) {
      await this.auditService
        .log({
          workspaceId: 'SYSTEM',
          action: 'DELETE_MEMORY_CLEANUP',
          resource: 'KloelMemory',
          details: auditDetails,
        })
        .catch(() => {});
    }

    // Registrar métricas
    this.cleanupCounter.inc({ type: 'expired' }, expiredRemoved);
    this.cleanupCounter.inc({ type: 'duplicates' }, duplicatesRemoved);
    this.cleanupCounter.inc({ type: 'orphans' }, orphansRemoved);

    return result;
  }

  /**
   * Remove memórias expiradas por categoria
   */
  private async removeExpiredMemories(): Promise<number> {
    if (!this.prisma.kloelMemory) {
      return 0;
    }

    let totalRemoved = 0;

    await forEachSequential(Object.entries(this.EXPIRATION_DAYS), async ([category, _days]) => {
      if (category === 'default') {
        return;
      }

      const cutoffDate = cutoffDateForCategory(category, this.EXPIRATION_DAYS);

      try {
        // @CrossWorkspaceMaintenance: cron purge of expired memories across all workspaces
        const result = await this.prisma.kloelMemory.deleteMany({
          where: {
            workspaceId: { not: '' },
            category,
            updatedAt: { lt: cutoffDate },
          },
        });

        if (result.count > 0) {
          this.logger.debug(`Removed ${result.count} expired ${category} memories`);
          totalRemoved += result.count;
        }
      } catch (error: unknown) {
        void this.opsAlert?.alertOnCriticalError(
          error,
          'MemoryManagementService.removeExpiredMemories',
        );
        this.logger.warn(formatCategoryCleanupFailureMessage(category, error));
      }
    });

    const defaultCutoff = cutoffDateForCategory('default', this.EXPIRATION_DAYS);
    const knownCategories = knownMemoryCategories(this.EXPIRATION_DAYS);

    try {
      // @CrossWorkspaceMaintenance: cron purge of uncategorized stale memories
      const result = await this.prisma.kloelMemory.deleteMany({
        where: {
          workspaceId: { not: '' },
          category: { notIn: knownCategories },
          updatedAt: { lt: defaultCutoff },
        },
      });
      totalRemoved += result.count;
    } catch (error: unknown) {
      this.logger.warn(formatStaleUncategorizedFailureMessage(error));
    }

    return totalRemoved;
  }

  /**
   * Remove duplicatas (mesmo workspace + categoria + valor similar)
   */
  private async removeDuplicates(): Promise<number> {
    if (!this.prisma.kloelMemory) {
      return 0;
    }

    let totalRemoved = 0;

    try {
      // Buscar memórias agrupadas por workspace + categoria
      const groups = await this.prisma.kloelMemory.groupBy({
        by: ['workspaceId', 'category'],
        _count: { id: true },
        having: {
          id: { _count: { gt: 100 } }, // Só processar grupos com muitas entradas
        },
      });

      await forEachSequential(groups, async (group) => {
        const memories = await this.prisma.kloelMemory.findMany({
          where: {
            workspaceId: group.workspaceId,
            category: group.category,
          },
          orderBy: { updatedAt: 'desc' },
          select: { id: true, key: true, value: true },
          take: 500,
        });

        // Manter apenas entradas únicas (por key)
        const toDelete = findDuplicateMemoryIds(memories);

        if (toDelete.length > 0) {
          await this.prisma.kloelMemory.deleteMany({
            where: { id: { in: toDelete }, workspaceId: group.workspaceId },
          });
          totalRemoved += toDelete.length;
          this.logger.debug(
            `Removed ${toDelete.length} duplicate memories from ${group.workspaceId}/${group.category}`,
          );
        }
      });
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'MemoryManagementService.removeDuplicates');
      this.logger.warn(formatDeduplicationFailureMessage(error));
    }

    return totalRemoved;
  }

  /**
   * Remove memórias de workspaces deletados
   */
  private async removeOrphans(): Promise<number> {
    if (!this.prisma.kloelMemory) {
      return 0;
    }

    try {
      // Buscar workspaceIds únicos nas memórias
      const memoryWorkspaces = await this.prisma.kloelMemory.groupBy({
        by: ['workspaceId'],
      });

      const workspaceIds = memoryWorkspaces.map((m: { workspaceId: string }) => m.workspaceId);

      // Verificar quais existem
      const existingWorkspaces = await this.prisma.workspace.findMany({
        where: { id: { in: workspaceIds } },
        select: { id: true },
        take: 1000,
      });

      const orphanIds = findOrphanWorkspaceIds(
        workspaceIds,
        existingWorkspaces.map((w) => w.id),
      );

      if (orphanIds.length === 0) {
        return 0;
      }

      // Remover memórias órfãs
      const result = await this.prisma.kloelMemory.deleteMany({
        where: { workspaceId: { in: orphanIds } },
      });

      this.logger.log(
        `Removed ${result.count} orphan memories from ${orphanIds.length} deleted workspaces`,
      );
      return result.count;
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'MemoryManagementService.removeOrphans');
      this.logger.warn(formatOrphanCleanupFailureMessage(error));
      return 0;
    }
  }

  /**
   * Obtém estatísticas de memória
   */
  async getStats(): Promise<MemoryStats> {
    try {
      return await computeMemoryStats(this.prisma);
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'MemoryManagementService.parseFloat');
      this.logger.error(formatGetStatsFailureMessage(error));
      return emptyMemoryStats();
    }
  }

  /**
   * Limpa memórias de um workspace específico
   */
  async cleanupWorkspace(
    workspaceId: string,
    options?: { category?: string; olderThanDays?: number },
  ): Promise<number> {
    if (!this.prisma.kloelMemory) {
      return 0;
    }

    const where = buildWorkspaceCleanupFilter(workspaceId, options);

    const result = await this.prisma.kloelMemory.deleteMany({ where: { ...where, workspaceId } });

    if (result.count > 0) {
      await this.auditService
        .log({
          workspaceId,
          action: 'DELETE_WORKSPACE_MEMORIES',
          resource: 'KloelMemory',
          details: buildWorkspaceCleanupAuditDetails(result.count, options),
        })
        .catch(() => {});
    }

    this.logger.log(formatWorkspaceCleanupMessage(workspaceId, result.count, options));

    return result.count;
  }

  /**
   * Normaliza memórias duplicadas por similaridade semântica
   * (merge entries com mesma intenção)
   */
  async normalizeSemanticDuplicates(workspaceId: string, category: string): Promise<number> {
    // Implementação básica - em produção usaria embeddings
    if (!this.prisma.kloelMemory) {
      return 0;
    }

    const memories = await this.prisma.kloelMemory.findMany({
      where: { workspaceId, category },
      select: { id: true, key: true, value: true, updatedAt: true },
      take: 500,
    });

    if (memories.length < 2) {
      return 0;
    }

    // Agrupar por prefixo de key (ex: "product_", "lead_")
    const groups = groupMemoriesByKeyPrefix(memories);

    let merged = 0;

    await forEachSequential(groups, async ([_prefix, mems]) => {
      // Manter o mais recente, deletar os outros
      const toDelete = pickStaleSemanticDuplicateIds(mems);

      if (toDelete.length > 0) {
        await this.prisma.kloelMemory.deleteMany({
          where: { id: { in: toDelete }, workspaceId },
        });
        merged += toDelete.length;
      }
    });

    if (merged > 0) {
      await this.auditService
        .log({
          workspaceId,
          action: 'DELETE_SEMANTIC_DUPLICATES',
          resource: 'KloelMemory',
          details: buildSemanticDuplicateAuditDetails(category, merged),
        })
        .catch(() => {});
    }

    return merged;
  }

  /**
   * Define prioridade de uma memória
   */
  async setMemoryPriority(
    workspaceId: string,
    memoryKey: string,
    priority: 'low' | 'normal' | 'high' | 'critical',
  ): Promise<boolean> {
    if (!this.prisma.kloelMemory) {
      return false;
    }

    try {
      // Wrap find+update in $transaction to prevent concurrent writes from
      // overwriting each other's priority changes.
      return await this.prisma.$transaction(
        async (tx) => {
          const memory = await tx.kloelMemory.findFirst({
            where: { workspaceId, key: memoryKey },
          });

          if (!memory) {
            return false;
          }

          await tx.kloelMemory.updateMany({
            where: { id: memory.id, workspaceId },
            data: {
              value: composeMemoryPriorityValue(memory.value, priority) as Prisma.InputJsonValue,
            },
          });

          return true;
        },
        { isolationLevel: 'ReadCommitted' },
      );
    } catch {
      return false;
    }
  }
}
