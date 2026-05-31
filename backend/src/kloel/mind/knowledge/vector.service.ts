/**
 * MindVectorStore implementation — canonical Mind/Knowledge service.
 *
 * Physically moved from `backend/src/ai-brain/vector.service.ts` to its
 * canonical home under `backend/src/kloel/mind/knowledge/` (ADR-0013 Wave M2,
 * 2026-05-27). The legacy `ai-brain/vector.service.ts` re-export stub was
 * deleted in Wave 51 (zero consumers).
 *
 * Prefer importing as `MindVectorStore` via the
 * `backend/src/kloel/mind/knowledge` barrel.
 *
 * @cluster Mind/Knowledge
 * @canonical backend/src/kloel/mind/knowledge/vector.service.ts
 * @see docs/adr/0013-kloel-mind-unification.md
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { StructuredLogger } from '../../../logging/structured-logger';
import OpenAI from 'openai';

/**
 * @cluster whatsapp_saas/backend/kloel/mind/knowledge
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
const N_RE = /\n/g;

type EmbeddingResult = { embedding: number[]; tokensUsed: number };

/** Vector service. */
@Injectable()
export class VectorService {
  private readonly logger = StructuredLogger.from(VectorService.name);
  private openai: OpenAI | null = null;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
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

    for (let i = 0; i < vecA.length; i += 1) {
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

  /**
   * Semantic similarity search across knowledge base vectors for a workspace.
   * Returns top-k matching chunks with cosine distance scores (lower = more similar).
   *
   * PI-K17-B: wired into mindSignals as cognitiveState.mindSignals.semanticMatches.
   */
  async similaritySearch(
    workspaceId: string,
    query: string,
    k = 5,
  ): Promise<Array<{ text: string; score: number }>> {
    if (!this.openai) {
      return [];
    }

    const { embedding } = await this.getEmbedding(query);
    if (!embedding.length) {
      return [];
    }

    const vectorString = `[${embedding.join(',')}]`;

    const results = await this.prisma.$queryRaw<Array<{ content: string; distance: number }>>`
      SELECT v.content, (v.embedding <=> ${vectorString}::vector) as distance
      FROM "RAC_Vector" v
      JOIN "RAC_KnowledgeSource" s ON v."sourceId" = s.id
      JOIN "RAC_KnowledgeBase" kb ON s."knowledgeBaseId" = kb.id
      WHERE kb."workspaceId" = ${workspaceId}
      ORDER BY distance ASC
      LIMIT ${k}
    `;

    if (!results || results.length === 0) {
      return [];
    }

    return results.map((r) => ({ text: r.content, score: Number(r.distance) }));
  }
}
