// Load helpers and shared types for PlanAIConfigTab

import { TIERS, TONES } from './PlanAIConfig.data';

export type StringSetter = (value: string) => void;
export type NumberSetter = (value: number) => void;
export type BooleanSetter = (value: boolean) => void;
export type StringArraySetter = (value: string[]) => void;
export type RecordStringSetter = (value: Record<string, string>) => void;

export type ObjectionState = { enabled: boolean; response: string };

export interface AIConfigState {
  planId: string;
  genders: string[];
  ages: string[];
  moments: string[];
  knowledge: string;
  buyingPower: string;
  problem: string;
  tier: string;
  whenOffer: string[];
  differentiators: string[];
  scarcity: string;
  objectionStates: Record<string, ObjectionState>;
  socialProof: string[];
  socialProofValues: Record<string, string>;
  guarantee: string[];
  guaranteeValues: Record<string, string>;
  benefits: string[];
  benefitsValues: Record<string, string>;
  urgencyArgs: string[];
  urgencyValues: Record<string, string>;
  upsellEnabled: boolean;
  upsellTargetPlan: string;
  upsellWhen: string[];
  upsellArgument: string;
  downsellEnabled: boolean;
  downsellTargetPlan: string;
  downsellWhen: string[];
  downsellArgument: string;
  tone: string;
  persistence: number;
  messageLimit: number;
  followUpHours: string;
  followUpMax: string;
  hasTechInfo: boolean;
  usageMode: string;
  duration: string;
  contraindications: string[];
  expectedResults: string;
}

export interface AIConfigCompleteness {
  s1Complete: boolean;
  s1Partial: boolean;
  s2Complete: boolean;
  s2Partial: boolean;
  s3Complete: boolean;
  s3Partial: boolean;
  s4Complete: boolean;
  s4Partial: boolean;
  s5Complete: boolean;
  s5Partial: boolean;
  s6Complete: boolean;
  s7Complete: boolean;
  s7Partial: boolean;
  activeObjections: number;
  totalArgs: number;
}

export function assignString(data: Record<string, unknown>, key: string, setter: StringSetter) {
  if (typeof data[key] === 'string') {
    setter(data[key] as string);
  }
}

export function assignNumber(data: Record<string, unknown>, key: string, setter: NumberSetter) {
  if (typeof data[key] === 'number') {
    setter(data[key] as number);
  }
}

export function assignBoolean(data: Record<string, unknown>, key: string, setter: BooleanSetter) {
  if (typeof data[key] === 'boolean') {
    setter(data[key] as boolean);
  }
}

export function assignStringArray(
  data: Record<string, unknown>,
  key: string,
  setter: StringArraySetter,
) {
  if (Array.isArray(data[key])) {
    setter(data[key] as string[]);
  }
}

export function assignRecordString(
  data: Record<string, unknown>,
  key: string,
  setter: RecordStringSetter,
) {
  const value = data[key];
  if (value && typeof value === 'object') {
    setter(value as Record<string, string>);
  }
}

/**
 * Build the AI-config save payload for `PUT /products/:id/ai-config`.
 * Pure — no side effects, no setters.
 */
export function buildAIConfigPayload(state: AIConfigState): Record<string, unknown> {
  return {
    planId: state.planId,
    genders: state.genders,
    ages: state.ages,
    moments: state.moments,
    knowledge: state.knowledge,
    buyingPower: state.buyingPower,
    problem: state.problem,
    tier: state.tier,
    whenOffer: state.whenOffer,
    differentiators: state.differentiators,
    scarcity: state.scarcity,
    objectionStates: state.objectionStates,
    socialProof: state.socialProof,
    socialProofValues: state.socialProofValues,
    guarantee: state.guarantee,
    guaranteeValues: state.guaranteeValues,
    benefits: state.benefits,
    benefitsValues: state.benefitsValues,
    urgencyArgs: state.urgencyArgs,
    urgencyValues: state.urgencyValues,
    upsellEnabled: state.upsellEnabled,
    upsellTargetPlan: state.upsellTargetPlan,
    upsellWhen: state.upsellWhen,
    upsellArgument: state.upsellArgument,
    downsellEnabled: state.downsellEnabled,
    downsellTargetPlan: state.downsellTargetPlan,
    downsellWhen: state.downsellWhen,
    downsellArgument: state.downsellArgument,
    tone: state.tone,
    persistence: state.persistence,
    messageLimit: state.messageLimit,
    followUpHours: state.followUpHours,
    followUpMax: state.followUpMax,
    hasTechInfo: state.hasTechInfo,
    usageMode: state.usageMode,
    duration: state.duration,
    contraindications: state.contraindications,
    expectedResults: state.expectedResults,
  };
}

