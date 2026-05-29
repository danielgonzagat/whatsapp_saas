import { Injectable } from '@nestjs/common';
import type { KloelMessage, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

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
  async create(input: Prisma.KloelMessageCreateInput): Promise<MindMessage> {
    return this.prisma.kloelMessage.create({ data: input });
  }
}
