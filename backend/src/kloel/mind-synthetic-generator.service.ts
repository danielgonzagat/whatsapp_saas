import { Injectable } from '@nestjs/common';
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
    ],
    baseline: '30m',
  },
  cart_recovery: {
    decisionType: 'cart_recovery',
    candidates: [
      { action: 'proof', meanRange: [0.3, 0.5], varianceRange: [0.1, 0.4] },
      { action: 'discount', meanRange: [0.5, 0.9], varianceRange: [0.05, 0.2] },
      { action: 'help', meanRange: [0.2, 0.4], varianceRange: [0.15, 0.5] },
    ],
    baseline: 'discount',
  },
  coupon_offer: {
    decisionType: 'coupon_offer',
    candidates: [
      { action: 'coupon_05', meanRange: [0.3, 0.6], varianceRange: [0.1, 0.3] },
      { action: 'coupon_10', meanRange: [0.4, 0.8], varianceRange: [0.05, 0.25] },
      { action: 'coupon_20', meanRange: [0.5, 0.9], varianceRange: [0.02, 0.15] },
      { action: 'no_coupon', meanRange: [0.6, 1.0], varianceRange: [0.01, 0.1] },
    ],
    baseline: 'no_coupon',
  },
  human_transfer: {
    decisionType: 'human_transfer',
    candidates: [
      { action: 'transfer_now', meanRange: [0.1, 0.3], varianceRange: [0.1, 0.5] },
      { action: 'retry_ai', meanRange: [0.4, 0.7], varianceRange: [0.05, 0.3] },
    ],
    baseline: 'retry_ai',
  },
  channel_choice: {
    decisionType: 'channel_choice',
    candidates: [
      { action: 'whatsapp', meanRange: [0.6, 0.9], varianceRange: [0.02, 0.15] },
      { action: 'email', meanRange: [0.3, 0.6], varianceRange: [0.1, 0.3] },
      { action: 'sms', meanRange: [0.1, 0.3], varianceRange: [0.1, 0.4] },
    ],
    baseline: 'whatsapp',
  },
};

@Injectable()
export class MindSyntheticGeneratorService {
  private _seed: number;

  constructor(seed = 42) {
    this._seed = seed;
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
      baseline: recipe.baseline,
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
      const recipe = BUILTIN_RECIPES[key];
      return this.generateDecision(recipe, effectiveSeed + index * 100);
    });

    return { workspaceId, decisions };
  }

  generateScenarios(workspaceId: string, count: number, seed?: number): ReplayScenarioInput[] {
    const effectiveSeed = seed ?? this._seed;
    const scenarios: ReplayScenarioInput[] = [];
    for (let i = 0; i < count; i++) {
      scenarios.push(this.generateScenario(workspaceId, effectiveSeed + i * 1000));
    }
    return scenarios;
  }

  generateActionContexts(
    actions: string[],
    seedOffset: number,
  ): Array<{ action: string; context: MindActionContext }> {
    const rng = mulberry32(this._seed + seedOffset);
    return actions.map((action) => {
      const willFailAudio = action.includes('audio') && rng() < 0.3;
      const willFailDocument = action.includes('document') && rng() < 0.3;
      const hasOptOut = rng() < 0.1;
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
