import type { CognitiveActionType, CustomerCognitiveState } from './cognitive-state';

export type ConversationTacticType =
  | 'EMPATHETIC_ECHO'
  | 'PAIN_PROBING'
  | 'EPIPHANY_DROP'
  | 'STORYTELLING_HOOK'
  | 'QUALIFY_PRIORITY'
  | 'QUALIFY_NEED'
  | 'PRICE_VALUE_REFRAME'
  | 'TRUST_REASSURANCE'
  | 'SOCIAL_PROOF'
  | 'DIRECT_OFFER_CLOSE'
  | 'CHECKOUT_SIMPLIFICATION'
  | 'PAYMENT_RESOLUTION'
  | 'FOLLOWUP_NUDGE'
  | 'SAFE_URGENCY';

export interface ConversationTacticCandidate {
  tactic: ConversationTacticType;
  utility: number;
  rank: number;
  utilityGapToBest: number;
  betterTacticCount: number;
  executable: boolean;
  blockedByRule?: string | null;
  reason: string;
}

export interface ConversationTacticPlan {
  action: CognitiveActionType | string;
  selectedTactic: ConversationTacticType | null;
  selectedTacticUtility: number | null;
  selectedTacticRank: number | null;
  betterTacticCount: number;
  nextBestTactic: ConversationTacticType | null;
  nextBestTacticUtility: number | null;
  executableCount: number;
  blockedCount: number;
  silentCount: number;
  exhaustive: boolean;
  candidates: ConversationTacticCandidate[];
}

function candidate(
  tactic: ConversationTacticType,
  utility: number,
  reason: string,
  executable = true,
  blockedByRule?: string | null,
): ConversationTacticCandidate {
  return {
    tactic,
    utility: Number(utility.toFixed(3)),
    rank: 0,
    utilityGapToBest: 0,
    betterTacticCount: 0,
    executable,
    blockedByRule: blockedByRule || null,
    reason,
  };
}

function sortByUtility(candidates: ConversationTacticCandidate[]) {
  return [...candidates].sort((left, right) => right.utility - left.utility);
}

