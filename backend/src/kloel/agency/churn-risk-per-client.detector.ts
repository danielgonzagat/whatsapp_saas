/**
 * UTP-AGENCY-005 — Churn Risk Per Client Detector.
 *
 * Detects churn risk per client based on signals:
 * days since last contact, delayed payments, complaints,
 * scope reduction, and contract renewal proximity.
 *
 * Pure function — stateless detection from input signals.
 */

import type { ChurnInput, ChurnRiskPerClient, ChurnRiskLevel } from './types';
import {
  CHURN_CRITICAL_THRESHOLD,
  CHURN_HIGH_THRESHOLD,
  CHURN_MODERATE_THRESHOLD,
  clampScore,
} from './types';

export interface ChurnResult {
  readonly assessment: ChurnRiskPerClient;
  readonly requiresAction: boolean;
}

function computeChurnProbability(input: ChurnInput): number {
  let probability = 0;

  if (input.recentContactDays > 30) {
    probability += 0.4;
  } else if (input.recentContactDays > 14) {
    probability += 0.25;
  } else if (input.recentContactDays > 7) {
    probability += 0.1;
  }

  if (input.delayedPayment) {
    probability += 0.2;
  }

  const complaintWeight = Math.min(input.complaintCount * 0.1, 0.3);
  probability += complaintWeight;

  if (input.scopeReduction) {
    probability += 0.15;
  }

  if (input.bundle.contractRenewalAt) {
    const renewalMs = Date.parse(input.bundle.contractRenewalAt);
    if (Number.isFinite(renewalMs)) {
      const now = input.nowMs ?? Date.now();
      const daysUntil = (renewalMs - now) / (1000 * 60 * 60 * 24);
      if (daysUntil < 0) {
        probability += 0.2;
      } else if (daysUntil < 30) {
        probability += 0.15;
      } else if (daysUntil < 60) {
        probability += 0.05;
      }
    }
  }

  if (input.bundle.satisfactionScore < 0.3) {
    probability += 0.2;
  } else if (input.bundle.satisfactionScore < 0.5) {
    probability += 0.1;
  }

  return clampScore(probability);
}

function riskLevelFromProbability(probability: number): ChurnRiskLevel {
  if (probability >= CHURN_CRITICAL_THRESHOLD) {
    return 'critical';
  }
  if (probability >= CHURN_HIGH_THRESHOLD) {
    return 'high';
  }
  if (probability >= CHURN_MODERATE_THRESHOLD) {
    return 'moderate';
  }
  return 'low';
}

function collectSignals(input: ChurnInput): readonly string[] {
  const signals: string[] = [];

  if (input.recentContactDays > 14) {
    signals.push('no_recent_contact');
  }
  if (input.delayedPayment) {
    signals.push('delayed_payment');
  }
  if (input.complaintCount > 0) {
    signals.push(`complaints_${Math.min(input.complaintCount, 5)}`);
  }
  if (input.scopeReduction) {
    signals.push('scope_reduction');
  }
  if (input.bundle.satisfactionScore < 0.5) {
    signals.push('low_satisfaction');
  }
  if (input.bundle.contractRenewalAt) {
    const renewalMs = Date.parse(input.bundle.contractRenewalAt);
    if (Number.isFinite(renewalMs)) {
      const now = input.nowMs ?? Date.now();
      const daysUntil = (renewalMs - now) / (1000 * 60 * 60 * 24);
      if (daysUntil <= 30) {
        signals.push('renewal_near');
      }
    }
  }

  if (signals.length === 0) {
    signals.push('no_signals');
  }

  return signals;
}

export function detectChurnRisk(input: ChurnInput): ChurnResult {
  const nowMs = input.nowMs ?? Date.now();
  const riskProbability = computeChurnProbability(input);
  const riskLevel = riskLevelFromProbability(riskProbability);
  const signals = collectSignals(input);

  let daysUntilRenewal: number | null = null;
  if (input.bundle.contractRenewalAt) {
    const renewalMs = Date.parse(input.bundle.contractRenewalAt);
    if (Number.isFinite(renewalMs)) {
      daysUntilRenewal = Math.round((renewalMs - nowMs) / (1000 * 60 * 60 * 24));
    }
  }

  const assessment: ChurnRiskPerClient = {
    clientId: input.bundle.clientId,
    workspaceId: input.bundle.workspaceId,
    riskLevel,
    riskProbability: Math.round(riskProbability * 100) / 100,
    signals,
    daysSinceLastContact: input.recentContactDays,
    daysUntilRenewal,
    assessedAt: new Date(nowMs).toISOString(),
  };

  const requiresAction = riskLevel === 'critical' || riskLevel === 'high';

  return { assessment, requiresAction };
}
