import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

const N_RE = /\n/g;

type EmbeddingResult = { embedding: number[]; tokensUsed: number };

/** Vector service. */
@Injectable()
export class VectorService {
  private readonly logger = new Logger(VectorService.name);
  private openai: OpenAI | null = null;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
  }

  /** Get embedding. */
  async getEmbedding(text: string): Promise<EmbeddingResult> {
    if (!this.openai) {
      return { embedding: [], tokensUsed: 0 };
    }

    // Limpar e truncar texto se necessário
    const cleanText = text.replace(N_RE, ' ').slice(0, 8000);

    // tokenBudget: non-workspace context, budget tracked at caller level
    this.logger.log('Calling OpenAI embeddings', {
      context: 'VectorService.getEmbedding',
      model: 'text-embedding-3-small',
      textLength: cleanText.length,
    });
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: cleanText,
    });

    const responseWithUsage = response as { usage?: { total_tokens?: number } };
    const usage = responseWithUsage?.usage?.total_tokens || 0;
    const first = response.data[0];
    if (!first) {
      return { embedding: [], tokensUsed: 0 };
    }
    return { embedding: first.embedding, tokensUsed: usage };
  }

  /**
   * Calcula similaridade de cosseno entre dois vetores
   */
  cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      const a = vecA[i];
      const b = vecB[i];
      if (a === undefined || b === undefined) {
        continue;
      }
      dotProduct += a * b;
      normA += a * a;
      normB += b * b;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
