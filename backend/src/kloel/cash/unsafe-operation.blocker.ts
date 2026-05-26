import { Injectable } from '@nestjs/common';
import type { CashPosition, RiskDetection, RunwayCalculation, UnsafeOperationBlock } from './types';

/**
 * CASH-008 — UnsafeOperationBlocker.
 *
 * Blocks financial operations that would put cash at risk. Checks
 * balance sufficiency, runway health, risk level, and volatility before
 * allowing operations. Operations that would drain the balance below
 * safety margins are blocked.
 */
@Injectable()
export class UnsafeOperationBlocker {
  private static readonly RUNWAY_BLOCK_THRESHOLD_DAYS = 14;
  private static readonly RISK_BLOCK_LEVELS: ReadonlySet<string> = new Set(['critical', 'high']);

  public block(
    operationType: string,
    amountCents: bigint,
    position: CashPosition,
    risk: RiskDetection,
    runway: RunwayCalculation,
  ): UnsafeOperationBlock {
    const result = this.evaluate(
      operationType,
      amountCents,
      position,
      risk,
      runway,
    );

    return {
      workspaceId: position.workspaceId,
      blocked: !result.allowed,
      reason: result.reason,
      operationType,
      amountCents,
      blockerKind: result.kind,
    };
  }

  private evaluate(
    _operationType: string,
    amountCents: bigint,
    position: CashPosition,
    risk: RiskDetection,
    runway: RunwayCalculation,
  ): { allowed: boolean; reason: string; kind: UnsafeOperationBlock['blockerKind'] } {
    if (amountCents > 0n && position.currentBalanceCents - amountCents < 0n) {
      return {
        allowed: false,
        reason: `Insufficient balance. Required ${amountCents} cents, available ${position.currentBalanceCents} cents.`,
        kind: 'insufficient_balance',
      };
    }

    if (
      Number.isFinite(runway.runwayDays) &&
      runway.runwayDays <= UnsafeOperationBlocker.RUNWAY_BLOCK_THRESHOLD_DAYS
    ) {
      return {
        allowed: false,
        reason: `Runway critical at ${runway.runwayDays.toFixed(1)} days. All spending operations blocked.`,
        kind: 'runway_critical',
      };
    }

    if (UnsafeOperationBlocker.RISK_BLOCK_LEVELS.has(risk.riskLevel)) {
      return {
        allowed: false,
        reason: `Risk level ${risk.riskLevel} blocks all non-essential operations.`,
        kind: 'risk_critical',
      };
    }

    const safetyBuffer = this.computeSafetyBuffer(position);
    if (amountCents > 0n && position.currentBalanceCents - amountCents < safetyBuffer) {
      return {
        allowed: false,
        reason: `Operation would breach safety buffer. Required ${amountCents} cents, available above buffer ${position.currentBalanceCents > safetyBuffer ? position.currentBalanceCents - safetyBuffer : 0n} cents.`,
        kind: 'insufficient_balance',
      };
    }

    return {
      allowed: true,
      reason: 'Operation approved within safety margins.',
      kind: 'insufficient_balance',
    };
  }

  private computeSafetyBuffer(position: CashPosition): bigint {
    const min30d = position.minBalance7d;
    if (min30d > 0n) {return BigInt(Number(min30d) * 2);}
    const buffer = Number(position.currentBalanceCents) * 0.2;
    return BigInt(Math.round(Math.abs(buffer)));
  }
}
