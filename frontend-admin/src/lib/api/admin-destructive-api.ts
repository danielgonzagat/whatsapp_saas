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
  id: string;
  kind: DestructiveIntentKind;
  status: DestructiveIntentStatus;
  targetType: string;
  targetId: string;
  reason: string;
  challenge: string;
  requiresOtp: boolean;
  reversible: boolean;
  createdAt: string;
  expiresAt: string;
  confirmedAt: string | null;
  executedAt: string | null;
  failureMessage: string | null;
  undoExpiresAt: string | null;
  undoAt: string | null;
  resultSnapshot: Record<string, unknown> | null;
}

/** Create intent input shape. */
export interface CreateIntentInput {
  kind: DestructiveIntentKind;
  targetType: string;
  targetId: string;
  reason: string;
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
