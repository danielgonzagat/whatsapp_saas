/**
 * UTP-MATURITY-002 — Maturity Classifier.
 *
 * Rule-based classifier with explicit thresholds that maps a
 * SignalSummary to a MaturityVerdict. The classifier evaluates
 * each stage's preconditions from most-advanced to least-advanced
 * and returns the first matching stage.
 *
 * Thresholds are documented inline. Each threshold was calibrated
 * against the Camada VIII semantics (Plan §Parte B — MATURITY family):
 *
 *   validacao   — few sales, few leads, high churn, ≤1 product
 *   tracao      — growing payments, steady leads, moderate churn
 *   crescimento — volume: payments, leads, campaigns, staff
 *   maturidade  — high repeat rate, low refund, predictable
 *   otimizacao  — very high repeat, negligible refund, portfolio
 */
import type { MaturityStage, MaturityVerdict, SignalSummary } from './maturity.types';

export function classifyMaturity(signals: SignalSummary): MaturityVerdict {
  const now = new Date().toISOString();

  // ------------------------------------------------------------------
  // STAGE otimizacao
  // Signals: very high repeat payment rate, negligible refunds,
  // active campaigns, multiple products, high deal close rate.
  // Thresholds:
  //   repeatPaymentRate >= 0.60
  //   refundRate <= 0.03
  //   productCount >= 3
  //   campaignCount >= 10
  //   dealsClosedRate >= 0.75
  //   conversionsPerMonth >= 80
  // ------------------------------------------------------------------
  if (
    signals.repeatPaymentRate >= 0.6 &&
    signals.refundRate <= 0.03 &&
    signals.productCount >= 3 &&
    signals.campaignCount >= 10 &&
    signals.dealsClosedRate >= 0.75 &&
    signals.conversionsPerMonth >= 80
  ) {
    return buildVerdict('otimizacao', 0.88, signals, now);
  }

  // ------------------------------------------------------------------
  // STAGE maturidade
  // Signals: high repeat rate, low refund, multiple products,
  // growing campaigns, good deal close rate.
  // Thresholds:
  //   repeatPaymentRate >= 0.40
  //   refundRate <= 0.08
  //   productCount >= 2
  //   campaignCount >= 5
  //   dealsClosedRate >= 0.60
  //   conversionsPerMonth >= 40
  // ------------------------------------------------------------------
  if (
    signals.repeatPaymentRate >= 0.4 &&
    signals.refundRate <= 0.08 &&
    signals.productCount >= 2 &&
    signals.campaignCount >= 5 &&
    signals.dealsClosedRate >= 0.6 &&
    signals.conversionsPerMonth >= 40
  ) {
    return buildVerdict('maturidade', 0.82, signals, now);
  }

  // ------------------------------------------------------------------
  // STAGE crescimento
  // Signals: solid volume, growing leads, campaigns starting,
  // multiple deals, manageable refund and churn.
  // Thresholds:
  //   conversionsPerMonth >= 15
  //   uniqueLeads >= 30
  //   churnRate <= 0.25
  //   refundRate <= 0.15
  //   campaignCount >= 1
  // ------------------------------------------------------------------
  if (
    signals.conversionsPerMonth >= 15 &&
    signals.uniqueLeads >= 30 &&
    signals.churnRate <= 0.25 &&
    signals.refundRate <= 0.15 &&
    signals.campaignCount >= 1
  ) {
    return buildVerdict('crescimento', 0.8, signals, now);
  }

  // ------------------------------------------------------------------
  // STAGE tracao
  // Signals: some conversions happening consistently, leads
  // being captured, churn not catastrophic.
  // Thresholds:
  //   conversionsPerMonth >= 3
  //   uniqueLeads >= 5
  //   churnRate <= 0.50
  //   repeatPaymentRate >= 0.10 (at least some repeat customers)
  // ------------------------------------------------------------------
  if (
    signals.conversionsPerMonth >= 3 &&
    signals.uniqueLeads >= 5 &&
    signals.churnRate <= 0.5 &&
    signals.repeatPaymentRate >= 0.1
  ) {
    return buildVerdict('tracao', 0.75, signals, now);
  }

  // ------------------------------------------------------------------
  // STAGE validacao (catch-all fallback)
  // Any workspace that doesn't meet tracao criteria is classified
  // as validacao. Confidence is proportional to signal presence:
  // higher when some metrics are non-zero (showing activity).
  // ------------------------------------------------------------------
  const rawPaymentCount = signals.observationWindowDays > 0
    ? Math.round((signals.conversionsPerMonth / 30) * signals.observationWindowDays)
    : 0;

  const conf = Math.min(
    0.7,
    0.2 +
      (signals.conversionsPerMonth > 0 ? 0.15 : 0) +
      (signals.uniqueLeads > 0 ? 0.15 : 0) +
      (signals.productCount > 0 ? 0.1 : 0) +
      (rawPaymentCount > 0 ? 0.1 : 0),
  );

  return buildVerdict('validacao', conf, signals, now);
}

function buildVerdict(
  stage: MaturityStage,
  confidence: number,
  signals: SignalSummary,
  classifiedAt: string,
): MaturityVerdict {
  return { stage, confidence, signals, classifiedAt };
}