/** Whether a given SWR key belongs to the products namespace. */
export function isProductsSwrKey(key: unknown): boolean {
  return typeof key === 'string' && key.startsWith('/products');
}

/**
 * Compute section completeness/partial flags for the AI-config summary box.
 * Pure derivation from the current form state — extracted from PlanAIConfigTab.
 */
export function computeAIConfigCompleteness(
  state: Pick<
    AIConfigState,
    | 'genders'
    | 'ages'
    | 'problem'
    | 'tier'
    | 'whenOffer'
    | 'differentiators'
    | 'objectionStates'
    | 'socialProof'
    | 'guarantee'
    | 'benefits'
    | 'urgencyArgs'
    | 'upsellEnabled'
    | 'upsellTargetPlan'
    | 'downsellEnabled'
    | 'downsellTargetPlan'
    | 'tone'
    | 'persistence'
    | 'hasTechInfo'
    | 'usageMode'
    | 'contraindications'
  >,
): AIConfigCompleteness {
  const activeObjections = Object.values(state.objectionStates).filter((o) => o.enabled).length;
  const totalArgs =
    state.socialProof.length +
    state.guarantee.length +
    state.benefits.length +
    state.urgencyArgs.length;
  const s5Complete =
    (state.upsellEnabled && state.upsellTargetPlan !== '') ||
    (state.downsellEnabled && state.downsellTargetPlan !== '') ||
    (!state.upsellEnabled && !state.downsellEnabled);
  return {
    s1Complete: state.genders.length > 0 && state.ages.length > 0 && state.problem !== '',
    s1Partial: state.genders.length > 0 || state.ages.length > 0,
    s2Complete:
      state.tier !== '' && state.whenOffer.length > 0 && state.differentiators.length > 0,
    s2Partial: state.tier !== '' || state.whenOffer.length > 0,
    s3Complete: activeObjections >= 5,
    s3Partial: activeObjections > 0,
    s4Complete:
      state.socialProof.length > 0 && state.guarantee.length > 0 && state.benefits.length > 0,
    s4Partial:
      state.socialProof.length > 0 || state.guarantee.length > 0 || state.benefits.length > 0,
    s5Complete,
    s5Partial: state.upsellEnabled || state.downsellEnabled,
    s6Complete: state.tone !== '' && state.persistence > 0,
    s7Complete: state.hasTechInfo && state.usageMode !== '' && state.contraindications.length > 0,
    s7Partial: state.hasTechInfo,
    activeObjections,
    totalArgs,
  };
}

/**
 * Build the PT-BR summary string shown in the AISummaryBox.
 * Pure — depends only on state values and the TONES/TIERS catalogs.
 */
export function buildAIConfigSummary(input: {
  tone: string;
  persistence: number;
  messageLimit: number;
  activeObjections: number;
  totalArgs: number;
  genders: string[];
  ages: string[];
  tier: string;
}): string {
  const toneLabel = TONES.find((t) => t.v === input.tone)?.l ?? input.tone;
  const tierLabel = input.tier
    ? `Plano ${TIERS.find((t) => t.v === input.tier)?.l ?? input.tier}.`
    : '';
  return (
    `Tom: ${toneLabel}. Insistência: ${input.persistence}/5. Limite: ${input.messageLimit || '∞'} msgs. ` +
    `Objeções ativas: ${input.activeObjections}/10. Argumentos: ${input.totalArgs}. ` +
    `Público: ${input.genders.join('/')} ${input.ages.join(', ')}. ${tierLabel}`
  );
}

/**
 * Toggle item in an array immutably — pure functional version of the
 * `toggleList` closure inside PlanAIConfigTab.
 */
export function toggleListValue(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}
