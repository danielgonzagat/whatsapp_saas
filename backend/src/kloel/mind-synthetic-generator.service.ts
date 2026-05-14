import { Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import type { MindActionContext } from './mind-code-native.types';
import type { ReplayInput, ReplayCandidate, ReplayScenarioInput } from './mind-replay.service';

export interface SyntheticCandidateRecipe {
  action: string;
  meanRange: [number, number];
  varianceRange: [number, number];
}

export interface SyntheticDecisionRecipe {
  decisionType: string;
  candidates: SyntheticCandidateRecipe[];
  baseline?: string;
  epsilon?: number;
  utilitySuccess?: number;
  utilityFail?: number;
}

export interface SyntheticScenarioRecipe {
  workspaceId: string;
  decisions: SyntheticDecisionRecipe[];
  seed: number;
}

function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lerp(min: number, max: number, t: number): number {
  return min + t * (max - min);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const BUILTIN_RECIPES: Record<string, SyntheticDecisionRecipe> = {
  followup_timing: {
    decisionType: 'followup_timing',
    candidates: [
      { action: '5m', meanRange: [0.2, 0.4], varianceRange: [0.1, 0.4] },
      { action: '30m', meanRange: [0.5, 0.8], varianceRange: [0.05, 0.2] },
      { action: '2h', meanRange: [0.3, 0.6], varianceRange: [0.1, 0.3] },
      { action: '8h', meanRange: [0.25, 0.55], varianceRange: [0.1, 0.35] },
      { action: 'next_morning', meanRange: [0.35, 0.7], varianceRange: [0.08, 0.25] },
      { action: 'stop', meanRange: [0.05, 0.25], varianceRange: [0.12, 0.4] },
    ],
    baseline: '30m',
  },
  cart_recovery: {
    decisionType: 'cart_recovery',
    candidates: [
      { action: 'proof', meanRange: [0.3, 0.5], varianceRange: [0.1, 0.4] },
      { action: 'urgency', meanRange: [0.25, 0.55], varianceRange: [0.1, 0.35] },
      { action: 'discount', meanRange: [0.5, 0.9], varianceRange: [0.05, 0.2] },
      { action: 'help', meanRange: [0.2, 0.4], varianceRange: [0.15, 0.5] },
      { action: 'faq', meanRange: [0.2, 0.45], varianceRange: [0.12, 0.4] },
      { action: 'pause', meanRange: [0.05, 0.3], varianceRange: [0.12, 0.45] },
    ],
    baseline: 'discount',
  },
  coupon_offer: {
    decisionType: 'coupon_offer',
    candidates: [
      { action: 'coupon_5', meanRange: [0.3, 0.6], varianceRange: [0.1, 0.3] },
      { action: 'coupon_10', meanRange: [0.4, 0.8], varianceRange: [0.05, 0.25] },
      { action: 'coupon_15', meanRange: [0.45, 0.85], varianceRange: [0.05, 0.2] },
      { action: 'coupon_20', meanRange: [0.5, 0.9], varianceRange: [0.02, 0.15] },
      { action: 'human_negotiate', meanRange: [0.35, 0.7], varianceRange: [0.1, 0.3] },
      { action: 'no_coupon', meanRange: [0.6, 1.0], varianceRange: [0.01, 0.1] },
    ],
    baseline: 'no_coupon',
  },
  human_transfer: {
    decisionType: 'human_transfer',
    candidates: [
      { action: 'continue_ai', meanRange: [0.4, 0.7], varianceRange: [0.05, 0.3] },
      { action: 'transfer_now', meanRange: [0.1, 0.3], varianceRange: [0.1, 0.5] },
      { action: 'transfer_after_next_reply', meanRange: [0.25, 0.55], varianceRange: [0.1, 0.35] },
      { action: 'pause_wait', meanRange: [0.2, 0.45], varianceRange: [0.12, 0.4] },
    ],
    baseline: 'continue_ai',
  },
  channel_choice: {
    decisionType: 'channel_choice',
    candidates: [
      { action: 'whatsapp', meanRange: [0.6, 0.9], varianceRange: [0.02, 0.15] },
      { action: 'instagram', meanRange: [0.35, 0.65], varianceRange: [0.08, 0.25] },
      { action: 'messenger', meanRange: [0.25, 0.55], varianceRange: [0.1, 0.3] },
      { action: 'tiktok', meanRange: [0.1, 0.35], varianceRange: [0.12, 0.4] },
      { action: 'email', meanRange: [0.3, 0.6], varianceRange: [0.1, 0.3] },
      { action: 'sms', meanRange: [0.1, 0.3], varianceRange: [0.1, 0.4] },
    ],
    baseline: 'whatsapp',
  },
  message_format: {
    decisionType: 'message_format',
    candidates: [
      { action: 'text', meanRange: [0.45, 0.75], varianceRange: [0.05, 0.2] },
      { action: 'audio', meanRange: [0.25, 0.65], varianceRange: [0.1, 0.35] },
      { action: 'image', meanRange: [0.2, 0.55], varianceRange: [0.1, 0.35] },
      { action: 'video', meanRange: [0.15, 0.5], varianceRange: [0.12, 0.4] },
      { action: 'template', meanRange: [0.35, 0.7], varianceRange: [0.08, 0.25] },
      { action: 'html_rich', meanRange: [0.25, 0.6], varianceRange: [0.1, 0.3] },
    ],
    baseline: 'text',
  },
  objection_response: {
    decisionType: 'objection_response',
    candidates: [
      { action: 'value_focus', meanRange: [0.35, 0.7], varianceRange: [0.08, 0.25] },
      { action: 'social_proof', meanRange: [0.3, 0.75], varianceRange: [0.08, 0.3] },
      { action: 'guarantee', meanRange: [0.25, 0.65], varianceRange: [0.1, 0.35] },
      { action: 'direct_comparison', meanRange: [0.2, 0.55], varianceRange: [0.12, 0.4] },
      { action: 'diagnostic_question', meanRange: [0.3, 0.68], varianceRange: [0.08, 0.28] },
      { action: 'human_transfer', meanRange: [0.15, 0.5], varianceRange: [0.12, 0.45] },
    ],
    baseline: 'value_focus',
  },
  product_offer: {
    decisionType: 'product_offer',
    candidates: [
      { action: 'top_seller', meanRange: [0.4, 0.75], varianceRange: [0.05, 0.22] },
      { action: 'highest_margin', meanRange: [0.25, 0.65], varianceRange: [0.1, 0.3] },
      { action: 'entry_product', meanRange: [0.35, 0.7], varianceRange: [0.08, 0.28] },
      { action: 'premium_product', meanRange: [0.2, 0.6], varianceRange: [0.12, 0.35] },
      { action: 'upsell', meanRange: [0.22, 0.62], varianceRange: [0.1, 0.34] },
    ],
    baseline: 'top_seller',
  },
  broadcast_window: {
    decisionType: 'broadcast_window',
    candidates: [
      { action: 'now', meanRange: [0.25, 0.55], varianceRange: [0.12, 0.4] },
      { action: 'tonight_20h', meanRange: [0.35, 0.75], varianceRange: [0.08, 0.25] },
      { action: 'tomorrow_9h', meanRange: [0.4, 0.8], varianceRange: [0.05, 0.22] },
      { action: 'friday_21h', meanRange: [0.2, 0.6], varianceRange: [0.12, 0.35] },
      { action: 'pause', meanRange: [0.1, 0.45], varianceRange: [0.12, 0.4] },
    ],
    baseline: 'tomorrow_9h',
  },
  ad_alert_action: {
    decisionType: 'ad_alert_action',
    candidates: [
      { action: 'alert_only', meanRange: [0.35, 0.7], varianceRange: [0.08, 0.25] },
      { action: 'suggest_pause', meanRange: [0.25, 0.65], varianceRange: [0.1, 0.35] },
      { action: 'suggest_budget_down', meanRange: [0.25, 0.62], varianceRange: [0.1, 0.35] },
      { action: 'suggest_creative', meanRange: [0.3, 0.7], varianceRange: [0.08, 0.28] },
      { action: 'ignore', meanRange: [0.1, 0.45], varianceRange: [0.12, 0.4] },
    ],
    baseline: 'alert_only',
  },
  autopilot_action: {
    decisionType: 'autopilot_action',
    candidates: [
      { action: 'send_offer', meanRange: [0.35, 0.72], varianceRange: [0.08, 0.28] },
      { action: 'send_offer_soft', meanRange: [0.32, 0.68], varianceRange: [0.08, 0.3] },
      { action: 'send_price', meanRange: [0.25, 0.62], varianceRange: [0.1, 0.35] },
      { action: 'send_calendar', meanRange: [0.2, 0.58], varianceRange: [0.12, 0.38] },
      { action: 'handover_human', meanRange: [0.18, 0.56], varianceRange: [0.12, 0.4] },
      { action: 'handle_objection', meanRange: [0.3, 0.7], varianceRange: [0.08, 0.3] },
      { action: 'qualify', meanRange: [0.28, 0.66], varianceRange: [0.09, 0.32] },
      { action: 'try_upsell', meanRange: [0.2, 0.55], varianceRange: [0.12, 0.4] },
      { action: 'send_cta', meanRange: [0.36, 0.74], varianceRange: [0.07, 0.25] },
      { action: 'soft_close_night', meanRange: [0.24, 0.6], varianceRange: [0.1, 0.35] },
      { action: 'auto_reply_night', meanRange: [0.18, 0.52], varianceRange: [0.12, 0.42] },
      { action: 'ai_chat', meanRange: [0.3, 0.68], varianceRange: [0.08, 0.32] },
    ],
    baseline: 'legacy_autopilot_action',
  },
};

@Injectable()
export class MindSyntheticGeneratorService {
  private readonly logger = StructuredLogger.from(MindSyntheticGeneratorService.name);


  private _seed: number;

  constructor(@Optional() seed?: number) {
    this.logger.debug?.(`MindSyntheticGeneratorService initialized`);
    this._seed = seed ?? 42;
  }

  setSeed(seed: number): void {
    this._seed = seed;
  }

  generateCandidates(recipe: SyntheticDecisionRecipe, seedOffset: number): ReplayCandidate[] {
    const rng = mulberry32(this._seed + seedOffset);
    return recipe.candidates.map((candidate) => {
      const meanT = rng();
      const varianceT = rng();
      return {
        action: candidate.action,
        beliefMean: clamp(lerp(candidate.meanRange[0], candidate.meanRange[1], meanT), 0, 1),
        beliefVariance: clamp(
          lerp(candidate.varianceRange[0], candidate.varianceRange[1], varianceT),
          0,
          1,
        ),
      };
    });
  }

  generateDecision(recipe: SyntheticDecisionRecipe, seedOffset: number): ReplayInput {
    const candidates = this.generateCandidates(recipe, seedOffset);
    return {
      workspaceId: '',
      decisionType: recipe.decisionType,
      candidates,
      ...(recipe.baseline !== undefined ? { baseline: recipe.baseline } : { baseline: '' }),
      epsilon: recipe.epsilon ?? 0.5,
      utilitySuccess: recipe.utilitySuccess ?? 1,
      utilityFail: recipe.utilityFail ?? -0.2,
    };
  }

  generateScenario(workspaceId: string, seed?: number): ReplayScenarioInput {
    const effectiveSeed = seed ?? this._seed;
    const rng = mulberry32(effectiveSeed);
    const recipeKeys = Object.keys(BUILTIN_RECIPES);
    const decisionCount = 2 + Math.floor(rng() * (recipeKeys.length - 1));

    const shuffled = [...recipeKeys].sort(() => rng() - 0.5).slice(0, decisionCount);

    const decisions = shuffled.map((key, index) => {
      const recipe = BUILTIN_RECIPES[key]!;
      return this.generateDecision(recipe, effectiveSeed + index * 100);
    });

    return { workspaceId, decisions };
  }

  generateScenarios(workspaceId: string, count: number, seed?: number): ReplayScenarioInput[] {
    const effectiveSeed = seed ?? this._seed;
    const scenarios: ReplayScenarioInput[] = [];
    for (let i = 0; i < count; i += 1) {
      scenarios.push(this.generateScenario(workspaceId, effectiveSeed + i * 1000));
    }
    return scenarios;
  }

  generateActionContexts(
    actions: string[],
    seedOffset: number,
    options?: { injectViolations?: boolean },
  ): Array<{ action: string; context: MindActionContext }> {
    const rng = mulberry32(this._seed + seedOffset);
    const injectViolations = options?.injectViolations ?? true;
    return actions.map((action) => {
      const willFailAudio = injectViolations && action.includes('audio') && rng() < 0.3;
      const willFailDocument = injectViolations && action.includes('document') && rng() < 0.3;
      const hasOptOut = injectViolations && rng() < 0.1;
      return {
        action,
        context: {
          supportsAudio: !willFailAudio,
          supportsDocument: !willFailDocument,
          contactOptOut: hasOptOut,
        },
      };
    });
  }

  static builtinRecipes(): Record<string, SyntheticDecisionRecipe> {
    return { ...BUILTIN_RECIPES };
  }
}
