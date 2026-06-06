import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StructuredLogger } from '../logging/structured-logger';
import { createTextLlmClient, readConfig } from '../lib/llm-provider';

/**
 * KloelMemoryEngineService — per-user memory brain, a native port of the Mem0
 * (Apache-2.0) idea onto Kloel's stack: DeepSeek for extraction, the canonical
 * `MindMemory` table for storage (no migration), scoped per-user via
 * `namespace = umem:<userId>`.
 *
 * Contradiction resolution is DETERMINISTIC via SLOTS (the reliable Memobase
 * approach, not a flaky batch LLM judge): every extracted fact carries a short
 * `slot` key for its aspect (nome, cidade, preferencia_formato, profissao, ...).
 * Memory rows are keyed `slot:<slot>` and UPSERTed, so a new fact about the same
 * aspect OVERWRITES the old value — "mudei pra SP" replaces "mora no RJ" with no
 * LLM judgement needed. A `forget` flag DELETEs the slot, so a forgotten fact can
 * never be recalled again.
 *
 * The LLM is used only for extraction+slotting (one call); without an embedder
 * (DeepSeek has no embeddings endpoint) recall degrades honestly to recency over
 * the small per-user set — the brain is fully functional on DeepSeek alone.
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

  private namespaceFor(userId: string): string {
    return `${KloelMemoryEngineService.NAMESPACE_PREFIX}${userId}`;
  }

  private model(): string {
    return readConfig('KLOEL_MEMORY_LLM_MODEL', this.config) || 'deepseek-chat';
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
        error: KloelMemoryEngineService.formatError(error),
      });
      return null;
    }
  }

  /**
   * Extract durable facts/preferences about the user from a turn, each tagged
   * with a SLOT (the aspect key that drives deterministic dedup) and an optional
   * `forget` flag.
   */
  private async extractUserFacts(
    turnText: string,
  ): Promise<Array<{ slot: string; fact: string; forget: boolean }>> {
    const system =
      'Você extrai FATOS DURÁVEIS e PREFERÊNCIAS sobre o USUÁRIO a partir da mensagem dele. ' +
      'Responda APENAS JSON {"facts": [{"slot": "...", "fact": "...", "forget": false}]}. ' +
      'Cada item tem: "slot" = chave curta em snake_case do ASPECTO (ex.: nome, cidade, profissao, ' +
      'empresa, stack, preferencia_formato_resposta, preferencia_idioma, objetivo, projeto, decisao); ' +
      'fatos do MESMO aspecto DEVEM usar o MESMO slot (ex.: "mora no RJ" e depois "mora em SP" usam o ' +
      'slot "cidade"). "fact" = frase curta e atômica em 3a pessoa ("O usuário ..."). "forget" = true ' +
      'SOMENTE quando o usuário pede explicitamente para esquecer/remover aquele aspecto (fact pode ser ""). ' +
      'Capture só o que é durável e útil; NÃO inclua perguntas, conteúdo efêmero de tarefa pontual, nem ' +
      'dados sensíveis (senha, cartão, token). Se não houver nada durável, responda {"facts": []}.';
    const parsed = await this.completeJson(system, turnText.slice(0, 6000), 500);
    const facts = (parsed as { facts?: unknown })?.facts;
    if (!Array.isArray(facts)) {
      return [];
    }
    const out: Array<{ slot: string; fact: string; forget: boolean }> = [];
    for (const item of facts) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const rec = item as { slot?: unknown; fact?: unknown; forget?: unknown };
      const slot = KloelMemoryEngineService.slugifySlot(
        typeof rec.slot === 'string' ? rec.slot : '',
      );
      const fact = typeof rec.fact === 'string' ? rec.fact.trim() : '';
      const forget = rec.forget === true;
      if (!slot) {
        continue;
      }
      if (!forget && (fact.length === 0 || fact.length > 280)) {
        continue;
      }
      out.push({ slot, fact, forget });
      if (out.length >= 8) {
        break;
      }
    }
    return out;
  }

  /**
   * Extract then upsert/delete by slot. Deterministic: same slot overwrites (so
   * contradictions replace the prior value), `forget` deletes the slot. Best-effort
   * and swallows errors — memory must never break a chat turn.
   */
  async remember(
    workspaceId: string,
    userId: string,
    turnText: string,
  ): Promise<{ written: number; forgotten: number }> {
    const result = { written: 0, forgotten: 0 };
    if (!workspaceId || !userId || !turnText.trim()) {
      return result;
    }
    const namespace = this.namespaceFor(userId);
    try {
      const facts = await this.extractUserFacts(turnText);
      for (const { slot, fact, forget } of facts) {
        const key = `slot:${slot}`;
        if (forget) {
          await this.prisma.mindMemory.deleteMany({ where: { workspaceId, namespace, key } });
          result.forgotten += 1;
          continue;
        }
        await this.prisma.mindMemory.upsert({
          where: { workspaceId_namespace_key: { workspaceId, namespace, key } },
          create: {
            workspaceId,
            namespace,
            key,
            value: { fact, slot },
            category: KloelMemoryEngineService.CATEGORY,
            type: 'user_fact',
            content: fact,
          },
          update: { content: fact, value: { fact, slot } },
        });
        result.written += 1;
      }
    } catch (error: unknown) {
      this.logger.warn('remember failed', {
        context: 'KloelMemoryEngineService.remember',
        error: KloelMemoryEngineService.formatError(error),
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
    k = 8,
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
        select: { id: true, content: true },
      });
      const memories = rows.filter(
        (r): r is { id: string; content: string } => typeof r.content === 'string' && !!r.content,
      );
      const terms = query
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((t) => t.length >= 4);
      const scored = memories.map((m, index) => {
        const lower = m.content.toLowerCase();
        const overlap = terms.reduce((acc, t) => (lower.includes(t) ? acc + 1 : acc), 0);
        return { id: m.id, content: m.content, score: overlap * 100 - index };
      });
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, k).map((m) => ({ id: m.id, content: m.content }));
    } catch (error: unknown) {
      this.logger.warn('recall failed', {
        context: 'KloelMemoryEngineService.recall',
        error: KloelMemoryEngineService.formatError(error),
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
