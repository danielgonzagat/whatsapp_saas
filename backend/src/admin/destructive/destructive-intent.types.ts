import type {
  DestructiveIntent,
  DestructiveIntentKind,
  DestructiveIntentStatus,
} from '@prisma/client';

/**
 * Re-export the Prisma-generated model under a stable alias so that
 * handlers and the service can depend on a type from this module
 * without chasing `@prisma/client` imports directly.
 */
export type DestructiveIntentRecord = DestructiveIntent;
export type { DestructiveIntentKind, DestructiveIntentStatus };

/**
 * Serialisable view of an intent exposed to the admin frontend. It
 * strips internal fields (`undo_token_hash`) and coerces timestamps
 * to ISO strings so the response is safe to serialize.
 */
export interface DestructiveIntentView {
  /** Id property. */
  id: string;
  /** Kind property. */
  kind: DestructiveIntentKind;
  /** Status property. */
  status: DestructiveIntentStatus;
  /** Target type property. */
  targetType: string;
  /** Target id property. */
  targetId: string;
  /** Reason property. */
  reason: string;
  /** Challenge property. */
  challenge: string;
  /** Requires otp property. */
  requiresOtp: boolean;
  /** Reversible property. */
  reversible: boolean;
  /** Created at property. */
  createdAt: string;
  /** Expires at property. */
  expiresAt: string;
  /** Confirmed at property. */
  confirmedAt: string | null;
  /** Executed at property. */
  executedAt: string | null;
  /** Failure message property. */
  failureMessage: string | null;
  /** Undo expires at property. */
  undoExpiresAt: string | null;
  /** Undo at property. */
  undoAt: string | null;
  /** Result snapshot property. */
  resultSnapshot: Record<string, unknown> | null;
}

/** To destructive intent view. */
export function toDestructiveIntentView(intent: DestructiveIntentRecord): DestructiveIntentView {
  return {
    id: intent.id,
    kind: intent.kind,
    status: intent.status,
    targetType: intent.targetType,
    targetId: intent.targetId,
    reason: intent.reason,
    challenge: intent.challenge,
    requiresOtp: intent.requiresOtp,
    reversible: intent.reversible,
    createdAt: intent.createdAt.toISOString(),
    expiresAt: intent.expiresAt.toISOString(),
    confirmedAt: intent.confirmedAt ? intent.confirmedAt.toISOString() : null,
    executedAt: intent.executedAt ? intent.executedAt.toISOString() : null,
    failureMessage: intent.failureMessage,
    undoExpiresAt: intent.undoExpiresAt ? intent.undoExpiresAt.toISOString() : null,
    undoAt: intent.undoAt ? intent.undoAt.toISOString() : null,
    resultSnapshot: (intent.resultSnapshot as Record<string, unknown> | null) ?? null,
  };
}
