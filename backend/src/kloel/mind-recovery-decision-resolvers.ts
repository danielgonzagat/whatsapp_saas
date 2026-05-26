import { resolveCaseMemoryAction, type CaseMemoryLookup } from './mind-case-memory-decision.helper';
import type { MindPolicyChooser } from './mind-catalog-decision-resolvers';

// Canonical lives in mind-catalog-decision-resolvers — re-export for any
// recovery-side consumers that imported it from here.
export type { MindPolicyChooser };

export interface MindBanditChooser {
  choose(workspaceId: string, decisionType: string): Promise<{ arm: string } | null>;
  register(input: { arms: string[]; decisionType: string; workspaceId: string }): Promise<unknown>;
}

type PolicyDecisionResult = Awaited<ReturnType<MindPolicyChooser['choose']>>;

function decisionConfidence(result: PolicyDecisionResult): number {
  return (
    result.decision.candidates.find((candidate) => candidate.action === result.chosen)
      ?.beliefMean ??
    result.decision.candidates[0]?.beliefMean ??
    0
  );
}

export async function resolveFollowupTimingDecision(
  policy: MindPolicyChooser,
  workspaceId: string,
  contactId: string,
  channel: string,
  requestedDelayHours: number,
  buckets: Record<string, number>,
): Promise<{
  bucket: string;
  confidence: number;
  delayHours: number;
  fallback: boolean;
  outcomeKey: string;
  reasonInternal?: string;
}> {
  const baseline =
    Object.entries(buckets).sort(
      ([, left], [, right]) =>
        Math.abs(left - requestedDelayHours) - Math.abs(right - requestedDelayHours),
    )[0]?.[0] ?? 'medium';
  const hour = new Date().getHours();
  const outcomeKey = `followup:${workspaceId}:${contactId}:${Date.now()}`;
  const result = await policy.choose({
    workspaceId,
    subject: `contact:${contactId}`,
    decisionType: 'followup_timing',
    context: { channel, hour, requestedDelayHours },
    options: Object.entries(buckets).map(([bucket]) => ({
      action: bucket,
      predicate: 'P(reply|template,hour,channel)',
      context: { channel, hour, template: `followup_${bucket}` },
    })),
    baseline,
    outcomeKey,
    utilitySuccess: 1,
    utilityFail: -0.05,
    epsilon: 0.6,
  });

  return {
    bucket: result.chosen,
    confidence: decisionConfidence(result),
    delayHours: buckets[result.chosen] ?? requestedDelayHours,
    fallback: result.decision.fallbackActive,
    outcomeKey,
    reasonInternal: result.decision.reasonInternal,
  };
}

export async function resolveCartRecoveryDecision(
  policy: MindPolicyChooser,
  cases: CaseMemoryLookup | undefined,
  bandit: MindBanditChooser | undefined,
  workspaceId: string,
  orderId: string,
  productName: string,
  priceBand: string,
  ageMinutes: number,
): Promise<{
  action: string;
  banditAction?: string;
  confidence: number;
  fallback: boolean;
  memoryAction?: string;
  reasonInternal?: string;
}> {
  const actions = ['proof', 'urgency', 'help', 'faq', 'discount', 'pause'];
  const memoryAction = cases
    ? await resolveCaseMemoryAction(cases, {
        workspaceId,
        caseType: 'cart_recovery',
        text: `product ${productName} priceBand ${priceBand} ageMinutes ${ageMinutes}`,
        features: { channel: 'email', price_band: priceBand },
        options: actions,
        minSimilarCases: 3,
        minSimilarityTotal: 1.2,
      })
    : null;

  let banditAction: string | null = null;
  if (bandit) {
    try {
      await bandit.register({
        arms: actions,
        decisionType: 'cart_recovery',
        workspaceId,
      });
      const banditChoice = await bandit.choose(workspaceId, 'cart_recovery');
      banditAction = banditChoice?.arm ?? null;
    } catch {
      banditAction = null;
    }
  }

  const baseline = memoryAction ?? banditAction ?? 'help';
  const result = await policy.choose({
    workspaceId,
    subject: `order:${orderId}`,
    decisionType: 'cart_recovery',
    context: {
      age_minutes: ageMinutes,
      channel: 'email',
      price_band: priceBand,
      product: productName,
    },
    options: actions.map((action) => ({
      action,
      predicate: 'P(payment|cart_recovery_action,channel,price_band)',
      context: { action, channel: 'email', price_band: priceBand },
    })),
    baseline,
    outcomeKey: `cart_recovery:${workspaceId}:${orderId}:${Date.now()}`,
    utilitySuccess: 1,
    utilityFail: -0.1,
  });

  return {
    action: result.chosen,
    ...(banditAction ? { banditAction } : {}),
    confidence: decisionConfidence(result),
    fallback: result.decision.fallbackActive,
    ...(memoryAction ? { memoryAction } : {}),
    reasonInternal: result.decision.reasonInternal,
  };
}
