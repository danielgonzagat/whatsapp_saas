import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { StructuredLogger } from '../../../logging/structured-logger';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Wave7 L9 — Y-5 / X §3.4 Priority-16: episodic conversation recall.
 *
 * `ConversationArchiveService.search(workspaceId, query)` is the read path that
 * lets the Mind recall RELEVANT FRAGMENTS of the user's PAST Kloel
 * conversations instead of re-deriving everything from the live thread. It is
 * the episodic-memory counterpart to `LongTermMemoryService.recallRelevant`
 * (which recalls reinforced outcome FACTS) — here we recall the actual words
 * the user/assistant exchanged before.
 *
 * Source of truth: the DB-backed dashboard chat tables `RAC_ChatThread` /
 * `RAC_ChatMessage` (Prisma `chatThread` / `chatMessage`). Chat history is NOT
 * stored in localStorage — the frontend `useConversationHistory` provider reads
 * threads via `apiFetch('/kloel/threads')` and `src/chat/chat.service.ts`
 * persists every message — so this archive operates over the same canonical
 * store the user actually sees.
 *
 * UNLIKE `KloelThreadSearchService` (which collapses to ONE result per thread,
 * for the conversation-list UI), this archive returns MESSAGE-LEVEL SNIPPETS —
 * multiple short, highlighted excerpts ranked by relevance — because the reply
 * engine wants the smallest relevant memory, not whole conversations.
 *
 * Search backend: Postgres full-text search via `websearch_to_tsquery` +
 * `ts_rank_cd` over a per-message `to_tsvector('portuguese', content)`, with a
 * `ts_headline` snippet. Falls back to a case-insensitive `contains` scan when
 * FTS errors (e.g. an unsupported locale). Reuses existing tables only; no
 * schema mutation. (Production upgrade reported separately: a stored generated
 * `tsvector` column + GIN index on `RAC_ChatMessage` would remove the runtime
 * `to_tsvector` cost — currently computed per query.)
 *
 * Guarantees:
 *   - Strict workspace isolation (every query filters by `workspaceId`).
 *   - Read-only — never mutates state.
 *   - Soft-deleted messages (`deletedAt`) are excluded.
 *   - Returns snippets, never whole conversations.
 */
@Injectable()
export class ConversationArchiveService {
  private readonly logger = StructuredLogger.from(ConversationArchiveService.name);

  /** Hard ceiling so a single recall can never dump the whole archive. */
  private static readonly MAX_SNIPPETS = 25;

  /** Minimum query length — single chars are not a meaningful FTS term. */
  private static readonly MIN_QUERY_LEN = 2;

  /** Max chars of a raw matched message kept as the snippet preview. */
  private static readonly SNIPPET_CHARS = 240;

  public constructor(private readonly prisma: PrismaService) {}

