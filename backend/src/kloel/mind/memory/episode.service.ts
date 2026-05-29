import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../../logging/structured-logger';
import { PrismaService } from '../../../prisma/prisma.service';
import { MindCaseMemoryService } from './mind-case-memory.service';

/**
 * Wave7 L9 — Y-5 / X §3.4 Priority-16: episodic memory consolidation.
 *
 * `EpisodeService.consolidate(workspaceId)` is the periodic job that turns the
 * user's raw past Kloel conversations into compact, indexed EPISODES the Mind
 * can recall cheaply — the write-side counterpart to
 * `ConversationArchiveService.search` (read side).
 *
 * It reuses existing tables only:
 *   - reads DB-backed conversations from `RAC_ChatThread` / `RAC_ChatMessage`
 *     (Prisma `chatThread` / `chatMessage`) — the same canonical store the
 *     dashboard chat reads (NOT localStorage);
 *   - reuses the LLM-maintained `ChatThread.summary` when present (written by
 *     `KloelThreadSummaryService.maybeRefreshThreadSummary`) so consolidation
 *     stays deterministic and adds NO new LLM dependency — when no summary
 *     exists it derives a transcript-based one;
 *   - writes each episode into the existing `RAC_MindCase` table via
 *     `MindCaseMemoryService.recordCase` (caseType `'episode'`), which already
 *     tokenizes the text for similarity recall.
 *
 * Idempotency: each episode carries `features.threadId` + `features.lastMessageAt`.
 * A thread is consolidated only when no episode for that thread at that exact
 * last-message timestamp exists yet — so a re-run skips unchanged threads and
 * re-summarizes a thread only after it has grown. Append-only: episodes are
 * never deleted or rewritten; a changed thread produces a NEW episode row.
 *
 * No schema mutation, no `db push`. Strict workspace isolation throughout.
 */
@Injectable()
export class EpisodeService {
  private readonly logger = StructuredLogger.from(EpisodeService.name);

  /** caseType used to tag conversation episodes in `RAC_MindCase`. */
  public static readonly EPISODE_CASE_TYPE = 'episode';

  /** Default cap on threads consolidated per run, to bound a single tick. */
  private static readonly DEFAULT_MAX_THREADS = 100;

  /** Messages sampled per thread when deriving a transcript summary. */
  private static readonly TRANSCRIPT_SAMPLE = 12;

  public constructor(
    private readonly prisma: PrismaService,
    private readonly caseMemory: MindCaseMemoryService,
  ) {}

  /**
   * Consolidate the workspace's recent conversations into indexed episodes.
   * Returns how many new episodes were written and how many threads were
   * skipped (already consolidated at their current state).
   */
  public async consolidate(
    workspaceId: string,
    options?: { readonly maxThreads?: number },
  ): Promise<EpisodeConsolidationResult> {
    if (!workspaceId) {
      return { workspaceId, written: 0, skipped: 0, scanned: 0 };
    }

    const maxThreads = Math.min(
      Math.max(options?.maxThreads ?? EpisodeService.DEFAULT_MAX_THREADS, 1),
      500,
    );

    let written = 0;
    let skipped = 0;
    let scanned = 0;

    try {
      const threads = await this.prisma.chatThread.findMany({
        where: { workspaceId, messages: { some: { deletedAt: null } } },
        orderBy: { updatedAt: 'desc' },
        take: maxThreads,
        select: { id: true, title: true, summary: true },
      });

      for (const thread of threads) {
        scanned += 1;
        const episode = await this.buildEpisode(workspaceId, thread);
        if (episode === undefined) {
          skipped += 1;
          continue;
        }
        if (await this.alreadyConsolidated(workspaceId, thread.id, episode.lastMessageAt)) {
          skipped += 1;
          continue;
        }
        await this.caseMemory.recordCase({
          workspaceId,
          subject: thread.id,
          caseType: EpisodeService.EPISODE_CASE_TYPE,
          text: episode.text,
          action: 'recall',
          features: {
            threadId: thread.id,
            title: episode.title,
            messageCount: episode.messageCount,
            lastMessageAt: episode.lastMessageAt.toISOString(),
            source: episode.source,
          },
          occurredAt: episode.lastMessageAt,
        });
        written += 1;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn({
        operation: 'mind.episode.consolidate',
        status: 'error',
        workspaceId,
        errorCode: message,
      });
    }

    return { workspaceId, written, skipped, scanned };
  }

  // ─── private helpers ───────────────────────────────────────────────

  /**
   * Build an episode for a thread: prefer the LLM-maintained `summary`, else
   * derive a transcript-based one. Returns undefined for empty threads.
   */
  private async buildEpisode(
    workspaceId: string,
    thread: { id: string; title: string | null; summary: string | null },
  ): Promise<DerivedEpisode | undefined> {
    const messages = await this.prisma.chatMessage.findMany({
      where: { threadId: thread.id, thread: { workspaceId }, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true, createdAt: true },
    });

    if (messages.length === 0) {
      return undefined;
    }

    const lastMessageAt = messages[messages.length - 1]?.createdAt ?? new Date();
    const title = String(thread.title ?? '').trim() || 'Nova conversa';
    const summary = String(thread.summary ?? '').trim();

    if (summary.length > 0) {
      return {
        text: `${title}\n${summary}`.trim(),
        title,
        messageCount: messages.length,
        lastMessageAt,
        source: 'thread-summary',
      };
    }

    // No stored summary → deterministic transcript digest (head + tail).
    const head = messages.slice(0, EpisodeService.TRANSCRIPT_SAMPLE);
    const tail =
      messages.length > EpisodeService.TRANSCRIPT_SAMPLE
        ? messages.slice(-Math.min(4, EpisodeService.TRANSCRIPT_SAMPLE))
        : [];
    const sampled = [...head, ...tail];
    const transcript = sampled
      .map((m) => {
        const who = m.role === 'user' ? 'Usuário' : m.role === 'system' ? 'Sistema' : 'Kloel';
        const body = String(m.content ?? '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 280);
        return `${who}: ${body}`;
      })
      .filter((line) => line.length > 0)
      .join('\n');

    return {
      text: `${title}\n${transcript}`.trim(),
      title,
      messageCount: messages.length,
      lastMessageAt,
      source: 'transcript',
    };
  }

  /**
   * Idempotency guard: true when an episode for this thread at this exact
   * last-message timestamp already exists. Keyed on subject (=threadId) and
   * caseType so the scan is index-friendly.
   */
  private async alreadyConsolidated(
    workspaceId: string,
    threadId: string,
    lastMessageAt: Date,
  ): Promise<boolean> {
    const existing = await this.prisma.mindCase.findMany({
      where: {
        workspaceId,
        subject: threadId,
        caseType: EpisodeService.EPISODE_CASE_TYPE,
      },
      orderBy: { occurredAt: 'desc' },
      take: 5,
      select: { features: true },
    });

    const stamp = lastMessageAt.toISOString();
    return existing.some((row) => {
      const features = (row.features as Record<string, unknown> | null) ?? {};
      return features['lastMessageAt'] === stamp;
    });
  }
}

interface DerivedEpisode {
  readonly text: string;
  readonly title: string;
  readonly messageCount: number;
  readonly lastMessageAt: Date;
  readonly source: 'thread-summary' | 'transcript';
}

/** Outcome of one `consolidate()` run. */
export interface EpisodeConsolidationResult {
  readonly workspaceId: string;
  /** New episode rows written to `RAC_MindCase`. */
  readonly written: number;
  /** Threads skipped (empty, or already consolidated at current state). */
  readonly skipped: number;
  /** Threads scanned this run. */
  readonly scanned: number;
}
