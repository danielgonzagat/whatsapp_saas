import { Injectable } from '@nestjs/common';
import type { ChatMessage } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Canonical Brain → Mind alias surface for `ChatMessage`.
 *
 * Mirrors {@link MindMessageService} exactly, but targets the SEPARATE
 * `RAC_ChatMessage` table (dashboard/thread chat) — a DIFFERENT physical
 * table from `RAC_KloelMessage` (brain). There is NO table merge here: the two
 * surfaces hit two distinct rows in two distinct tables. This service is a
 * thin, typed wrapper around `prisma.chatMessage.*` that lets new code call
 * `MindChatMessageService` while old callers keep using `prisma.chatMessage`.
 *
 * No migration, no data movement, no dual-write — only a canonical accessor.
 *
 * @see backend/src/kloel/mind/aliases/mind-message.service.ts (sibling, RAC_KloelMessage)
 * @see docs/architecture/BRAIN_MIND_UNIFICATION_PLAN.md (Phase 1 Adopter Path)
 */
export type MindChatMessage = ChatMessage;

@Injectable()
export class MindChatMessageService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Raw delegate escape hatch for callers that need the full
   * `prisma.chatMessage` surface (e.g. arbitrary `findMany` projections).
   * Returns the SAME delegate legacy callers use, so a migrated caller's
   * `.items` read is byte-identical to the legacy raw `chatMessage` delegate
   * access. Mirrors {@link MindMessageService.items}.
   */
  get items(): PrismaService['chatMessage'] {
    return this.prisma.chatMessage;
  }
}
