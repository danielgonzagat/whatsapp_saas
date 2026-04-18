import type { FraudBlacklistType } from '@prisma/client';

export type FraudAction = 'allow' | 'review' | 'require_3ds' | 'block';

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

export interface FraudReason {
  signal: string;
  detail: string;
}

export interface FraudDecision {
  action: FraudAction;
  score: number;
  reasons: FraudReason[];
}

export interface AddBlacklistInput {
  type: FraudBlacklistType;
  value: string;
  reason: string;
  addedBy?: string;
  expiresAt?: Date;
}
