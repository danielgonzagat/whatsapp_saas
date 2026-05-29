import type { MindMemoryItemService } from '../mind/aliases/mind-memory-item.service';

/**
 * Test-only stub that wraps a mocked Prisma client into the canonical
 * `MindMemoryItemService` shape used by the agent-runtime services.
 *
 * The services were migrated from `this.prisma.kloelMemory.*` to
 * `this.mindMemory.items.*` (Brain → Mind canonicalization, PI brainmind-memory).
 * The `MindMemoryItemService.items` getter delegates straight to
 * `prisma.kloelMemory`, so this stub exposes the SAME mocked delegate object —
 * existing `prisma.kloelMemory.<op>` assertions keep working byte-for-byte
 * because the reference is identical.
 */
export function mindMemoryStub(prismaMock: { kloelMemory: unknown }): MindMemoryItemService {
  return {
    get items() {
      return prismaMock.kloelMemory;
    },
  } as unknown as MindMemoryItemService;
}
