import { adminFetch } from './admin-client';

/** Destructive intent kind type. */
export type DestructiveIntentKind =
  | 'ACCOUNT_SUSPEND'
  | 'ACCOUNT_DEACTIVATE'
  | 'ACCOUNT_HARD_DELETE'
  | 'PRODUCT_ARCHIVE'
  | 'PRODUCT_DELETE'
  | 'REFUND_MANUAL'
  | 'PAYOUT_CANCEL'
  | 'MFA_RESET'
  | 'FORCE_LOGOUT_GLOBAL'
  | 'CACHE_PURGE';

/** Destructive intent status type. */
export type DestructiveIntentStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'EXECUTING'
  | 'EXECUTED'
  | 'FAILED'
  | 'EXPIRED'
  | 'UNDONE';

/** Destructive intent view shape. */
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

/** Create intent input shape. */
export interface CreateIntentInput {
  /** Kind property. */
  kind: DestructiveIntentKind;
  /** Target type property. */
  targetType: string;
  /** Target id property. */
  targetId: string;
  /** Reason property. */
  reason: string;
  /** Ttl seconds property. */
  ttlSeconds?: number;
}

/** Admin destructive api. */
export const adminDestructiveApi = {
  create(input: CreateIntentInput): Promise<DestructiveIntentView> {
    return adminFetch<DestructiveIntentView>('/destructive-intents', {
      method: 'POST',
      body: input,
    });
  },
  get(id: string): Promise<DestructiveIntentView> {
    return adminFetch<DestructiveIntentView>(`/destructive-intents/${encodeURIComponent(id)}`);
  },
  confirm(id: string, challenge: string): Promise<DestructiveIntentView> {
    return adminFetch<DestructiveIntentView>(
      `/destructive-intents/${encodeURIComponent(id)}/confirm`,
      { method: 'POST', body: { challenge } },
    );
  },
  undo(id: string, undoToken: string): Promise<DestructiveIntentView> {
    return adminFetch<DestructiveIntentView>(
      `/destructive-intents/${encodeURIComponent(id)}/undo`,
      { method: 'POST', body: { undoToken } },
    );
  },
};
