import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StructuredLogger } from '../logging/structured-logger';
import { createTextLlmClient, readConfig } from '../lib/llm-provider';

/**
 * KloelMemoryEngineService — per-user memory brain, native port of the Mem0
 * (Apache-2.0) algorithm onto Kloel's existing stack: DeepSeek for the LLM
 * judge, the canonical `MindMemory` table for storage (no migration), scoped
 * per-user via `namespace = umem:<userId>`.
 *
 * Two phases, both LLM-judged (no hardcoded heuristics):
 *  - REMEMBER: extract atomic durable facts/preferences from a turn, then
 *    judge each against the user's existing memories → ADD / UPDATE / DELETE /
 *    NONE (this is where contradiction resolution lives — "mudei pra SP"
 *    UPDATEs "mora no RJ"; a reversed preference DELETEs the stale one).
 *  - RECALL: return the user's relevant memories for injection into the model
 *    context before a reply.
 *
 * Vector/semantic ranking is a graceful enhancement: when an embedder is
 * configured it can be layered on; without one (DeepSeek has no embeddings
 * endpoint), recall degrades honestly to recency + keyword over the small
 * per-user set. The brain (extraction + contradiction) is fully functional on
 * DeepSeek alone.
 *
 * @cluster Mind/Knowledge
 */
@Injectable()
export class KloelMemoryEngineService {
  private readonly logger = StructuredLogger.from(KloelMemoryEngineService.name);

  private static readonly NAMESPACE_PREFIX = 'umem:';
  private static readonly CATEGORY = 'user_memory';
  private static readonly MAX_TRACKED = 60;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private namespaceFor(userId: string): string {
    return `${KloelMemoryEngineService.NAMESPACE_PREFIX}${userId}`;
  }

  private model(): string {
    return readConfig('KLOEL_MEMORY_LLM_MODEL', this.config) || 'deepseek-chat';
  }

