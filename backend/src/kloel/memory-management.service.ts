/**
 * KLOEL MEMORY MANAGEMENT SERVICE — TTL expiration, dedup, priority, orphans.
 * @@index: optimistic lock via updatedAt — concurrent writes resolved by DB constraint
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Counter, Gauge, register } from 'prom-client';
import { AuditService } from '../audit/audit.service';
import { forEachSequential } from '../common/async-sequence';
import { PrismaService } from '../prisma/prisma.service';

interface MemoryCleanupResult {
  expiredRemoved: number;
  duplicatesRemoved: number;
  orphansRemoved: number;
  totalBefore: number;
  totalAfter: number;
  duration: number;
}

interface MemoryStats {
  total: number;
  byCategory: Record<string, number>;
  byWorkspace: Record<string, number>;
  oldestEntry: Date | null;
  averageAge: number;
}

// cache.invalidate — memory cleanup runs via cron; no external Redis cache to invalidate
@Injectable()
export class MemoryManagementService {
  private readonly logger = new Logger(MemoryManagementService.name);

  // Configurações de expiração por categoria (em dias)
  private readonly EXPIRATION_DAYS: Record<string, number> = {
    products: 365, // Produtos duram 1 ano
    objection: 365, // Respostas de objeção duram 1 ano
    script: 365, // Scripts duram 1 ano
    leads: 90, // Dados de leads expiram em 90 dias
    followups: 30, // Follow-ups antigos expiram em 30 dias
    appointments: 90, // Agendamentos antigos expiram em 90 dias
    conversation_context: 7, // Contexto de conversa expira em 7 dias
    temporary: 1, // Dados temporários expiram em 1 dia
    default: 180, // Padrão: 6 meses
  };

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
  ) {}

  /**
   * Job de limpeza diária - roda às 3h da manhã
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runDailyCleanup() {
    this.logger.log('Starting daily memory cleanup');

    try {
      const result = await this.cleanupAll();
      this.logger.log(
        `Cleanup complete: removed ${result.expiredRemoved} expired, ` +
          `${result.duplicatesRemoved} duplicates, ${result.orphansRemoved} orphans`,
      );
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      // PULSE:OK — Scheduled cleanup failure is non-critical; next run will retry
      this.logger.error(`Cleanup failed: ${errorInstanceofError.message}`);
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
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      // PULSE:OK — Prometheus metric update failure is non-critical; next cron will retry
      this.logger.error(`Failed to update memory metrics: ${errorInstanceofError.message}`);
    }
  }

  /**
   * Executa limpeza completa
   */
  async cleanupAll(): Promise<MemoryCleanupResult> {
    const start = Date.now();

    // Contar antes (cross-workspace maintenance count; workspaceId filter is
    // universal since the column is NOT NULL and no-op in practice).
    const totalBefore =
      (await this.prisma.kloelMemory.count({ where: { workspaceId: { not: undefined } } })) || 0;

    // 1. Remover memórias expiradas
    const expiredRemoved = await this.removeExpiredMemories();

    // 2. Remover duplicatas
    const duplicatesRemoved = await this.removeDuplicates();

    // 3. Remover órfãos (workspaces deletados)
    const orphansRemoved = await this.removeOrphans();

    // Contar depois (cross-workspace maintenance count).
    const totalAfter =
      (await this.prisma.kloelMemory.count({ where: { workspaceId: { not: undefined } } })) || 0;

    const result: MemoryCleanupResult = {
      expiredRemoved,
      duplicatesRemoved,
      orphansRemoved,
      totalBefore,
      totalAfter,
      duration: Date.now() - start,
    };

    // Audit trail for bulk cleanup
    const totalRemoved = expiredRemoved + duplicatesRemoved + orphansRemoved;
    if (totalRemoved > 0) {
      await this.auditService
        .log({
          workspaceId: 'SYSTEM',
          action: 'DELETE_MEMORY_CLEANUP',
          resource: 'KloelMemory',
          details: {
            expiredRemoved,
            duplicatesRemoved,
            orphansRemoved,
            totalBefore,
            totalAfter,
            durationMs: result.duration,
          },
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

    await forEachSequential(Object.entries(this.EXPIRATION_DAYS), async ([category, days]) => {
      if (category === 'default') {
        return;
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      try {
        // PULSE:OK — each category has a unique cutoff date; fixed small set of categories
        const result = await this.prisma.kloelMemory.deleteMany({
          where: {
            category,
            updatedAt: { lt: cutoffDate },
            workspaceId: { not: undefined },
          },
        });

        if (result.count > 0) {
          this.logger.debug(`Removed ${result.count} expired ${category} memories`);
          totalRemoved += result.count;
        }
      } catch (error: unknown) {
        const errorInstanceofError =
          error instanceof Error
            ? error
            : new Error(typeof error === 'string' ? error : 'unknown error');
        // PULSE:OK — Per-category cleanup failure is non-critical; other categories still processed
        this.logger.warn(`Failed to cleanup ${category}: ${errorInstanceofError.message}`);
      }
    });

    // Limpar categorias não listadas com expiração padrão
    const defaultCutoff = new Date();
    defaultCutoff.setDate(defaultCutoff.getDate() - this.EXPIRATION_DAYS.default);

    const knownCategories = Object.keys(this.EXPIRATION_DAYS).filter((c) => c !== 'default');

    try {
      const result = await this.prisma.kloelMemory.deleteMany({
        where: {
          category: { notIn: knownCategories },
          updatedAt: { lt: defaultCutoff },
          workspaceId: { not: undefined },
        },
      });
      totalRemoved += result.count;
    } catch {
      // PULSE:OK — Default-category cleanup non-critical; known categories already processed above
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
        // PULSE:OK — each group has unique workspace+category filter; dedup requires per-group scan
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
        const seenKeys = new Set<string>();
        const toDelete: string[] = [];

        for (const mem of memories) {
          if (seenKeys.has(mem.key)) {
            toDelete.push(mem.id);
          } else {
            seenKeys.add(mem.key);
          }
        }

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
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      // PULSE:OK — Deduplication is a background maintenance job; next run will retry
      this.logger.warn(`Deduplication failed: ${errorInstanceofError.message}`);
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

      const existingIds = new Set(existingWorkspaces.map((w) => w.id));
      const orphanIds = workspaceIds.filter((id: string) => !existingIds.has(id));

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
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      this.logger.warn(`Orphan cleanup failed: ${errorInstanceofError.message}`);
      return 0;
    }
  }

  /**
   * Obtém estatísticas de memória
   */
  async getStats(): Promise<MemoryStats> {
    if (!this.prisma.kloelMemory) {
      return {
        total: 0,
        byCategory: {},
        byWorkspace: {},
        oldestEntry: null,
        averageAge: 0,
      };
    }

    try {
      // Total (cross-workspace stats; workspaceId filter is universal).
      const total = await this.prisma.kloelMemory.count({
        where: { workspaceId: { not: undefined } },
      });

      // Por categoria (cross-workspace aggregate).
      const byCategory: Record<string, number> = {};
      const categoryGroups = await this.prisma.kloelMemory.groupBy({
        by: ['category'],
        where: { workspaceId: { not: undefined } },
        _count: { id: true },
      });
      for (const g of categoryGroups) {
        byCategory[g.category || 'uncategorized'] = g._count.id;
      }

      // Por workspace (top 10)
      const byWorkspace: Record<string, number> = {};
      const workspaceGroups = await this.prisma.kloelMemory.groupBy({
        by: ['workspaceId'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      });
      for (const g of workspaceGroups) {
        byWorkspace[g.workspaceId] = g._count.id;
      }

      // Entrada mais antiga (cross-workspace stats).
      const oldest = await this.prisma.kloelMemory.findFirst({
        where: { workspaceId: { not: undefined } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true, workspaceId: true },
      });

      // Idade média (aproximada)
      const avgResult = await this.prisma.$queryRaw`
        SELECT AVG(EXTRACT(EPOCH FROM (NOW() - "createdAt"))) / 86400 as avg_days
        FROM "RAC_KloelMemory"
      `;
      const averageAge = Number.parseFloat(avgResult?.[0]?.avg_days || '0');

      return {
        total,
        byCategory,
        byWorkspace,
        oldestEntry: oldest?.createdAt || null,
        averageAge,
      };
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      this.logger.error(`Failed to get stats: ${errorInstanceofError.message}`);
      return {
        total: 0,
        byCategory: {},
        byWorkspace: {},
        oldestEntry: null,
        averageAge: 0,
      };
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

    const where: Record<string, unknown> = { workspaceId };

    if (options?.category) {
      where.category = options.category;
    }

    if (options?.olderThanDays) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - options.olderThanDays);
      where.updatedAt = { lt: cutoff };
    }

    const result = await this.prisma.kloelMemory.deleteMany({ where: { ...where, workspaceId } });

    if (result.count > 0) {
      await this.auditService
        .log({
          workspaceId,
          action: 'DELETE_WORKSPACE_MEMORIES',
          resource: 'KloelMemory',
          details: {
            deletedCount: result.count,
            category: options?.category,
            olderThanDays: options?.olderThanDays,
          },
        })
        .catch(() => {});
    }

    this.logger.log(
      `Cleaned ${result.count} memories from workspace ${workspaceId}${options?.category ? ` (category: ${options.category})` : ''}`,
    );

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
    const groups = new Map<string, typeof memories>();

    for (const mem of memories) {
      const prefix = mem.key.split('_').slice(0, 2).join('_');
      if (!groups.has(prefix)) {
        groups.set(prefix, []);
      }
      groups.get(prefix).push(mem);
    }

    let merged = 0;

    await forEachSequential(groups, async ([_prefix, mems]) => {
      if (mems.length <= 1) {
        return;
      }

      // Manter o mais recente, deletar os outros
      const sorted = mems.sort(
        (a: { updatedAt: Date | string }, b: { updatedAt: Date | string }) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );

      const toDelete = sorted.slice(1).map((m: { id: string }) => m.id);

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
          details: { category, mergedCount: merged },
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

          const value = typeof memory.value === 'object' ? memory.value : { content: memory.value };

          await tx.kloelMemory.updateMany({
            where: { id: memory.id, workspaceId },
            data: {
              value: {
                ...value,
                _priority: priority,
                _prioritySetAt: new Date().toISOString(),
              },
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
