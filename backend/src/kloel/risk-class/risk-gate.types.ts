/**
 * OC-ORPHAN-14: Risk Gate Behavioral Contract Types.
 *
 * RiskGateService wraps RiskClassService to produce an execution-gate
 * decision before every R2/R3/R4 action executes. This closes the gap
 * where RiskClassService existed but zero production code consulted it.
 *
 * Part of Camada XIII — UTP-DELEG-001.
 */

import type {
  ActionTarget,
  RiskClassification,
} from './risk-class.types';

export type GateVerdict = 'allow' | 'warn' | 'block';

export interface RiskGateDecision {
  readonly classification: RiskClassification;
  readonly verdict: GateVerdict;
  readonly reason: string;
}

export interface GatePaymentInput {
  readonly amountCents: number;
  readonly reversible: boolean;
  readonly target: ActionTarget;
}

export interface GateDiscountInput {
  readonly amountCents: number;
  readonly reversible: boolean;
  readonly target: ActionTarget;
}

export interface GateMessageInput {
  readonly target: ActionTarget;
}
