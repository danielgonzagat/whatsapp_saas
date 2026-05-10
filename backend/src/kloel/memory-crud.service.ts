import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import type { MemoryItem } from './memory.types';

/** Memory CRUD service. */
@Injectable()
export class MemoryCrudService {
  private readonly logger = new Logger(MemoryCrudService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  /**
   * 💾 Salva memória com embedding
   */
  async saveMemory(
    workspaceId: string,
    key: string,
    value: unknown,
    category = 'general',
    content?: string,
  ): Promise<MemoryItem> {
    const textContent = content || (typeof value === 'string' ? value : JSON.stringify(value));

    try {
      // Upsert na memória (sem embedding por simplicidade inicial)
      const memory = await this.prisma.kloelMemory.upsert({
        where: {
          workspaceId_key: { workspaceId, key },
        },
        create: {
          workspaceId,
          key,
          value: value as Prisma.InputJsonValue,
          category,
          content: textContent,
        },
        update: {
          value: value as Prisma.InputJsonValue,
          category,
          content: textContent,
        },
      });

      this.logger.log(`Memória salva: ${key} (${category})`);
      return memory;
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'MemoryCrudService.saveMemory');
      this.logger.error(
        `Erro salvando memória: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * 📋 Lista memórias
   */
  async listMemories(
    workspaceId: string,
    category?: string,
    page = 1,
    limit = 20,
  ): Promise<{ memories: MemoryItem[]; total: number }> {
    const where: Record<string, unknown> = { workspaceId };
    if (category) {
      where.category = category;
    }

    const [memories, total] = await Promise.all([
      this.prisma.kloelMemory.findMany({
        where: { ...where, workspaceId },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.kloelMemory.count({ where: { ...where, workspaceId } }),
    ]);

    return { memories, total };
  }

  /**
   * 📊 Estatísticas
   */
  async getMemoryStats(workspaceId: string): Promise<unknown> {
    const memories = await this.prisma.kloelMemory.findMany({
      where: { workspaceId },
      select: { category: true, updatedAt: true },
      take: 5000,
    });

    const byCategory: Record<string, number> = {};
    for (const m of memories) {
      byCategory[m.category] = (byCategory[m.category] || 0) + 1;
    }

    return {
      totalMemories: memories.length,
      byCategory,
      lastUpdated: memories[0]?.updatedAt || null,
    };
  }

  /**
   * 🗑️ Remove memória
   */
  async deleteMemory(workspaceId: string, key: string): Promise<boolean> {
    try {
      await this.auditService
        .log({
          workspaceId,
          action: 'DELETE_MEMORY',
          resource: 'KloelMemory',
          resourceId: key,
          details: { key },
        })
        .catch(() => {});

      await this.prisma.kloelMemory.delete({
        where: { workspaceId_key: { workspaceId, key } },
      });
      return true;
    } catch (_error: unknown) {
      void this.opsAlert?.alertOnCriticalError(_error, 'MemoryCrudService.delete');
      return false;
    }
  }
}
