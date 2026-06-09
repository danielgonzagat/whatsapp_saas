import { Injectable } from '@nestjs/common';
import type { KloelMessage, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { StructuredLogger } from '../../../logging/structured-logger';
import { isMindMessageReadCanonicalEnabled } from './mindmessage-read-canonical.flag';
import { mirrorMindMessage } from './mindmessage-dualwrite.mirror';

/**
 * Canonical Brain → Mind alias surface for `KloelMessage`.
 *
 * Phase 1 (PI-K23 / Claude-K50) of the Brain → Mind unification keeps the
 * underlying Postgres table (`RAC_KloelMessage`) untouched. This service is a
 * thin, typed wrapper around `prisma.kloelMessage.*` that lets new code call
 * `MindMessageService` while old callers keep using `prisma.kloelMessage`.
 *
 * Both surfaces hit the SAME row — there is no dual table, no migration, and
 * no data movement here. A later PR (PR-5 in the unification plan) will
 * introduce the canonical `RAC_MindMessage` table and a backfill job.
 *
 * @see docs/architecture/BRAIN_MIND_UNIFICATION_PLAN.md (Phase 1 Adopter Path)
 */
export type MindMessage = KloelMessage;

@Injectable()
export class MindMessageService {
  private readonly logger = StructuredLogger.from(MindMessageService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Raw delegate escape hatch for callers that need the full
   * `prisma.kloelMessage` surface (e.g. arbitrary `findMany` projections)
   * which the typed methods above do not cover. Returns the SAME delegate the
   * typed methods use, so a migrated caller's `.items` read is
   * byte-identical to the legacy raw `kloelMessage` delegate access.
   *
   * Mirrors {@link MindMemoryItemService.items}.
   */
  get items(): PrismaService['kloelMessage'] {
    return this.prisma.kloelMessage;
  }

  /** Find a single mind message by id. */
  async findById(id: string): Promise<MindMessage | null> {
    return this.prisma.kloelMessage.findUnique({ where: { id } });
  }

  /** List messages for a workspace (newest-first by default). */
  async listByWorkspace(
    workspaceId: string,
    options: { take?: number; orderBy?: 'asc' | 'desc' } = {},
  ): Promise<MindMessage[]> {
    const { take = 50, orderBy = 'desc' } = options;
    return this.prisma.kloelMessage.findMany({
      where: { workspaceId },
      orderBy: { createdAt: orderBy },
      take,
    });
  }

  /** Create a new mind message. Workspace isolation is the caller's responsibility. */
  /** Create a new mind message. Workspace isolation is the caller's responsibility. */
  async create(input: Prisma.KloelMessageCreateInput): Promise<MindMessage> {
    return this.prisma.kloelMessage.create({ data: input });
  }

  /**
   * Canonical conversation-history surface for a workspace.
   *
   * Returns a stable `{id, role, content, timestamp}` projection used by the
   * Kloel chat and conversation-store consumers, ordered oldest→newest.
   * This is the Brain → Mind canonical replacement for direct
   * `prisma.kloelMessage.findMany({ where: { workspaceId }, orderBy: createdAt asc, take, select })`.
   */
  async getHistory(
    workspaceId: string,
    take = 50,
  ): Promise<{ id: string; role: string; content: string; timestamp: Date }[]> {
    if (!workspaceId) {
      return [];
    }

    // Flag-gated canonical READER cut-over (message-memory-cutover). When
    // `KLOEL_MINDMESSAGE_READ_CANONICAL` is ON, read the canonical
    // `RAC_MindMessage` window first; on an EMPTY result or ANY error, fall
    // back to the legacy `RAC_KloelMessage` read below. Flag OFF (default) is
    // byte-identical to the legacy-only path.
    if (isMindMessageReadCanonicalEnabled()) {
      try {
        // Filter to `source='brain'` so the canonical read matches the legacy
        // RAC_KloelMessage semantics (the Kloel-brain chat). RAC_MindMessage is
        // the UNIFIED table holding every surface (brain/thread/dashboard/...);
        // reading it unscoped would mix non-brain surfaces into the brain-chat
        // history. The historical rows were backfilled as 'brain' and live
        // appends mirror as 'brain' (see appendToConversation).
        const canonical = await this.prisma.mindMessage.findMany({
          where: { workspaceId, source: 'brain' },
          orderBy: { createdAt: 'asc' },
          take,
          select: { id: true, role: true, content: true, createdAt: true },
        });
        if (canonical.length > 0) {
          return canonical.map((row) => ({
            id: row.id,
            role: row.role,
            content: row.content,
            timestamp: row.createdAt,
          }));
        }
        // Empty canonical window → fall through to legacy (not yet backfilled).
      } catch {
        // Any canonical-read failure → fall through to the legacy read.
      }
    }

    const rows = await this.prisma.kloelMessage.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
      take,
      select: { id: true, role: true, content: true, createdAt: true },
    });
    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      timestamp: row.createdAt,
    }));
  }

  /**
   * Canonical conversation-append surface.
   *
   * Persists a single role/content pair into the workspace's conversation
   * history. Brain → Mind replacement for the bare
   * `prisma.kloelMessage.create({ data: { workspaceId, role, content } })`
   * pattern used by KloelConversationStore.
   */
  async appendToConversation(
    workspaceId: string,
    role: string,
    content: string,
  ): Promise<MindMessage> {
    const created = await this.prisma.kloelMessage.create({
      data: { workspaceId, role, content },
    });
    // Mirror the brain-chat write into the canonical RAC_MindMessage as
    // `source='brain'` so the unified table — and the canonical reader — stay
    // current with live appends (the backfill only covered history). Flag-gated
    // (KLOEL_MINDMESSAGE_DUALWRITE) + fail-open: a mirror failure never affects
    // the legacy write the caller depends on.
    await mirrorMindMessage(
      this.prisma,
      { workspaceId, source: 'brain', role, content },
      (error) =>
        this.logger.warn(
          `mind-message brain mirror failed (workspaceId=${workspaceId}): ${error instanceof Error ? error.message : String(error)}`,
        ),
    );
    return created;
  }
}
