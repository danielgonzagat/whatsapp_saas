import type {
  CampaignMetrics,
  AdAlertContext,
} from './product-sub-resources/helpers/campaign.helpers';

export const AD_ALERT_ARMS = [
  'alert_only',
  'suggest_pause',
  'suggest_budget_down',
  'suggest_creative',
  'ignore',
] as const;

export type AdAlertArm = (typeof AD_ALERT_ARMS)[number];

export const AD_RULE_COOLDOWN_MS = 60 * 60 * 1000;
export const AD_RULE_WINDOW_HOURS = 24;
export const AD_RULE_WINDOW_MS = AD_RULE_WINDOW_HOURS * 60 * 60 * 1000;

export const ONE_DECIMAL_PERCENT = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
  useGrouping: false,
});

export interface AdRuleSnapshot {
  id: string;
  workspaceId: string;
  name: string;
  condition: string | null;
  action: string;
  alertMethod: string | null;
  alertTarget: string | null;
  lastFiredAt: Date | null;
}

export interface AdRuleEvaluation {
  shouldFire: boolean;
  metrics: CampaignMetrics | null;
  context: AdAlertContext | null;
  banditAction: string | null;
}

/**
 * Empty evaluation sentinel used when a rule cannot/should not fire yet.
 */
export const EMPTY_EVALUATION: AdRuleEvaluation = {
  shouldFire: false,
  metrics: null,
  context: null,
  banditAction: null,
};

/** Normalise a rule condition string to lowercase, treating null as empty. */
export function normalizeCondition(condition: string | null): string {
  return (condition || '').toLowerCase();
}

/** Returns true when the rule's last fire is within the cooldown window. */
export function isWithinCooldown(
  lastFiredAt: Date | null,
  cooldownMs: number = AD_RULE_COOLDOWN_MS,
  now: number = Date.now(),
): boolean {
  if (!lastFiredAt) {
    return false;
  }
  return now - lastFiredAt.getTime() < cooldownMs;
}

export interface AdConditionFlags {
  isRoas: boolean;
  isSpendOrBudget: boolean;
  budgetExhausted: boolean;
  thresholdLow: boolean;
  requiresMetrics: boolean;
}

/** Extract semantic flags from a (lowercased) condition string. */
export function parseConditionFlags(condition: string): AdConditionFlags {
  const isRoas = condition.includes('roas') || condition.includes('conversao');
  const isSpendOrBudget =
    condition.includes('gasto') || condition.includes('spend') || condition.includes('budget');
  const budgetExhausted = condition.includes('budget') || condition.includes('orçamento');
  const thresholdLow = condition.includes('baixo') || condition.includes('caiu');
  return {
    isRoas,
    isSpendOrBudget,
    budgetExhausted,
    thresholdLow,
    requiresMetrics: isRoas || isSpendOrBudget,
  };
}

/**
 * Build a CampaignMetrics payload from raw paid/failed sales counts.
 * All non-conversion fields default to zero since the ad rules engine
 * only consumes conversion-rate / converted-count signals today.
 */
export function buildCampaignMetricsFromSales(
  salesCount: number,
  failedCount: number,
): CampaignMetrics {
  const total = salesCount + failedCount;
  return {
    sentCount: 0,
    deliveredCount: 0,
    readCount: 0,
    failedCount: 0,
    repliedCount: 0,
    convertedCount: salesCount,
    conversionRate: total > 0 ? salesCount / total : 0,
    totalSpentCents: 0,
    revenueCents: 0,
    roas: 0,
  };
}

/** Build the AdAlertContext payload from a rule + parsed metrics. */
export function buildAdAlertContext(
  rule: AdRuleSnapshot,
  flags: AdConditionFlags,
  metrics: CampaignMetrics,
  windowHours: number = AD_RULE_WINDOW_HOURS,
): AdAlertContext {
  return {
    workspaceId: rule.workspaceId,
    ruleId: rule.id,
    ruleName: rule.name,
    campaignBudgetExhausted: flags.budgetExhausted,
    metric: metrics,
    threshold: flags.thresholdLow ? 'low' : 'normal',
    windowHours,
    campaign: rule.name,
  };
}

/** Compose a one-line summary of metric state for alert logs. */
export function formatMetricsSummary(metrics: CampaignMetrics | null): string {
  if (!metrics) {
    return 'no metrics';
  }
  const rate = ONE_DECIMAL_PERCENT.format(metrics.conversionRate * 100);
  return `converted=${metrics.convertedCount} rate=${rate}%`;
}

/** Compose the full alert log line for an outbound rule fire. */
export function formatAlertLogLine(
  rule: AdRuleSnapshot,
  chosenAction: string,
  metrics: CampaignMetrics | null,
): string {
  const summary = formatMetricsSummary(metrics);
  return (
    `Alert [${rule.alertMethod}] → ${rule.alertTarget}: ` +
    `Rule "${rule.name}" fired — action=${chosenAction} (${summary})`
  );
}

/** Compute the lookback window start instant (default = 24h ago). */
export function computeWindowStart(
  now: number = Date.now(),
  windowMs: number = AD_RULE_WINDOW_MS,
): Date {
  return new Date(now - windowMs);
}
