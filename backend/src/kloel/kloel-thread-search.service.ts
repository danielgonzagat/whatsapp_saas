import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { extractThreadSearchTags, stripHtmlTags } from './thread-search.util';

const S_RE = /\s+/g;

interface ThreadSearchRow {
  id: string;
  title: string;
  updatedAt: Date;
  matchedContent: string | null;
  contentPreview: string | null;
  titlePreview: string | null;
  rank: number | Prisma.Decimal | null;
}

export interface ThreadSearchResult {
  id: string;
  title: string;
  updatedAt: Date;
  matchedContent: string;
  previewHtml: string;
  tags: string[];
  rank: number;
}

@Injectable()
export class KloelThreadSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    workspaceId: string,
    rawQuery: string,
    rawLimit: string | undefined,
  ): Promise<ThreadSearchResult[]> {
    const normalizedQuery = String(rawQuery || '')
      .replace(S_RE, ' ')
      .trim();
    const safeLimit = Math.min(Math.max(Number(rawLimit) || 20, 1), 20);

    if (!workspaceId || normalizedQuery.length < 2) {
      return [];
    }

    try {
      const rows = await this.prisma.$queryRaw<ThreadSearchRow[]>(Prisma.sql`
        WITH search_input AS (
          SELECT websearch_to_tsquery('portuguese', ${normalizedQuery}) AS query
        ),
        scored_matches AS (
          SELECT
            thread.id,
            COALESCE(NULLIF(BTRIM(thread.title), ''), 'Nova conversa') AS title,
            thread."updatedAt",
            message.content AS "matchedContent",
            message."createdAt" AS "messageCreatedAt",
            ts_headline(
              'portuguese',
              COALESCE(NULLIF(BTRIM(message.content), ''), COALESCE(NULLIF(BTRIM(thread.title), ''), 'Nova conversa')),
              search_input.query,
              'StartSel=<mark>, StopSel=</mark>, MaxWords=22, MinWords=8, ShortWord=2, MaxFragments=1, FragmentDelimiter= … '
            ) AS "contentPreview",
            ts_headline(
              'portuguese',
              COALESCE(NULLIF(BTRIM(thread.title), ''), 'Nova conversa'),
              search_input.query,
              'StartSel=<mark>, StopSel=</mark>, MaxWords=8, MinWords=2, ShortWord=2, MaxFragments=1'
            ) AS "titlePreview",
            ts_rank_cd(
              setweight(to_tsvector('portuguese', COALESCE(NULLIF(BTRIM(thread.title), ''), '')), 'A') ||
              setweight(to_tsvector('portuguese', COALESCE(message.content, '')), 'B'),
              search_input.query
            ) AS rank
          FROM "RAC_ChatThread" AS thread
          INNER JOIN "RAC_ChatMessage" AS message
            ON message."threadId" = thread.id
          CROSS JOIN search_input
          WHERE thread."workspaceId" = ${workspaceId}
            AND (
              setweight(to_tsvector('portuguese', COALESCE(NULLIF(BTRIM(thread.title), ''), '')), 'A') ||
              setweight(to_tsvector('portuguese', COALESCE(message.content, '')), 'B')
            ) @@ search_input.query
        ),
        ranked_matches AS (
          SELECT
            *,
            ROW_NUMBER() OVER (
              PARTITION BY id
              ORDER BY rank DESC, "messageCreatedAt" DESC
            ) AS row_num
          FROM scored_matches
        )
        SELECT
          id,
          title,
          "updatedAt",
          "matchedContent",
          "contentPreview",
          "titlePreview",
          rank
        FROM ranked_matches
        WHERE row_num = 1
        ORDER BY rank DESC, "updatedAt" DESC
        LIMIT ${safeLimit}
      `);

      return this.mapRows(rows, normalizedQuery);
    } catch {
      return this.containsFallback(workspaceId, normalizedQuery, safeLimit);
    }
  }

  private mapRows(rows: ThreadSearchRow[], query: string): ThreadSearchResult[] {
    return rows.map((row) => {
      const contentPreview = String(row.contentPreview || '').trim();
      const titlePreview = String(row.titlePreview || '').trim();
      const previewHtml = contentPreview.includes('<mark>')
        ? contentPreview
        : titlePreview.includes('<mark>')
          ? titlePreview
          : contentPreview || titlePreview || String(row.matchedContent || '').trim();
      const matchedContent =
        stripHtmlTags(previewHtml) ||
        String(row.matchedContent || '')
          .replace(S_RE, ' ')
          .trim()
          .slice(0, 200);

      return {
        id: row.id,
        title: String(row.title || '').trim() || 'Nova conversa',
        updatedAt: row.updatedAt,
        matchedContent,
        previewHtml,
        tags: extractThreadSearchTags(
          String(row.title || ''),
          `${String(row.matchedContent || '')} ${matchedContent}`.trim(),
          query,
        ),
        rank:
          typeof row.rank === 'number'
            ? row.rank
            : row.rank instanceof Prisma.Decimal
              ? row.rank.toNumber()
              : 0,
      };
    });
  }

  private async containsFallback(
    workspaceId: string,
    query: string,
    limit: number,
  ): Promise<ThreadSearchResult[]> {
    const titleThreads = await this.prisma.chatThread.findMany({
      take: limit,
      where: {
        workspaceId,
        title: { contains: query, mode: 'insensitive' },
        messages: { some: {} },
      },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { content: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const messages = await this.prisma.chatMessage.findMany({
      take: limit * 2,
      where: {
        thread: { workspaceId },
        content: { contains: query, mode: 'insensitive' },
      },
      select: {
        threadId: true,
        content: true,
        createdAt: true,
        thread: { select: { id: true, title: true, updatedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const seen = new Set<string>();
    const contentMatches = messages
      .filter((message) => {
        if (seen.has(message.threadId)) {
          return false;
        }
        seen.add(message.threadId);
        return true;
      })
      .map((message) => {
        const matchedContent = String(message.content || '')
          .replace(S_RE, ' ')
          .trim();
        return {
          id: message.thread.id,
          title: String(message.thread.title || '').trim() || 'Nova conversa',
          updatedAt: message.thread.updatedAt,
          matchedContent,
          previewHtml: matchedContent.slice(0, 180),
          tags: extractThreadSearchTags(String(message.thread.title || ''), matchedContent, query),
          rank: 1,
        };
      });

    const titleMatches = titleThreads
      .filter((thread) => !seen.has(thread.id))
      .map((thread) => {
        const matchedContent = String(thread.messages?.[0]?.content || '')
          .replace(S_RE, ' ')
          .trim();
        return {
          id: thread.id,
          title: String(thread.title || '').trim() || 'Nova conversa',
          updatedAt: thread.updatedAt,
          matchedContent,
          previewHtml: matchedContent.slice(0, 180) || String(thread.title || '').trim(),
          tags: extractThreadSearchTags(String(thread.title || ''), matchedContent, query),
          rank: 0.5,
        };
      });

    return [...contentMatches, ...titleMatches].slice(0, limit);
  }
}
