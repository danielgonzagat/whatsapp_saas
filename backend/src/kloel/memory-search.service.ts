import { Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import type { SearchResult } from './memory.types';

/** Memory search service. */
@Injectable()
export class MemorySearchService {
  private readonly logger = StructuredLogger.from(MemorySearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  /**
   * 🔍 Busca memórias por texto
   */
  async searchMemory(
    workspaceId: string,
    query: string,
    limit = 5,
    category?: string,
  ): Promise<SearchResult> {
    const startTime = Date.now();

    try {
      const where: Record<string, unknown> = { workspaceId };
      if (category) {
        where.category = category;
      }

      // Busca por texto simples
      where.OR = [
        { content: { contains: query, mode: 'insensitive' } },
        { key: { contains: query, mode: 'insensitive' } },
      ];

      const memories = await this.prisma.kloelMemory.findMany({
        where,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          workspaceId: true,
          key: true,
          value: true,
          category: true,
          type: true,
          content: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return {
        memories: memories.map((m) => ({
          id: m.id,
          workspaceId: m.workspaceId,
          key: m.key,
          value: m.value,
          category: m.category,
          content: m.content ?? '',
        })),
        totalFound: memories.length,
        searchTime: Date.now() - startTime,
      };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'MemorySearchService.now');
      this.logger.error(`Erro na busca: ${error instanceof Error ? error.message : String(error)}`);
      return {
        memories: [],
        totalFound: 0,
        searchTime: Date.now() - startTime,
      };
    }
  }

  /**
   * 📚 Busca contexto relevante para vendas
   */
  async getSalesContext(workspaceId: string, customerMessage: string): Promise<string> {
    try {
      const productSearch = await this.searchMemory(workspaceId, customerMessage, 3, 'product');
      const scriptSearch = await this.searchMemory(workspaceId, customerMessage, 2, 'script');
      const objectionSearch = await this.searchMemory(workspaceId, customerMessage, 2, 'objection');

      const contextParts: string[] = [];

      if (productSearch.memories.length > 0) {
        contextParts.push('=== PRODUTOS RELEVANTES ===');
        for (const m of productSearch.memories) {
          contextParts.push(m.content || JSON.stringify(m.value));
        }
      }

      if (scriptSearch.memories.length > 0) {
        contextParts.push('\n=== SCRIPTS DE VENDA ===');
        for (const m of scriptSearch.memories) {
          contextParts.push(m.content || JSON.stringify(m.value));
        }
      }

      if (objectionSearch.memories.length > 0) {
        contextParts.push('\n=== RESPOSTAS A OBJEÇÕES ===');
        for (const m of objectionSearch.memories) {
          contextParts.push(m.content || JSON.stringify(m.value));
        }
      }

      return contextParts.join('\n');
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'MemorySearchService.join');
      this.logger.error(
        `Erro buscando contexto: ${error instanceof Error ? error.message : String(error)}`,
      );
      return '';
    }
  }
}