  /**
   * Semantic/FTS search over the workspace's past Kloel conversations.
   * Returns ranked, highlighted MESSAGE snippets (not whole threads).
   */
  public async search(
    workspaceId: string,
    query: string,
    options?: { readonly limit?: number },
  ): Promise<ConversationSnippet[]> {
    const normalized = String(query ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    const limit = Math.min(
      Math.max(options?.limit ?? 10, 1),
      ConversationArchiveService.MAX_SNIPPETS,
    );

    if (!workspaceId || normalized.length < ConversationArchiveService.MIN_QUERY_LEN) {
      return [];
    }

    try {
      const rows = await this.prisma.$queryRaw<RawSnippetRow[]>(Prisma.sql`
        WITH search_input AS (
          SELECT websearch_to_tsquery('portuguese', ${normalized}) AS query
        )
        SELECT
          message.id AS "messageId",
          message."threadId" AS "threadId",
          COALESCE(NULLIF(BTRIM(thread.title), ''), 'Nova conversa') AS "threadTitle",
          message.role AS role,
          message.content AS content,
          message."createdAt" AS "createdAt",
          ts_headline(
            'portuguese',
            COALESCE(message.content, ''),
            search_input.query,
            'StartSel=<mark>, StopSel=</mark>, MaxWords=26, MinWords=8, ShortWord=2, MaxFragments=1, FragmentDelimiter= … '
          ) AS snippet,
          ts_rank_cd(
            to_tsvector('portuguese', COALESCE(message.content, '')),
            search_input.query
          ) AS rank
        FROM "RAC_ChatMessage" AS message
        INNER JOIN "RAC_ChatThread" AS thread
          ON thread.id = message."threadId"
        CROSS JOIN search_input
        WHERE thread."workspaceId" = ${workspaceId}
          AND message."deletedAt" IS NULL
          AND to_tsvector('portuguese', COALESCE(message.content, '')) @@ search_input.query
        ORDER BY rank DESC, message."createdAt" DESC
        LIMIT ${limit}
      `);

      return rows.map((row) => this.mapRow(row));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn({
        operation: 'mind.archive.search',
        status: 'fts_fallback',
        workspaceId,
        errorCode: message,
      });
      return this.containsFallback(workspaceId, normalized, limit);
    }
  }

  // ─── private helpers ───────────────────────────────────────────────

  private mapRow(row: RawSnippetRow): ConversationSnippet {
    const headline = String(row.snippet ?? '').trim();
    const raw = String(row.content ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    return {
      messageId: row.messageId,
      threadId: row.threadId,
      threadTitle: String(row.threadTitle ?? '').trim() || 'Nova conversa',
      role: row.role === 'user' ? 'user' : row.role === 'system' ? 'system' : 'assistant',
      snippet: headline.includes('<mark>')
        ? headline
        : raw.slice(0, ConversationArchiveService.SNIPPET_CHARS),
      createdAt: row.createdAt,
      rank: this.toNumber(row.rank),
    };
  }

  private toNumber(value: number | Prisma.Decimal | null): number {
    if (typeof value === 'number') {
      return value;
    }
    if (value instanceof Prisma.Decimal) {
      return value.toNumber();
    }
    return 0;
  }

  /**
   * Locale-agnostic fallback: a case-insensitive `contains` scan over message
   * content. Same shape, same workspace isolation, deleted excluded.
   */
  private async containsFallback(
    workspaceId: string,
    query: string,
    limit: number,
  ): Promise<ConversationSnippet[]> {
    try {
      const messages = await this.prisma.chatMessage.findMany({
        take: limit,
        where: {
          thread: { workspaceId },
          deletedAt: null,
          content: { contains: query, mode: 'insensitive' },
        },
        select: {
          id: true,
          threadId: true,
          role: true,
          content: true,
          createdAt: true,
          thread: { select: { title: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return messages.map((message) => {
        const raw = String(message.content ?? '')
          .replace(/\s+/g, ' ')
          .trim();
        return {
          messageId: message.id,
          threadId: message.threadId,
          threadTitle: String(message.thread?.title ?? '').trim() || 'Nova conversa',
          role:
            message.role === 'user'
              ? ('user' as const)
              : message.role === 'system'
                ? ('system' as const)
                : ('assistant' as const),
          snippet: raw.slice(0, ConversationArchiveService.SNIPPET_CHARS),
          createdAt: message.createdAt,
          rank: 0.5,
        };
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn({
        operation: 'mind.archive.search_fallback',
        status: 'error',
        workspaceId,
        errorCode: message,
      });
      return [];
    }
  }
}

/** A single relevant excerpt recalled from a past conversation. */
export interface ConversationSnippet {
  readonly messageId: string;
  readonly threadId: string;
  readonly threadTitle: string;
  readonly role: 'user' | 'assistant' | 'system';
  /** Highlighted (`<mark>…</mark>`) FTS headline, or a trimmed raw excerpt. */
  readonly snippet: string;
  readonly createdAt: Date;
  readonly rank: number;
}

interface RawSnippetRow {
  messageId: string;
  threadId: string;
  threadTitle: string;
  role: string;
  content: string | null;
  createdAt: Date;
  snippet: string | null;
  rank: number | Prisma.Decimal | null;
}