  /** Single non-streaming JSON completion against the primary text LLM (DeepSeek). */
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
      this.logger.warn('memory LLM call failed', {
        context: 'KloelMemoryEngineService.completeJson',
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /** Extract atomic, durable facts/preferences about the user from a turn. */
  private async extractUserFacts(turnText: string): Promise<string[]> {
    const system =
      'Você extrai FATOS DURÁVEIS e PREFERÊNCIAS sobre o USUÁRIO a partir da mensagem dele. ' +
      'Responda APENAS JSON no formato {"facts": string[]}. Cada fato é curto, atômico, em 3ª pessoa ' +
      '("O usuário ..."). Capture: nome, papel, empresa, stack, projetos recorrentes, objetivos, decisões, ' +
      'restrições, e preferências de formato/idioma/estilo/nível de detalhe. NÃO inclua: perguntas, conteúdo ' +
      'efêmero de uma tarefa pontual, nem dados sensíveis (senha, cartão, token, documento). ' +
      'Se não houver nada durável, responda {"facts": []}.';
    const parsed = await this.completeJson(system, turnText.slice(0, 6000), 400);
    const facts = (parsed as { facts?: unknown })?.facts;
    if (!Array.isArray(facts)) {
      return [];
    }
    return facts
      .filter((f): f is string => typeof f === 'string')
      .map((f) => f.trim())
      .filter((f) => f.length > 0 && f.length <= 280)
      .slice(0, 8);
  }

  /** Judge each new fact against existing memories → ADD / UPDATE / DELETE / NONE. */
  private async planMemoryOps(
    existing: Array<{ id: string; text: string }>,
    newFacts: string[],
  ): Promise<Array<{ op: string; text?: string; id?: string }>> {
    if (newFacts.length === 0) {
      return [];
    }
    const system =
      'Você mantém a memória de longo prazo de UM usuário. Dada a MEMÓRIA EXISTENTE e os NOVOS FATOS, ' +
      'decida uma operação por novo fato. Responda APENAS JSON {"ops": [{"op": "...", "text": "...", "id": "..."}]}. ' +
      'op ∈ "ADD" (fato realmente novo — sem id), "UPDATE" (o novo fato refina ou CONTRADIZ um existente — ' +
      'inclua o id do existente e em text a versão consolidada/atual), "DELETE" (o novo fato invalida um ' +
      'existente sem substituí-lo — inclua o id, text opcional), "NONE" (já coberto — ignore). ' +
      'Resolva contradições e validade temporal: "mudei pra SP" → UPDATE de "mora no RJ"; ' +
      '"agora prefiro respostas longas" → UPDATE de "prefere respostas curtas".';
    const payload = JSON.stringify({
      existing_memory: existing.map((m) => ({ id: m.id, text: m.text })),
      new_facts: newFacts,
    });
    const parsed = await this.completeJson(system, payload, 700);
    const ops = (parsed as { ops?: unknown })?.ops;
    if (!Array.isArray(ops)) {
      return [];
    }
    return ops
      .filter((o): o is { op: string; text?: string; id?: string } => {
        return !!o && typeof o === 'object' && typeof (o as { op?: unknown }).op === 'string';
      })
      .map((o) => ({
        op: String(o.op).toUpperCase(),
        ...(typeof o.text === 'string' ? { text: o.text.trim() } : {}),
        ...(typeof o.id === 'string' ? { id: o.id } : {}),
      }));
  }

  /**
   * Extract → judge → apply. Idempotent-ish: contradictions UPDATE/DELETE the
   * prior memory instead of accumulating duplicates. Best-effort and swallows
   * errors — memory must never break a chat turn. Returns a small summary for
   * the caller's trace.
   */
  async remember(
    workspaceId: string,
    userId: string,
    turnText: string,
  ): Promise<{ added: number; updated: number; deleted: number }> {
    const result = { added: 0, updated: 0, deleted: 0 };
    if (!workspaceId || !userId || !turnText.trim()) {
      return result;
    }
    const namespace = this.namespaceFor(userId);
    try {
      const facts = await this.extractUserFacts(turnText);
      if (facts.length === 0) {
        return result;
      }
      const existingRows = await this.prisma.mindMemory.findMany({
        where: { workspaceId, namespace, category: KloelMemoryEngineService.CATEGORY },
        orderBy: { updatedAt: 'desc' },
        take: KloelMemoryEngineService.MAX_TRACKED,
        select: { id: true, content: true },
      });
      const existing = existingRows
        .filter((r): r is { id: string; content: string } => typeof r.content === 'string')
        .map((r) => ({ id: r.id, text: r.content }));
      const validIds = new Set(existing.map((e) => e.id));

      const ops = await this.planMemoryOps(existing, facts);
      for (const op of ops) {
        if (op.op === 'ADD' && op.text) {
          await this.prisma.mindMemory.create({
            data: {
              workspaceId,
              namespace,
              key: `fact:${randomUUID()}`,
              value: { fact: op.text },
              category: KloelMemoryEngineService.CATEGORY,
              type: 'user_fact',
              content: op.text,
            },
          });
          result.added += 1;
        } else if (op.op === 'UPDATE' && op.id && op.text && validIds.has(op.id)) {
          await this.prisma.mindMemory.update({
            where: { id: op.id },
            data: { content: op.text, value: { fact: op.text } },
          });
          result.updated += 1;
        } else if (op.op === 'DELETE' && op.id && validIds.has(op.id)) {
          await this.prisma.mindMemory.delete({ where: { id: op.id } });
          result.deleted += 1;
        }
      }
    } catch (error: unknown) {
      this.logger.warn('remember failed', {
        context: 'KloelMemoryEngineService.remember',
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return result;
  }

  /**
   * Return the user's relevant memories for context injection. Recency-ordered,
   * lightly keyword-boosted by overlap with the query. (Vector ranking layers on
   * when an embedder is configured.)
   */
  async recall(
    workspaceId: string,
    userId: string,
    query: string,
    k = 6,
  ): Promise<Array<{ id: string; content: string }>> {
    if (!workspaceId || !userId) {
      return [];
    }
    const namespace = this.namespaceFor(userId);
    try {
      const rows = await this.prisma.mindMemory.findMany({
        where: { workspaceId, namespace, category: KloelMemoryEngineService.CATEGORY },
        orderBy: { updatedAt: 'desc' },
        take: KloelMemoryEngineService.MAX_TRACKED,
        select: { id: true, content: true, updatedAt: true },
      });
      const memories = rows.filter(
        (r): r is { id: string; content: string; updatedAt: Date } => typeof r.content === 'string',
      );
      const terms = query
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((t) => t.length >= 4);
      const scored = memories.map((m, index) => {
        const lower = m.content.toLowerCase();
        const overlap = terms.reduce((acc, t) => (lower.includes(t) ? acc + 1 : acc), 0);
        // recency rank (newer first) lightly broken by keyword overlap
        return { id: m.id, content: m.content, score: overlap * 100 - index };
      });
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, k).map((m) => ({ id: m.id, content: m.content }));
    } catch (error: unknown) {
      this.logger.warn('recall failed', {
        context: 'KloelMemoryEngineService.recall',
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /** Compact block for injection into the model context. Empty string when none. */
  renderForContext(memories: Array<{ id: string; content: string }>): string {
    if (memories.length === 0) {
      return '';
    }
    const lines = memories.map((m) => `- ${m.content}`);
    return `MEMÓRIA DO USUÁRIO (fatos e preferências aprendidos em conversas anteriores):\n${lines.join('\n')}`;
  }
}
