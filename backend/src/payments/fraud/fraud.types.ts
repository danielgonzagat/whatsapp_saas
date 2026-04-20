import type { FraudBlacklistType } from '@prisma/client';

/** Fraud action type. */
export type FraudAction = 'allow' | 'review' | 'require_3ds' | 'block';

/** Fraud checkout context shape. */
export interface FraudCheckoutContext {
  buyerCpf?: string | null;
  buyerCnpj?: string | null;
  buyerEmail?: string | null;
  buyerIp?: string | null;
  deviceFingerprint?: string | null;
  cardBin?: string | null;
  amountCents: bigint;
  workspaceId: string;
}

/** Fraud reason shape. */
export interface FraudReason {
  signal: string;
  detail: string;
}

/** Fraud decision shape. */
export interface FraudDecision {
  action: FraudAction;
  score: number;
  reasons: FraudReason[];
}

/** Add blacklist input shape. */
export interface AddBlacklistInput {
  type: FraudBlacklistType;
  value: string;
  reason: string;
  addedBy?: string;
  expiresAt?: Date;
}
