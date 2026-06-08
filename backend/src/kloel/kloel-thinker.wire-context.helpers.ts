/**
 * Per-turn CONTEXT-WIRING helpers for the streaming think loop.
 *
 * Track wire-context — inject the per-user MEMORY block and the CAPABILITY
 * MANIFEST block into the hidden runtime context the model carries before each
 * official chat turn, then capture new memories after the turn completes.
 *
 * Both services already exist and are independently tested:
 *   - {@link MemoryService} (mind/memory) — per-user typed memory graph; its
 *     `buildMemoryContextForModel` returns a compact, model-ready block that is
 *     empty when the user has no memories (honest empty state, never fabricated).
 *   - {@link ManifestInjectionBuilderService} (manifest) — routes the turn and
 *     renders the relevant capability subset + obligations into a fenced,
 *     hidden-from-user block.
 *
 * Everything here is ADDITIVE and DEGRADES TO EMPTY on any failure: a memory or
 * manifest error must never break, slow, or alter a chat turn. The injected text
 * is appended to the runtime `dynamicContext` channel (the same hidden JSON the
 * loop already carries) — it never reaches the user-visible answer.
 */

import type { StructuredLogger } from '../logging/structured-logger';
import type { MemoryService } from './mind/memory/memory.service';
import type { ManifestInjectionBuilderService } from './manifest/manifest-injection.builder';
import type { CapabilityRouterContext } from './manifest/capability-manifest.types';

/** Bundle of the optional wire-context services injected into the thinker. */
export interface WireContextServices {
  /** Per-user typed memory graph. Undefined when not provided (flag/DI off). */
  readonly memoryService?: MemoryService;
  /** Capability-manifest injection builder. Undefined when not provided. */
  readonly manifestInjection?: ManifestInjectionBuilderService;
}

/**
 * Result of assembling the per-turn hidden context: the compact text to append
 * to the runtime context (never user-visible) and the manifest internal names
 * present in it (the sanitizer's redaction list, for callers that scrub output).
 */
export interface WireContextBlock {
  /** Compact memory + manifest text to append to the hidden runtime context. */
  readonly text: string;
  /** Manifest `internalName` values present in `text` — never shown to the user. */
  readonly internalNames: readonly string[];
}

const EMPTY_BLOCK: WireContextBlock = { text: '', internalNames: [] };

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'unknown error';
}

/**
 * Build the compact per-turn MEMORY + CAPABILITY-MANIFEST block to splice into
 * the hidden runtime context before the model call.
 *
 * Pure orchestration over two best-effort services. Returns an empty block when:
 *   - there is no workspace/user to scope memory to,
 *   - neither service is provided (flag/DI off),
 *   - or either service throws (each branch is independently guarded so a failure
 *     in one never suppresses the other).
 *
 * Nothing here is shown to the user; the text is appended to `dynamicContext`,
 * the same hidden channel the loop already carries.
 */
export async function buildWireContextBlock(
  services: WireContextServices,
  logger: StructuredLogger,
  params: {
    workspaceId: string | undefined;
    userId: string | undefined;
    message: string;
    surface: string;
    permissions: string[] | undefined;
  },
): Promise<WireContextBlock> {
  const { workspaceId, userId, message, surface, permissions } = params;

  const sections: string[] = [];
  const internalNames: string[] = [];

  // ─── per-user memory block ───────────────────────────────────────────
  if (services.memoryService && workspaceId && userId) {
    try {
      const memory = await services.memoryService.buildMemoryContextForModel(
        workspaceId,
        userId,
        message,
      );
      if (memory.text.trim().length > 0) {
        sections.push(memory.text);
      }
    } catch (error: unknown) {
      logger.warn('wire-context memory injection failed', {
        context: 'buildWireContextBlock.memory',
        error: formatError(error),
      });
    }
  }

  // ─── capability-manifest block ───────────────────────────────────────
  if (services.manifestInjection) {
    try {
      const routerContext: CapabilityRouterContext = {
        surface,
        permissions: Array.isArray(permissions) ? permissions : [],
      };
      const injection = services.manifestInjection.assemble(message, routerContext);
      if (injection.text.trim().length > 0) {
        sections.push(injection.text);
      }
      internalNames.push(...injection.internalNames);
    } catch (error: unknown) {
      logger.warn('wire-context manifest injection failed', {
        context: 'buildWireContextBlock.manifest',
        error: formatError(error),
      });
    }
  }

  if (sections.length === 0) {
    return EMPTY_BLOCK;
  }
  return { text: sections.join('\n\n'), internalNames };
}

/**
 * Append the hidden wire-context block to the existing runtime `dynamicContext`.
 * No-op when the block is empty so the byte-identical legacy context is preserved
 * for users with no memories and a manifest that produced nothing.
 */
export function appendWireContext(dynamicContext: string, block: WireContextBlock): string {
  // Defensive: the runtime always supplies a string, but coerce non-string base
  // context to '' so a malformed upstream value can never throw on `.trim()`.
  const base = typeof dynamicContext === 'string' ? dynamicContext : '';
  if (block.text.trim().length === 0) {
    return base;
  }
  return base.trim().length > 0 ? `${base}\n\n${block.text}` : block.text;
}

/**
 * Fire-and-forget memory capture for a completed turn. Extracts durable typed
 * memories from the user message + assistant reply and persists them into the
 * per-user graph. Best-effort: swallows every error (and a missing service)
 * so it can never break or delay the reply that already streamed.
 */
export function captureTurnMemory(
  services: WireContextServices,
  logger: StructuredLogger,
  params: {
    workspaceId: string | undefined;
    userId: string | undefined;
    message: string;
    reply: string;
  },
): void {
  const { workspaceId, userId, message, reply } = params;
  if (!services.memoryService || !workspaceId || !userId) {
    return;
  }
  const turnText = `Usuário: ${message}\n\nKloel: ${reply}`;
  void services.memoryService
    .extractFromTurn(workspaceId, userId, turnText)
    .catch((error: unknown) => {
      logger.warn('wire-context memory capture failed', {
        context: 'captureTurnMemory',
        error: formatError(error),
      });
    });
}
