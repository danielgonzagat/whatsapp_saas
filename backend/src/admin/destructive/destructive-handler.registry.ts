import type { DestructiveIntentKind } from '@prisma/client';
import type { DestructiveIntentRecord } from './destructive-intent.types';

/**
 * A handler executes the domain side-effect of a confirmed
 * DestructiveIntent. Handlers return an idempotent snapshot that is
 * persisted to `destructive_intents.result_snapshot` so replayed
 * confirms return the same result without re-running the action.
 *
 * Handlers MUST NOT be invoked directly by controllers — the only
 * authorised caller is DestructiveIntentService.executeIntent.
 * A repo-wide scanner (check-destructive-handler-registered) enforces
 * this invariant at build time (I-ADMIN-D6).
 */
export interface DestructiveHandler {
  /** Kind property. */
  readonly kind: DestructiveIntentKind;
  /** Reversible property. */
  readonly reversible: boolean;
  /** Requires otp property. */
  readonly requiresOtp: boolean;
  /** Execute. */
  execute(intent: DestructiveIntentRecord): Promise<DestructiveHandlerResult>;
  /**
   * Called if the intent is still within its undo window and the admin
   * requested undo. Handlers that are not reversible (hard delete,
   * external refund) must throw `UnsupportedUndoError`.
   */
  undo(intent: DestructiveIntentRecord): Promise<DestructiveHandlerResult>;
}

/** Destructive handler result shape. */
export interface DestructiveHandlerResult {
  /** Ok property. */
  ok: boolean;
  /** Snapshot property. */
  snapshot: Record<string, unknown>;
}

/** Unsupported undo error. */
export class UnsupportedUndoError extends Error {
  constructor(kind: DestructiveIntentKind) {
    super(`DestructiveIntent kind ${kind} is not reversible (I-ADMIN-D1)`);
  }
}

/**
 * Registry of known handlers. Modules register their handler during
 * bootstrap via `DestructiveIntentRegistry.register`. The service
 * resolves by kind at execute time. Any kind with no registered
 * handler falls through to a FAILED transition.
 */
export class DestructiveIntentRegistry {
  private readonly handlers = new Map<DestructiveIntentKind, DestructiveHandler>();

  /** Register. */
  register(handler: DestructiveHandler): void {
    if (this.handlers.has(handler.kind)) {
      throw new Error(`DestructiveIntent handler already registered for ${handler.kind}`);
    }
    this.handlers.set(handler.kind, handler);
  }

  /** Resolve. */
  resolve(kind: DestructiveIntentKind): DestructiveHandler | null {
    return this.handlers.get(kind) ?? null;
  }

  /** List registered. */
  listRegistered(): DestructiveIntentKind[] {
    return Array.from(this.handlers.keys()).sort();
  }
}
