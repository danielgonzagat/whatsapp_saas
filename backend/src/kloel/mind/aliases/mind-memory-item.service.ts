import { Injectable, Logger } from '@nestjs/common';
import type { KloelMemory, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { isMindMemoryDualWriteEnabled } from './mindmemory-dualwrite.flag';
import { isMindMemoryReadCanonicalEnabled } from './mindmemory-read-canonical.flag';

/**
 * Canonical Brain → Mind alias surface for `KloelMemory`.
 *
 * Phase 1 (PI-K23 / Claude-K50) of the Brain → Mind unification keeps the
 * underlying Postgres table (`RAC_KloelMemory`) untouched. This service is a
 * thin, typed wrapper around `prisma.kloelMemory.*` so new code can read/write
 * via `MindMemoryItemService` while the 89+ existing callers continue to use
 * `prisma.kloelMemory` directly.
 *
 * Both surfaces hit the SAME row — no dual table, no migration, no data
 * movement. PR-2 / PR-4 of the unification plan will layer a feature-flagged
 * adapter on top once the canonical `RAC_MindMemory` table lands.
 *
 * @see docs/architecture/BRAIN_MIND_UNIFICATION_PLAN.md (Phase 1 Adopter Path)
 */
export type MindMemoryItem = KloelMemory;

@Injectable()
export class MindMemoryItemService {
  private readonly logger = new Logger(MindMemoryItemService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Canonical typed delegate for the underlying mind-memory table.
   *
   * This is the migration target for the ~141 legacy `prisma.kloelMemory.*`
   * call sites. Accessing `mindMemory.items` returns Prisma's fully-typed
   * `KloelMemory` delegate, so every operation (`findMany`, `findUnique`,
   * `create`, `update`, `updateMany`, `upsert`, `delete`, `deleteMany`,
   * `count`, `aggregate`, `groupBy`) keeps its exact overloaded signature —
   * `select`/`include` projections narrow identically. Callers migrate by
   * swapping `this.prisma.kloelMemory.X(args)` → `this.mindMemory.items.X(args)`
   * with byte-identical args and zero behaviour drift.
   *
   * The high-level helpers below remain the preferred surface for new code;
   * `items` exists so legacy access patterns canonicalize without contortion
   * while the underlying `RAC_KloelMemory` → `RAC_MindMemory` table rename
   * stays owner-gated.
   */
  get items(): PrismaService['kloelMemory'] {
    return this.prisma.kloelMemory;
  }

  /** Find a single mind memory item by id. */
  async findById(id: string): Promise<MindMemoryItem | null> {
    return this.prisma.kloelMemory.findUnique({ where: { id } });
  }

  /** Find a mind memory item by its (workspaceId, key) unique pair. */
  async findByKey(workspaceId: string, key: string): Promise<MindMemoryItem | null> {
    // Flag-gated canonical READER cut-over (message-memory-cutover), scoped to
    // `namespace='default'` ONLY (never the live `umem:` per-user plane). When
    // `KLOEL_MINDMEMORY_READ_CANONICAL` is ON, read the canonical
    // `RAC_MindMemory` row first; on a MISSING row or ANY error, fall back to
    // the legacy `RAC_KloelMemory` read below. Flag OFF (default) is
    // byte-identical to the legacy-only path.
    if (isMindMemoryReadCanonicalEnabled()) {
      try {
        const canonical = await this.prisma.mindMemory.findUnique({
          where: { workspaceId_namespace_key: { workspaceId, namespace: 'default', key } },
        });
        if (canonical) {
          const { namespace: _namespace, ...item } = canonical;
          return item;
        }
        // No canonical row → fall through to legacy (not yet backfilled).
      } catch {
        // Any canonical-read failure → fall through to the legacy read.
      }
    }

    return this.prisma.kloelMemory.findUnique({
      where: { workspaceId_key: { workspaceId, key } },
    });
  }

  /** List memory items for a workspace, optionally filtered by category. */
  async listByWorkspace(
    workspaceId: string,
    options: { category?: string; take?: number } = {},
  ): Promise<MindMemoryItem[]> {
    const { category, take = 50 } = options;

    // Flag-gated canonical READER cut-over (message-memory-cutover), scoped to
    // `namespace='default'` ONLY (never the live `umem:` per-user plane). When
    // `KLOEL_MINDMEMORY_READ_CANONICAL` is ON, read the canonical
    // `RAC_MindMemory` rows first; on an EMPTY result or ANY error, fall back
    // to the legacy `RAC_KloelMemory` read below. Flag OFF (default) is
    // byte-identical to the legacy-only path.
    if (isMindMemoryReadCanonicalEnabled()) {
      try {
        const canonical = await this.prisma.mindMemory.findMany({
          where: { workspaceId, namespace: 'default', ...(category ? { category } : {}) },
          orderBy: { updatedAt: 'desc' },
          take,
        });
        if (canonical.length > 0) {
          return canonical.map(({ namespace: _namespace, ...item }) => item);
        }
        // Empty canonical window → fall through to legacy (not yet backfilled).
      } catch {
        // Any canonical-read failure → fall through to the legacy read.
      }
    }

    return this.prisma.kloelMemory.findMany({
      where: { workspaceId, ...(category ? { category } : {}) },
      orderBy: { updatedAt: 'desc' },
      take,
    });
  }

  /** Upsert a mind memory item by (workspaceId, key). */
  async upsert(
    workspaceId: string,
    key: string,
    payload: { value: Prisma.InputJsonValue; category?: string; type?: string; content?: string },
  ): Promise<MindMemoryItem> {
    const { value, category = 'general', type, content } = payload;
    // Legacy canonical write — kept EXACTLY as-is. This is the source of truth.
    const result = await this.prisma.kloelMemory.upsert({
      where: { workspaceId_key: { workspaceId, key } },
      create: { workspaceId, key, value, category, type, content },
      update: { value, category, type, content },
    });

    // ADDITIVE, flag-gated, best-effort dual-write to the canonical
    // `RAC_MindMemory` table (currently writer-less). Behind
    // `KLOEL_MINDMEMORY_DUALWRITE` (default OFF). Any failure here is swallowed
    // with a warn-log so it can NEVER break the legacy write above. No read path
    // depends on this; `namespace` uses the model default.
    if (isMindMemoryDualWriteEnabled()) {
      try {
        await this.prisma.mindMemory.upsert({
          where: { workspaceId_namespace_key: { workspaceId, namespace: 'default', key } },
          create: { workspaceId, key, value, category, type, content },
          update: { value, category, type, content },
        });
      } catch (error) {
        this.logger.warn(
          `MindMemory dual-write failed (workspaceId=${workspaceId}, key=${key}); ` +
            `legacy KloelMemory write succeeded and is unaffected: ${
              error instanceof Error ? error.message : String(error)
            }`,
        );
      }
    }

    return result;
  }
}
