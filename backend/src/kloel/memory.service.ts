import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import OpenAI from 'openai';

export interface MemoryItem {
  id: string;
  workspaceId: string;
  key: string;
  value: any;
  category: string;
  content: string;
  similarity?: number;
}

export interface SearchResult {
  memories: MemoryItem[];
  totalFound: number;
  searchTime: number;
}

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);
  private openai: OpenAI;
  private prismaAny: any;

  constructor(private readonly prisma: PrismaService) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.prismaAny = prisma as any;
  }

  /**
   * 🧠 Gera embedding para texto
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
        dimensions: 1536,
      });
      return response.data[0].embedding;
    } catch (error) {
      this.logger.error(`Erro gerando embedding: ${error.message}`);
      throw error;
    }
  }

  /**
   * 💾 Salva memória com embedding
   */
  async saveMemory(
    workspaceId: string,
    key: string,
    value: any,
    category: string = 'general',
    content?: string
  ): Promise<MemoryItem> {
    const textContent = content || (typeof value === 'string' ? value : JSON.stringify(value));
    
    try {
      // Upsert na memória (sem embedding por simplicidade inicial)
      const memory = await this.prismaAny.kloelMemory.upsert({
        where: {
          workspaceId_key: { workspaceId, key },
        },
        create: {
          workspaceId,
          key,
          value,
          category,
          content: textContent,
        },
        update: {
          value,
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
    limit: number = 5,
    category?: string
  ): Promise<SearchResult> {
    const startTime = Date.now();

    try {
      const where: any = { workspaceId };
      if (category) where.category = category;

      // Busca por texto simples
      where.OR = [
        { content: { contains: query, mode: 'insensitive' } },
        { key: { contains: query, mode: 'insensitive' } },
      ];

      const memories = await this.prismaAny.kloelMemory.findMany({
        where,
        take: limit,
        orderBy: { updatedAt: 'desc' },
      });

      return {
        memories,
        totalFound: memories.length,
        searchTime: Date.now() - startTime,
      };
    } catch (error) {
      this.logger.error(`Erro na busca: ${error.message}`);
      return { memories: [], totalFound: 0, searchTime: Date.now() - startTime };
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
    }
  ): Promise<MemoryItem> {
    const content = `PRODUTO: ${productData.name}
PREÇO: R$ ${productData.price.toFixed(2)}
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
    page: number = 1,
    limit: number = 20
  ): Promise<{ memories: MemoryItem[]; total: number }> {
    const where: any = { workspaceId };
    if (category) where.category = category;

    const [memories, total] = await Promise.all([
      this.prismaAny.kloelMemory.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prismaAny.kloelMemory.count({ where }),
    ]);

    return { memories, total };
  }

  /**
   * 📊 Estatísticas
   */
  async getMemoryStats(workspaceId: string): Promise<any> {
    const memories = await this.prismaAny.kloelMemory.findMany({
      where: { workspaceId },
      select: { category: true, updatedAt: true },
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
      await this.prismaAny.kloelMemory.delete({
        where: { workspaceId_key: { workspaceId, key } },
      });
      return true;
    } catch (error) {
      return false;
    }
  }
}
