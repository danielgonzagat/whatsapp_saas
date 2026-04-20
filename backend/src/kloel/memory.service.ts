import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

/** Memory item shape. */
export interface MemoryItem {
  /** Id property. */
  id: string;
  /** Workspace id property. */
  workspaceId: string;
  /** Key property. */
  key: string;
  /** Value property. */
  value: unknown;
  /** Category property. */
  category: string;
  /** Content property. */
  content: string;
  /** Similarity property. */
  similarity?: number;
}

/** Search result shape. */
export interface SearchResult {
  /** Memories property. */
  memories: MemoryItem[];
  /** Total found property. */
  totalFound: number;
  /** Search time property. */
  searchTime: number;
}

/** Memory service. */
@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
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
    } catch (error) {
      this.logger.error(`Erro salvando memória: ${error.message}`);
      throw error;
    }
  }

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
        memories,
        totalFound: memories.length,
        searchTime: Date.now() - startTime,
      };
    } catch (error) {
      this.logger.error(`Erro na busca: ${error.message}`);
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
    } catch (error) {
      this.logger.error(`Erro buscando contexto: ${error.message}`);
      return '';
    }
  }

  /**
   * 📝 Salva informação de produto
   */
  async saveProduct(
    workspaceId: string,
    productId: string,
    productData: {
      name: string;
      description: string;
      price: number;
      benefits?: string[];
    },
  ): Promise<MemoryItem> {
    const priceDisplay = Number(productData.price.toFixed(2));
    const content = `PRODUTO: ${productData.name}
PREÇO: R$ ${priceDisplay}
DESCRIÇÃO: ${productData.description}
${productData.benefits ? `BENEFÍCIOS: ${productData.benefits.join(', ')}` : ''}`.trim();

    return this.saveMemory(workspaceId, `product_${productId}`, productData, 'product', content);
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
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.kloelMemory.count({ where }),
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
    } catch (_error) {
      return false;
    }
  }
}