export function buildConversationTacticPlan(input: {
  action: CognitiveActionType | string;
  state?: CustomerCognitiveState | null;
}): ConversationTacticPlan {
  const state = input.state || null;
  const trust = Number(state?.trustScore || 0.45);
  const urgency = Number(state?.urgencyScore || 0.35);
  const priceSensitivity = Number(state?.priceSensitivity || 0.15);
  const hasPriceObjection = Boolean(state?.objections?.includes('price'));
  const hasTrustObjection = Boolean(state?.objections?.includes('trust'));

  const candidates: ConversationTacticCandidate[] = [];

  switch (input.action) {
    case 'WAIT':
    case 'ESCALATE_HUMAN':
      break;
    case 'ASK_CLARIFYING':
      candidates.push(
        candidate(
          'EMPATHETIC_ECHO',
          0.86 +
            (state?.emotionalTone === 'frustrated' || state?.emotionalTone === 'anxious'
              ? 0.08
              : 0),
          'validate_before_clarifying',
        ),
        candidate(
          'PAIN_PROBING',
          0.84 + (Number(state?.disclosureLevel || 0) > 0.45 ? 0.06 : 0),
          'expand_pain_context',
        ),
        candidate('QUALIFY_PRIORITY', 0.82 + urgency * 0.1, 'clarify_priority'),
        candidate('QUALIFY_NEED', 0.78 + trust * 0.08, 'understand_need'),
      );
      break;
    case 'SOCIAL_PROOF':
      candidates.push(
        candidate('SOCIAL_PROOF', 0.9 + (hasTrustObjection ? 0.08 : 0), 'reduce_trust_friction'),
        candidate('TRUST_REASSURANCE', 0.8 + trust * 0.05, 'reassure_with_clarity'),
      );
      break;
    case 'OFFER':
      candidates.push(
        candidate('DIRECT_OFFER_CLOSE', 0.92 + urgency * 0.1, 'move_to_offer'),
        candidate('CHECKOUT_SIMPLIFICATION', 0.85 + trust * 0.08, 'lower_checkout_friction'),
        candidate('PRICE_VALUE_REFRAME', 0.76 + (hasPriceObjection ? 0.1 : 0), 'anchor_on_value'),
      );
      break;
    case 'PAYMENT_RECOVERY':
      candidates.push(
        candidate('PAYMENT_RESOLUTION', 0.95 + urgency * 0.08, 'recover_payment'),
        candidate('CHECKOUT_SIMPLIFICATION', 0.84 + trust * 0.06, 'simplify_payment_step'),
      );
      break;
    case 'FOLLOWUP_URGENT':
      candidates.push(
        candidate('SAFE_URGENCY', 0.88 + urgency * 0.12, 'use_time_relevance'),
        candidate('FOLLOWUP_NUDGE', 0.76 + trust * 0.05, 'nudge_with_context'),
      );
      break;
    case 'FOLLOWUP_SOFT':
      candidates.push(
        candidate('FOLLOWUP_NUDGE', 0.82 + trust * 0.08, 'reopen_conversation'),
        candidate('CHECKOUT_SIMPLIFICATION', 0.7 + urgency * 0.04, 'reduce_decision_friction'),
      );
      break;
    default:
      candidates.push(
        candidate(
          'EMPATHETIC_ECHO',
          0.83 +
            (state?.emotionalTone === 'frustrated' ||
            state?.emotionalTone === 'anxious' ||
            state?.emotionalTone === 'confused'
              ? 0.1
              : 0),
          'human_validation',
        ),
        candidate(
          'EPIPHANY_DROP',
          0.8 + (state?.trustScore && state.trustScore < 0.62 ? 0.05 : 0),
          'add_new_value',
        ),
        candidate(
          'STORYTELLING_HOOK',
          0.76 + (state?.disclosureLevel && state.disclosureLevel > 0.45 ? 0.06 : 0),
          'micro_story_connection',
        ),
        candidate(
          'PRICE_VALUE_REFRAME',
          0.8 + (hasPriceObjection ? 0.12 : 0) - priceSensitivity * 0.04,
          'answer_with_value',
        ),
        candidate('TRUST_REASSURANCE', 0.78 + (hasTrustObjection ? 0.1 : 0), 'answer_with_clarity'),
        candidate('CHECKOUT_SIMPLIFICATION', 0.74 + urgency * 0.06, 'show_next_step'),
      );
      break;
  }

  const ordered = sortByUtility(candidates);
  const bestUtility = ordered[0]?.utility || 0;
  const annotated = ordered.map((item, index) => ({
    ...item,
    rank: index + 1,
    utilityGapToBest: Number((bestUtility - item.utility).toFixed(3)),
    betterTacticCount: index,
  }));
  const executable = annotated.filter((item) => item.executable);
  const blocked = annotated.filter((item) => !item.executable);
  const selected = executable[0] || null;
  const nextBest = executable[1] || null;

  return {
    action: input.action,
    selectedTactic: selected?.tactic || null,
    selectedTacticUtility: selected?.utility || null,
    selectedTacticRank: selected?.rank || null,
    betterTacticCount: selected?.betterTacticCount || 0,
    nextBestTactic: nextBest?.tactic || null,
    nextBestTacticUtility: nextBest?.utility || null,
    executableCount: executable.length,
    blockedCount: blocked.length,
    silentCount: Math.max(annotated.length - executable.length - blocked.length, 0),
    exhaustive:
      (input.action === 'WAIT' || input.action === 'ESCALATE_HUMAN'
        ? annotated.length === 0
        : annotated.length > 0) && annotated.length === executable.length + blocked.length,
    candidates: annotated,
  };
}

export function assertConversationTacticPlan(plan: ConversationTacticPlan) {
  if (!plan.exhaustive || plan.silentCount !== 0) {
    throw new Error('conversation_tactic_exhaustion_violation');
  }

  if (plan.action !== 'WAIT' && plan.action !== 'ESCALATE_HUMAN' && plan.executableCount === 0) {
    throw new Error('conversation_tactic_missing_executable');
  }

  if (plan.selectedTactic && !plan.candidates.some((item) => item.tactic === plan.selectedTactic)) {
    throw new Error('conversation_tactic_selected_outside_universe');
  }

  return plan;
}
