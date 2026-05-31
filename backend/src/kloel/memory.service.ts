import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { MemoryCrudService } from './memory-crud.service';
import { MemorySearchService } from './memory-search.service';
import type { MemoryItem, SearchResult } from './memory.types';

export type { MemoryItem, SearchResult };

/** Memory service. */
@Injectable()
export class MemoryService {
  private readonly logger = StructuredLogger.from(MemoryService.name);

  constructor(
    private readonly memoryCrud: MemoryCrudService,
    private readonly memorySearch: MemorySearchService,
  ) {
    this.logger.debug?.(`MemoryService initialized`);
  }

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
    return this.memoryCrud.saveMemory(workspaceId, key, value, category, content);
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
    return this.memorySearch.searchMemory(workspaceId, query, limit, category);
  }

  /**
   * 📚 Busca contexto relevante para vendas
   */
  async getSalesContext(workspaceId: string, contactMessage: string): Promise<string> {
    return this.memorySearch.getSalesContext(workspaceId, contactMessage);
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

    return this.memoryCrud.saveMemory(
      workspaceId,
      `product_${productId}`,
      productData,
      'product',
      content,
    );
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
    return this.memoryCrud.listMemories(workspaceId, category, page, limit);
  }

  /**
   * 📊 Estatísticas
   */
  async getMemoryStats(workspaceId: string): Promise<unknown> {
    return this.memoryCrud.getMemoryStats(workspaceId);
  }

  /**
   * 🗑️ Remove memória
   */
  async deleteMemory(workspaceId: string, key: string): Promise<boolean> {
    return this.memoryCrud.deleteMemory(workspaceId, key);
  }

  /**
   * Canonical-name alias of {@link searchMemory} for the Kloel capability
   * resolver (`MemoryService.search`). Accepts the (workspaceId, args)
   * signature used by `KloelDomainServiceResolver`.
   */
  async search(
    workspaceId: string,
    args?: { query?: string; limit?: number; category?: string },
  ): Promise<SearchResult> {
    const query = typeof args?.query === 'string' ? args.query : '';
    const limit = typeof args?.limit === 'number' ? args.limit : 5;
    const category = typeof args?.category === 'string' ? args.category : undefined;
    return this.searchMemory(workspaceId, query, limit, category);
  }

  /**
   * Canonical-name alias of {@link saveMemory} for the Kloel capability
   * resolver (`MemoryService.set`). Accepts the (workspaceId, args)
   * signature used by `KloelDomainServiceResolver`.
   */
  async set(
    workspaceId: string,
    args?: { key?: string; value?: unknown; category?: string; content?: string },
  ): Promise<MemoryItem> {
    const key = typeof args?.key === 'string' ? args.key : '';
    if (!key) {
      throw new Error('MemoryService.set: args.key is required');
    }
    const value = args?.value ?? null;
    const category = typeof args?.category === 'string' ? args.category : 'general';
    const content = typeof args?.content === 'string' ? args.content : undefined;
    return this.saveMemory(workspaceId, key, value, category, content);
  }
}
