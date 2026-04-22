import type { FraudBlacklistType } from '@prisma/client';

/** Fraud action type. */
export type FraudAction = 'allow' | 'review' | 'require_3ds' | 'block';

/** Fraud checkout context shape. */
export interface FraudCheckoutContext {
  /** Buyer cpf property. */
  buyerCpf?: string | null;
  /** Buyer cnpj property. */
  buyerCnpj?: string | null;
  /** Buyer email property. */
  buyerEmail?: string | null;
  /** Buyer ip property. */
  buyerIp?: string | null;
  /** Device fingerprint property. */
  deviceFingerprint?: string | null;
  /** Card bin property. */
  cardBin?: string | null;
  /** Card country property. */
  cardCountry?: string | null;
  /** Order country property. */
  orderCountry?: string | null;
  /** Amount cents property. */
  amountCents: bigint;
  /** Workspace id property. */
  workspaceId: string;
}

/** Fraud reason shape. */
export interface FraudReason {
  /** Signal property. */
  signal: string;
  /** Detail property. */
  detail: string;
}

/** Fraud decision shape. */
export interface FraudDecision {
  /** Action property. */
  action: FraudAction;
  /** Score property. */
  score: number;
  /** Reasons property. */
  reasons: FraudReason[];
}

/** Add blacklist input shape. */
export interface AddBlacklistInput {
  /** Type property. */
  type: FraudBlacklistType;
  /** Value property. */
  value: string;
  /** Reason property. */
  reason: string;
  /** Added by property. */
  addedBy?: string;
  /** Expires at property. */
  expiresAt?: Date;
}
