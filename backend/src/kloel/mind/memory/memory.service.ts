import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { StructuredLogger } from '../../../logging/structured-logger';
import { createTextLlmClient, readConfig } from '../../../lib/llm-provider';
import { VectorService } from '../knowledge/vector.service';
import {
  asMemoryEdgeRelation,
  asMemoryNodeType,
  type ExtractedMemory,
  type ExtractResult,
  type MemoryContextForModel,
  type MemoryEdgeRelation,
  type MemoryNodeType,
  type RetrievedMemory,
} from './memory-graph.types';

/**
 * Track m3-memory-graph — per-USER typed memory graph + extract→retrieve→inject
 * loop, the in-repo equivalent of an external supermemory/Mem0 deployment.
 *
 * Built ON the existing Kloel stack:
 *   - storage   → `MemoryNode` / `MemoryEdge` Prisma models (Postgres);
 *   - embedding → the existing `VectorService` (OpenAI text-embedding-3-small)
 *                 written into the pgvector `embedding` column;
 *   - retrieval → pgvector `<=>` cosine distance via `$queryRaw`, blended with a
 *                 scope / importance / recency rank;
 *   - extraction→ the primary text LLM (`createTextLlmClient`, DeepSeek default).
 *
 * Differs from `KloelMemoryEngineService` (slot rows in `RAC_MindMemory`, no
 * edges, no typed taxonomy) by being a TYPED GRAPH: every memory is one of
 * fact|preference|project|goal|decision|entity|document|summary|contradiction,
 * and supersession is recorded as an explicit `replaces`/`contradicts` edge so
 * the history is auditable rather than silently overwritten.
 *
 * Per-user isolation is enforced on EVERY read and write via `(workspaceId,
 * userId)`. Contradiction resolution is deterministic via a `slot` aspect key:
 * a new memory about the same slot supersedes the prior one (old node marked
 * `forgotten`, a `replaces` edge recorded). `forget` soft-deletes; `expiresAt`
 * gives a hard TTL. All paths are best-effort and swallow errors — memory must
 * never break a chat turn.
 *
 * @cluster Mind/Memory
 */
@Injectable()
export class MemoryService {
  private readonly logger = StructuredLogger.from(MemoryService.name);

  /** Embedding dimensionality of text-embedding-3-small (pgvector column width). */
  private static readonly EMBED_DIM = 1536;

  /** Half-life for read-time recency decay, in ms (≈ 30 days). */
  private static readonly RECENCY_HALF_LIFE_MS = 30 * 24 * 3600 * 1000;

