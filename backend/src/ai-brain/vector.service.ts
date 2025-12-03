import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export type EmbeddingResult = { embedding: number[]; tokensUsed: number };

@Injectable()
export class VectorService {
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
  }

  async getEmbedding(text: string): Promise<EmbeddingResult> {
    if (!this.openai) return { embedding: [], tokensUsed: 0 };

    // Limpar e truncar texto se necessário
    const cleanText = text.replace(/\n/g, ' ').slice(0, 8000);

    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: cleanText,
    });

    const usage = (response as any)?.usage?.total_tokens || 0;
    return { embedding: response.data[0].embedding, tokensUsed: usage };
  }

  /**
   * Calcula similaridade de cosseno entre dois vetores
   */
  cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
