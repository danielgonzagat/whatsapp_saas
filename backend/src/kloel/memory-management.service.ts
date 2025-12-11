/**
 * ============================================
 * KLOEL MEMORY MANAGEMENT SERVICE
 * ============================================
 * Gerencia memória da IA com:
 * - Expiração automática de memórias antigas
 * - Deduplicação de entradas similares
 * - Classificação por prioridade
 * - Agrupamento semântico
 * - Limpeza de dados órfãos
 * ============================================
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { Counter, Gauge } from 'prom-client';

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

@Injectable()
export class MemoryManagementService {
  private readonly logger = new Logger(MemoryManagementService.name);
  private readonly prismaAny: any;

  // Configurações de expiração por categoria (em dias)
  private readonly EXPIRATION_DAYS: Record<string, number> = {
    products: 365,        // Produtos duram 1 ano
    objection: 365,       // Respostas de objeção duram 1 ano
    script: 365,          // Scripts duram 1 ano
    leads: 90,            // Dados de leads expiram em 90 dias
    followups: 30,        // Follow-ups antigos expiram em 30 dias
    appointments: 90,     // Agendamentos antigos expiram em 90 dias
    conversation_context: 7, // Contexto de conversa expira em 7 dias
    temporary: 1,         // Dados temporários expiram em 1 dia
    default: 180,         // Padrão: 6 meses
  };

  // Métricas
  private readonly memoriesGauge = new Gauge({
    name: 'kloel_memories_total',
    help: 'Total memories by category',
    labelNames: ['category'],
  });

  private readonly cleanupCounter = new Counter({
    name: 'kloel_memory_cleanup_total',
    help: 'Memory cleanup operations',
    labelNames: ['type'],
  });

  constructor(private readonly prisma: PrismaService) {
    this.prismaAny = prisma as any;
  }

  /**
   * Job de limpeza diária - roda às 3h da manhã
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runDailyCleanup() {
    this.logger.log('🧹 Starting daily memory cleanup');
    
    try {
      const result = await this.cleanupAll();
      this.logger.log(`✅ Cleanup complete: removed ${result.expiredRemoved} expired, ` +
        `${result.duplicatesRemoved} duplicates, ${result.orphansRemoved} orphans`);
    } catch (error: any) {
      this.logger.error(`❌ Cleanup failed: ${error.message}`);
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
    } catch (error: any) {
      this.logger.error(`Failed to update memory metrics: ${error.message}`);
    }
  }

  /**
   * Executa limpeza completa
   */
  async cleanupAll(): Promise<MemoryCleanupResult> {
    const start = Date.now();
    
    // Contar antes
    const totalBefore = await this.prismaAny.kloelMemory?.count() || 0;

    // 1. Remover memórias expiradas
    const expiredRemoved = await this.removeExpiredMemories();
    
    // 2. Remover duplicatas
    const duplicatesRemoved = await this.removeDuplicates();
    
    // 3. Remover órfãos (workspaces deletados)
    const orphansRemoved = await this.removeOrphans();

    // Contar depois
    const totalAfter = await this.prismaAny.kloelMemory?.count() || 0;

    const result: MemoryCleanupResult = {
      expiredRemoved,
      duplicatesRemoved,
      orphansRemoved,
      totalBefore,
      totalAfter,
      duration: Date.now() - start,
    };

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
    if (!this.prismaAny.kloelMemory) return 0;

    let totalRemoved = 0;

    for (const [category, days] of Object.entries(this.EXPIRATION_DAYS)) {
      if (category === 'default') continue;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      try {
        const result = await this.prismaAny.kloelMemory.deleteMany({
          where: {
            category,
            updatedAt: { lt: cutoffDate },
          },
        });
        
        if (result.count > 0) {
          this.logger.debug(`Removed ${result.count} expired ${category} memories`);
          totalRemoved += result.count;
        }
      } catch (error: any) {
        this.logger.warn(`Failed to cleanup ${category}: ${error.message}`);
      }
    }

    // Limpar categorias não listadas com expiração padrão
    const defaultCutoff = new Date();
    defaultCutoff.setDate(defaultCutoff.getDate() - this.EXPIRATION_DAYS.default);

    const knownCategories = Object.keys(this.EXPIRATION_DAYS).filter(c => c !== 'default');
    
    try {
      const result = await this.prismaAny.kloelMemory.deleteMany({
        where: {
          category: { notIn: knownCategories },
          updatedAt: { lt: defaultCutoff },
        },
      });
      totalRemoved += result.count;
    } catch {
      // Ignorar se falhar
    }

    return totalRemoved;
  }

  /**
   * Remove duplicatas (mesmo workspace + categoria + valor similar)
   */
  private async removeDuplicates(): Promise<number> {
    if (!this.prismaAny.kloelMemory) return 0;

    let totalRemoved = 0;

    try {
      // Buscar memórias agrupadas por workspace + categoria
      const groups = await this.prismaAny.kloelMemory.groupBy({
        by: ['workspaceId', 'category'],
        _count: { id: true },
        having: {
          id: { _count: { gt: 100 } }, // Só processar grupos com muitas entradas
        },
      });

      for (const group of groups) {
        // Para cada grupo grande, remover duplicatas antigas
        const memories = await this.prismaAny.kloelMemory.findMany({
          where: {
            workspaceId: group.workspaceId,
            category: group.category,
          },
          orderBy: { updatedAt: 'desc' },
          select: { id: true, key: true, value: true },
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
          await this.prismaAny.kloelMemory.deleteMany({
            where: { id: { in: toDelete } },
          });
          totalRemoved += toDelete.length;
          this.logger.debug(
            `Removed ${toDelete.length} duplicate memories from ${group.workspaceId}/${group.category}`
          );
        }
      }
    } catch (error: any) {
      this.logger.warn(`Deduplication failed: ${error.message}`);
    }

    return totalRemoved;
  }

  /**
   * Remove memórias de workspaces deletados
   */
  private async removeOrphans(): Promise<number> {
    if (!this.prismaAny.kloelMemory) return 0;

    try {
      // Buscar workspaceIds únicos nas memórias
      const memoryWorkspaces = await this.prismaAny.kloelMemory.groupBy({
        by: ['workspaceId'],
      });

      const workspaceIds = memoryWorkspaces.map((m: any) => m.workspaceId);

      // Verificar quais existem
      const existingWorkspaces = await this.prisma.workspace.findMany({
        where: { id: { in: workspaceIds } },
        select: { id: true },
      });

      const existingIds = new Set(existingWorkspaces.map(w => w.id));
      const orphanIds = workspaceIds.filter((id: string) => !existingIds.has(id));

      if (orphanIds.length === 0) return 0;

      // Remover memórias órfãs
      const result = await this.prismaAny.kloelMemory.deleteMany({
        where: { workspaceId: { in: orphanIds } },
      });

      this.logger.log(`Removed ${result.count} orphan memories from ${orphanIds.length} deleted workspaces`);
      return result.count;
    } catch (error: any) {
      this.logger.warn(`Orphan cleanup failed: ${error.message}`);
      return 0;
    }
  }

  /**
   * Obtém estatísticas de memória
   */
  async getStats(): Promise<MemoryStats> {
    if (!this.prismaAny.kloelMemory) {
      return {
        total: 0,
        byCategory: {},
        byWorkspace: {},
        oldestEntry: null,
        averageAge: 0,
      };
    }

    try {
      // Total
      const total = await this.prismaAny.kloelMemory.count();

      // Por categoria
      const byCategory: Record<string, number> = {};
      const categoryGroups = await this.prismaAny.kloelMemory.groupBy({
        by: ['category'],
        _count: { id: true },
      });
      for (const g of categoryGroups) {
        byCategory[g.category || 'uncategorized'] = g._count.id;
      }

      // Por workspace (top 10)
      const byWorkspace: Record<string, number> = {};
      const workspaceGroups = await this.prismaAny.kloelMemory.groupBy({
        by: ['workspaceId'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      });
      for (const g of workspaceGroups) {
        byWorkspace[g.workspaceId] = g._count.id;
      }

      // Entrada mais antiga
      const oldest = await this.prismaAny.kloelMemory.findFirst({
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      });

      // Idade média (aproximada)
      const avgResult = await this.prismaAny.$queryRaw`
        SELECT AVG(EXTRACT(EPOCH FROM (NOW() - "createdAt"))) / 86400 as avg_days
        FROM "KloelMemory"
      `;
      const averageAge = parseFloat((avgResult as any)?.[0]?.avg_days || '0');

      return {
        total,
        byCategory,
        byWorkspace,
        oldestEntry: oldest?.createdAt || null,
        averageAge,
      };
    } catch (error: any) {
      this.logger.error(`Failed to get stats: ${error.message}`);
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
    options?: { category?: string; olderThanDays?: number }
  ): Promise<number> {
    if (!this.prismaAny.kloelMemory) return 0;

    const where: any = { workspaceId };

    if (options?.category) {
      where.category = options.category;
    }

    if (options?.olderThanDays) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - options.olderThanDays);
      where.updatedAt = { lt: cutoff };
    }

    const result = await this.prismaAny.kloelMemory.deleteMany({ where });
    
    this.logger.log(
      `Cleaned ${result.count} memories from workspace ${workspaceId}` +
      (options?.category ? ` (category: ${options.category})` : '')
    );
    
    return result.count;
  }

  /**
   * Normaliza memórias duplicadas por similaridade semântica
   * (merge entries com mesma intenção)
   */
  async normalizeSemanticDuplicates(workspaceId: string, category: string): Promise<number> {
    // Implementação básica - em produção usaria embeddings
    if (!this.prismaAny.kloelMemory) return 0;

    const memories = await this.prismaAny.kloelMemory.findMany({
      where: { workspaceId, category },
      select: { id: true, key: true, value: true, updatedAt: true },
    });

    if (memories.length < 2) return 0;

    // Agrupar por prefixo de key (ex: "product_", "lead_")
    const groups = new Map<string, typeof memories>();
    
    for (const mem of memories) {
      const prefix = mem.key.split('_').slice(0, 2).join('_');
      if (!groups.has(prefix)) {
        groups.set(prefix, []);
      }
      groups.get(prefix)!.push(mem);
    }

    let merged = 0;

    for (const [prefix, mems] of groups) {
      if (mems.length <= 1) continue;

      // Manter o mais recente, deletar os outros
      const sorted = mems.sort((a: any, b: any) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      
      const toDelete = sorted.slice(1).map((m: any) => m.id);
      
      if (toDelete.length > 0) {
        await this.prismaAny.kloelMemory.deleteMany({
          where: { id: { in: toDelete } },
        });
        merged += toDelete.length;
      }
    }

    return merged;
  }

  /**
   * Define prioridade de uma memória
   */
  async setMemoryPriority(
    workspaceId: string,
    memoryKey: string,
    priority: 'low' | 'normal' | 'high' | 'critical'
  ): Promise<boolean> {
    if (!this.prismaAny.kloelMemory) return false;

    try {
      const memory = await this.prismaAny.kloelMemory.findFirst({
        where: { workspaceId, key: memoryKey },
      });

      if (!memory) return false;

      const value = typeof memory.value === 'object' ? memory.value : { content: memory.value };
      
      await this.prismaAny.kloelMemory.update({
        where: { id: memory.id },
        data: {
          value: { ...value, _priority: priority, _prioritySetAt: new Date().toISOString() },
        },
      });

      return true;
    } catch {
      return false;
    }
  }
}