  /** Cap on memories pulled per retrieval before re-ranking. */
  private static readonly RETRIEVE_POOL = 200;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Optional() private readonly vectors?: VectorService,
  ) {}

  private model(): string {
    return readConfig('KLOEL_MEMORY_LLM_MODEL', this.config) || 'deepseek-chat';
  }

  private static formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    try {
      return JSON.stringify(error) ?? 'unknown error';
    } catch {
      return 'unknown error';
    }
  }

  private static slugifySlot(raw: string): string {
    return raw
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40);
  }

  private static clamp01(value: unknown, fallback: number): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return fallback;
    }
    return Math.max(0, Math.min(1, value));
  }

  // ─── extraction ────────────────────────────────────────────────────

  /** Single non-streaming JSON completion against the primary text LLM. */
  private async completeJson(system: string, user: string, maxTokens: number): Promise<unknown> {
    const client = createTextLlmClient(this.config);
    if (!client) {
      return null;
    }
    try {
      const resp = await client.chat.completions.create({
        model: this.model(),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: maxTokens,
      });
      const raw = resp.choices[0]?.message?.content;
      if (typeof raw !== 'string' || !raw.trim()) {
        return null;
      }
      return JSON.parse(raw) as unknown;
    } catch (error: unknown) {
      this.logger.warn('memory LLM extraction failed', {
        context: 'MemoryService.completeJson',
        error: MemoryService.formatError(error),
      });
      return null;
    }
  }

  /**
   * Ask the model to extract durable, typed memories from a turn. Each item
   * carries a type (the taxonomy), a slot (aspect key for contradiction
   * resolution), a confidence/importance in [0..1], and a `forget` flag.
   */
  private async extractMemories(turnText: string): Promise<ExtractedMemory[]> {
    const system =
      'Você extrai MEMÓRIAS DURÁVEIS e TIPADAS sobre o USUÁRIO a partir da mensagem dele. ' +
      'Responda APENAS JSON {"memories": [{"type": "...", "slot": "...", "content": "...", ' +
      '"confidence": 0.8, "importance": 0.6, "forget": false}]}. ' +
      'Campos: "type" ∈ {fact, preference, project, goal, decision, entity, document, summary, ' +
      'contradiction}; "slot" = chave curta snake_case do ASPECTO (ex.: nome, cidade, profissao, ' +
      'empresa, stack, preferencia_formato, idioma, objetivo, projeto_atual, decisao); memórias do ' +
      'MESMO aspecto DEVEM usar o MESMO slot (ex.: "mora no RJ" e "mora em SP" usam slot "cidade"); ' +
      '"content" = frase curta e atômica em 3a pessoa ("O usuário ..."); "confidence" e "importance" ' +
      'são números em [0,1]; "forget" = true SOMENTE quando o usuário pede explicitamente para ' +
      'esquecer/remover aquele aspecto (content pode ser ""). Capture só o que é durável e útil; NÃO ' +
      'inclua perguntas, conteúdo efêmero, nem dados sensíveis (senha, cartão, token). Sem nada ' +
      'durável, responda {"memories": []}.';
    const parsed = await this.completeJson(system, turnText.slice(0, 6000), 700);
    const raw = (parsed as { memories?: unknown })?.memories;
    if (!Array.isArray(raw)) {
      return [];
    }
    const out: ExtractedMemory[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const rec = item as Record<string, unknown>;
      const type: MemoryNodeType = asMemoryNodeType(rec['type']) ?? 'fact';
      const slot = MemoryService.slugifySlot(typeof rec['slot'] === 'string' ? rec['slot'] : '');
      const content = typeof rec['content'] === 'string' ? rec['content'].trim() : '';
      const forget = rec['forget'] === true;
      if (!slot) {
        continue;
      }
      if (!forget && (content.length === 0 || content.length > 320)) {
        continue;
      }
      out.push({
        type,
        slot,
        content,
        confidence: MemoryService.clamp01(rec['confidence'], 0.6),
        importance: MemoryService.clamp01(rec['importance'], 0.5),
        forget,
      });
      if (out.length >= 12) {
        break;
      }
    }
    return out;
  }

  /**
   * Extract typed memories from a turn and persist them into the per-user graph.
   *
   * Deterministic contradiction resolution by slot: when a memory arrives for a
   * slot that already has an active node, the prior node is marked `forgotten`
   * and a `replaces` edge is recorded from the new node to the old one (and a
   * `contradicts` edge when the content actually differs). `forget` soft-deletes
   * the active node for the slot. Best-effort; never throws.
   */
  async extractFromTurn(
    workspaceId: string,
    userId: string,
    turnText: string,
  ): Promise<ExtractResult> {
    const empty: ExtractResult = {
      created: 0,
      updated: 0,
      contradictions: 0,
      forgotten: 0,
      nodeIds: [],
    };
    if (!workspaceId || !userId || !turnText.trim()) {
      return empty;
    }

    let created = 0;
    let updated = 0;
    let contradictions = 0;
    let forgotten = 0;
    const nodeIds: string[] = [];

    try {
      const memories = await this.extractMemories(turnText);
      for (const mem of memories) {
        const prior = await this.prisma.memoryNode.findFirst({
          where: {
            workspaceId,
            userId,
            forgotten: false,
            metadata: { path: ['slot'], equals: mem.slot },
          },
          orderBy: { createdAt: 'desc' },
        });

        if (mem.forget) {
          if (prior) {
            await this.prisma.memoryNode.updateMany({
              where: { id: prior.id, workspaceId, userId },
              data: { forgotten: true },
            });
            forgotten += 1;
          }
          continue;
        }

        const embedding = await this.embedOrNull(mem.content);
        const newId = randomUUID();
        await this.prisma.memoryNode.create({
          data: {
            id: newId,
            workspaceId,
            userId,
            scope: 'user',
            type: mem.type,
            content: mem.content,
            confidence: mem.confidence,
            importance: mem.importance,
            recency: 1,
            pinned: false,
            forgotten: false,
            metadata: { slot: mem.slot },
          },
        });
        if (embedding) {
          await this.writeEmbedding(newId, workspaceId, userId, embedding);
        }
        created += 1;
        nodeIds.push(newId);

        if (prior) {
          // Supersede the prior memory for this aspect.
          await this.prisma.memoryNode.updateMany({
            where: { id: prior.id, workspaceId, userId },
            data: { forgotten: true },
          });
          updated += 1;
          await this.linkEdge(workspaceId, newId, prior.id, 'replaces');
          if (prior.content.trim() !== mem.content) {
            await this.linkEdge(workspaceId, newId, prior.id, 'contradicts');
            contradictions += 1;
          }
        }
      }
    } catch (error: unknown) {
      this.logger.warn('extractFromTurn failed', {
        context: 'MemoryService.extractFromTurn',
        error: MemoryService.formatError(error),
      });
    }

    return { created, updated, contradictions, forgotten, nodeIds };
  }

  // ─── edges ─────────────────────────────────────────────────────────

  /** Idempotent typed edge between two of THIS user's nodes (best-effort). */
  private async linkEdge(
    workspaceId: string,
    fromId: string,
    toId: string,
    relation: MemoryEdgeRelation,
  ): Promise<void> {
    if (asMemoryEdgeRelation(relation) === undefined) {
      return;
    }
    try {
      await this.prisma.memoryEdge.upsert({
        where: {
          workspaceId_fromId_relation_toId: { workspaceId, fromId, relation, toId },
        },
        create: { id: randomUUID(), workspaceId, fromId, toId, relation },
        update: { weight: { increment: 1 } },
      });
    } catch (error: unknown) {
      this.logger.warn('linkEdge failed', {
        context: 'MemoryService.linkEdge',
        error: MemoryService.formatError(error),
      });
    }
  }

  // ─── embedding I/O ─────────────────────────────────────────────────

  private async embedOrNull(text: string): Promise<number[] | null> {
    if (!this.vectors) {
      return null;
    }
    try {
      const { embedding } = await this.vectors.getEmbedding(text);
      return embedding.length === MemoryService.EMBED_DIM ? embedding : null;
    } catch {
      return null;
    }
  }

  /** Persist an embedding into the pgvector column (Prisma can't type it). */
  private async writeEmbedding(
    id: string,
    workspaceId: string,
    userId: string,
    embedding: number[],
  ): Promise<void> {
    try {
      const vectorString = `[${embedding.join(',')}]`;
      await this.prisma.$executeRaw`
        UPDATE "RAC_MemoryNode"
        SET "embedding" = ${vectorString}::vector
        WHERE "id" = ${id} AND "workspaceId" = ${workspaceId} AND "userId" = ${userId}
      `;
    } catch (error: unknown) {
      this.logger.warn('writeEmbedding failed', {
        context: 'MemoryService.writeEmbedding',
        error: MemoryService.formatError(error),
      });
    }
  }

  // ─── retrieval ─────────────────────────────────────────────────────

  /**
   * Retrieve the most relevant active memories for THIS user, ranked by a blend
   * of semantic distance (pgvector `<=>`, when an embedder + query embedding are
   * available), node importance, and read-time recency decay. Expired and
   * forgotten nodes are excluded. Strictly isolated by `(workspaceId, userId)`;
   * read-only.
   */
  async retrieveRelevant(
    workspaceId: string,
    userId: string,
    query: string,
    k = 8,
  ): Promise<RetrievedMemory[]> {
    if (!workspaceId || !userId) {
      return [];
    }
    const limit = Math.max(1, Math.min(k, 50));
    const now = Date.now();

    try {
      const queryEmbedding = query.trim() ? await this.embedOrNull(query) : null;
      const semanticDistance = queryEmbedding
        ? await this.semanticDistances(workspaceId, userId, queryEmbedding)
        : new Map<string, number>();

      const rows = await this.prisma.memoryNode.findMany({
        where: {
          workspaceId,
          userId,
          forgotten: false,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date(now) } }],
        },
        orderBy: { importance: 'desc' },
        take: MemoryService.RETRIEVE_POOL,
      });

      const ranked = rows
        .map((row) => {
          const recency = this.decayRecency(row.createdAt.getTime(), now);
          const dist = semanticDistance.get(row.id);
          // cosine distance in [0,2] → similarity in [0,1]; absent → neutral 0.5
          const similarity = dist === undefined ? 0.5 : Math.max(0, 1 - dist / 2);
          const scopeBoost = row.scope === 'user' ? 1 : row.scope === 'shared' ? 0.85 : 0.7;
          const pinBoost = row.pinned ? 0.25 : 0;
          const score =
            similarity * 0.5 + row.importance * 0.25 + recency * 0.15 + scopeBoost * 0.1 + pinBoost;
          const memory: RetrievedMemory = {
            id: row.id,
            type: asMemoryNodeType(row.type) ?? 'fact',
            content: row.content,
            summary: row.summary ?? null,
            importance: row.importance,
            confidence: row.confidence,
            score,
          };
          return memory;
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return ranked;
    } catch (error: unknown) {
      this.logger.warn('retrieveRelevant failed', {
        context: 'MemoryService.retrieveRelevant',
        error: MemoryService.formatError(error),
      });
      return [];
    }
  }

  /** Map nodeId → cosine distance for this user via pgvector. Empty on failure. */
  private async semanticDistances(
    workspaceId: string,
    userId: string,
    embedding: number[],
  ): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    try {
      const vectorString = `[${embedding.join(',')}]`;
      const rows = await this.prisma.$queryRaw<Array<{ id: string; distance: number }>>`
        SELECT "id", ("embedding" <=> ${vectorString}::vector) AS distance
        FROM "RAC_MemoryNode"
        WHERE "workspaceId" = ${workspaceId}
          AND "userId" = ${userId}
          AND "forgotten" = false
          AND "embedding" IS NOT NULL
        ORDER BY distance ASC
        LIMIT ${MemoryService.RETRIEVE_POOL}
      `;
      for (const row of rows) {
        out.set(row.id, Number(row.distance));
      }
    } catch (error: unknown) {
      this.logger.warn('semanticDistances failed', {
        context: 'MemoryService.semanticDistances',
        error: MemoryService.formatError(error),
      });
    }
    return out;
  }

  private decayRecency(createdAtMs: number, nowMs: number): number {
    const elapsed = Math.max(0, nowMs - createdAtMs);
    return Math.pow(0.5, elapsed / MemoryService.RECENCY_HALF_LIFE_MS);
  }

  // ─── injection ─────────────────────────────────────────────────────

  /**
   * Build a compact, model-ready memory context for THIS user and turn. Splits
   * the retrieved + structural memories into userProfileStatic / Dynamic /
   * relevantMemories / preferences / constraints, and pre-renders a single
   * `text` block ready to unshift into the system context. Empty `text` (all
   * arrays empty) when the user has no memories, so the model sees an honest
   * empty state rather than fabricated history.
   */
  async buildMemoryContextForModel(
    workspaceId: string,
    userId: string,
    query: string,
    k = 8,
  ): Promise<MemoryContextForModel> {
    const empty: MemoryContextForModel = {
      userProfileStatic: [],
      userProfileDynamic: [],
      relevantMemories: [],
      preferences: [],
      constraints: [],
      text: '',
    };
    if (!workspaceId || !userId) {
      return empty;
    }

    try {
      const relevant = await this.retrieveRelevant(workspaceId, userId, query, k);
      if (relevant.length === 0) {
        return empty;
      }

      const userProfileStatic: string[] = [];
      const userProfileDynamic: string[] = [];
      const relevantMemories: string[] = [];
      const preferences: string[] = [];
      const constraints: string[] = [];

      for (const mem of relevant) {
        const line = mem.summary?.trim() ? mem.summary.trim() : mem.content;
        switch (mem.type) {
          case 'fact':
          case 'entity':
            userProfileStatic.push(line);
            break;
          case 'project':
          case 'goal':
          case 'decision':
            userProfileDynamic.push(line);
            break;
          case 'preference':
            preferences.push(line);
            break;
          case 'contradiction':
            constraints.push(line);
            break;
          default:
            relevantMemories.push(line);
            break;
        }
      }

      const sections: string[] = [];
      const pushSection = (title: string, items: readonly string[]): void => {
        if (items.length > 0) {
          sections.push(`${title}:\n${items.map((i) => `- ${i}`).join('\n')}`);
        }
      };
      pushSection('PERFIL DO USUÁRIO (estável)', userProfileStatic);
      pushSection('ESTADO ATUAL DO USUÁRIO (projetos/objetivos/decisões)', userProfileDynamic);
      pushSection('PREFERÊNCIAS DO USUÁRIO', preferences);
      pushSection('RESTRIÇÕES', constraints);
      pushSection('MEMÓRIAS RELEVANTES PARA ESTA CONVERSA', relevantMemories);

      const text = sections.length
        ? `MEMÓRIA DO USUÁRIO (aprendida em conversas anteriores):\n\n${sections.join('\n\n')}`
        : '';

      return {
        userProfileStatic,
        userProfileDynamic,
        relevantMemories,
        preferences,
        constraints,
        text,
      };
    } catch (error: unknown) {
      this.logger.warn('buildMemoryContextForModel failed', {
        context: 'MemoryService.buildMemoryContextForModel',
        error: MemoryService.formatError(error),
      });
      return empty;
    }
  }

  // ─── maintenance ───────────────────────────────────────────────────

  /**
   * Soft-delete every memory matching a slot for THIS user. Returns the count
   * forgotten. Used by explicit "forget X" flows outside the extraction path.
   * Pinned nodes are skipped (a pin is an explicit "never forget").
   */
  async forgetSlot(workspaceId: string, userId: string, slot: string): Promise<number> {
    if (!workspaceId || !userId || !slot) {
      return 0;
    }
    try {
      const result = await this.prisma.memoryNode.updateMany({
        where: {
          workspaceId,
          userId,
          pinned: false,
          forgotten: false,
          metadata: { path: ['slot'], equals: MemoryService.slugifySlot(slot) },
        },
        data: { forgotten: true },
      });
      return result.count;
    } catch (error: unknown) {
      this.logger.warn('forgetSlot failed', {
        context: 'MemoryService.forgetSlot',
        error: MemoryService.formatError(error),
      });
      return 0;
    }
  }

  /**
   * Hard-expire memories whose `expiresAt` is in the past for THIS user by
   * marking them forgotten. Idempotent; returns the count expired. Pinned nodes
   * are never expired.
   */
  async expireStale(workspaceId: string, userId: string): Promise<number> {
    if (!workspaceId || !userId) {
      return 0;
    }
    try {
      const result = await this.prisma.memoryNode.updateMany({
        where: {
          workspaceId,
          userId,
          pinned: false,
          forgotten: false,
          expiresAt: { lt: new Date() },
        },
        data: { forgotten: true },
      });
      return result.count;
    } catch (error: unknown) {
      this.logger.warn('expireStale failed', {
        context: 'MemoryService.expireStale',
        error: MemoryService.formatError(error),
      });
      return 0;
    }
  }
}
