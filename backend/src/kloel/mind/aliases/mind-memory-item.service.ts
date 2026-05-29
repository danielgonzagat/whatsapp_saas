import { Injectable } from '@nestjs/common';
import type { KloelMemory, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  /** Find a single mind memory item by id. */
  async findById(id: string): Promise<MindMemoryItem | null> {
    return this.prisma.kloelMemory.findUnique({ where: { id } });
  }

  /** Find a mind memory item by its (workspaceId, key) unique pair. */
  async findByKey(workspaceId: string, key: string): Promise<MindMemoryItem | null> {
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
    return this.prisma.kloelMemory.upsert({
      where: { workspaceId_key: { workspaceId, key } },
      create: { workspaceId, key, value, category, type, content },
      update: { value, category, type, content },
    });
  }
}
