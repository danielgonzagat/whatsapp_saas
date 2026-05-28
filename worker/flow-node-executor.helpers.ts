/**
 * Pure helpers extracted from worker/flow-node-executor.ts.
 *
 * Every function in this file is side-effect-free: zero Prisma, zero Redis,
 * zero CRM, zero logger, zero `process.env` reads. The original dispatcher
 * keeps its I/O surface; these utilities exist to make the deterministic
 * logic (template interpolation, condition operator semantics, emotion
 * keyword classification, switch-case matching, wait-node keyword parsing)
 * unit-testable in isolation and to keep the dispatcher focused on
 * orchestration.
 *
 * No behavioural change vs the prior inline implementations.
 */

import { varAsString } from './flow-engine.helpers';
import type { FlowVariables } from './flow-engine.types';

/** Mustache-style variable pattern shared with the original dispatcher. */
export const FLOW_TEMPLATE_PATTERN = /\{\{(.*?)\}\}/g;

/**
 * Replace every `{{key}}` token in `template` with the matching value from
 * `variables`, coercing each value via `varAsString`. Keys are trimmed.
 * Unknown keys resolve to the empty string (mirrors the original behaviour).
 */
export const renderTemplate = (template: string, variables: FlowVariables): string =>
  template.replace(FLOW_TEMPLATE_PATTERN, (_, key) => {
    const trimmed = String(key).trim();
    return varAsString(variables[trimmed]);
  });

/** Operators recognised by `conditionNode` in the flow dispatcher. */
export type ConditionOperator = '==' | '!=' | '>' | '<' | 'contains';

/**
 * Pure evaluator for the legacy `conditionNode` operator set. Any operator
 * outside the canonical list falls back to `==` semantics, matching the
 * historical `default` branch.
 */
export const evaluateConditionOperator = (
  operator: string,
  actualValue: unknown,
  expectedValue: unknown,
): boolean => {
  switch (operator) {
    case '==':
      return String(actualValue) === String(expectedValue);
    case '!=':
      return String(actualValue) !== String(expectedValue);
    case '>':
      return Number(actualValue) > Number(expectedValue);
    case '<':
      return Number(actualValue) < Number(expectedValue);
    case 'contains':
      return String(actualValue || '').includes(String(expectedValue));
    default:
      return String(actualValue) === String(expectedValue);
  }
};

/** Canonical emotion labels emitted by `emotionNode`. */
export type EmotionLabel = 'neutral' | 'angry' | 'confused' | 'anxious' | 'happy' | 'buying';

interface EmotionRule {
  emotion: EmotionLabel;
  keywords: readonly string[];
}

const EMOTION_RULES: readonly EmotionRule[] = [
  {
    emotion: 'angry',
    keywords: [
      'raiva',
      'irrit',
      'p*to',
      'p...to',
      'odio',
      'odiei',
      'horrivel',
      'péssimo',
      'pessimo',
    ],
  },
  {
    emotion: 'confused',
    keywords: ['não entendi', 'nao entendi', 'confuso', 'confusão', 'como assim', '??'],
  },
  {
    emotion: 'anxious',
    keywords: ['ansioso', 'ansiosa', 'preocup', 'urgente', 'agora', 'imediato'],
  },
  {
    emotion: 'happy',
    keywords: ['ótimo', 'otimo', 'perfeito', 'gostei', 'massa', 'legal', 'show'],
  },
  {
    emotion: 'buying',
    keywords: ['comprar', 'quanto custa', 'fechar', 'preço', 'preco', 'quero', 'vamos fechar'],
  },
];

/**
 * Classify a free-form message into an `EmotionLabel` using the same
 * keyword priority list that the dispatcher applies. The match is
 * case-insensitive and order-sensitive: the first rule whose keyword set
 * intersects the message wins, mirroring the cascading `if/else if` in
 * the original `emotionNode` branch.
 */
export const classifyEmotionFromMessage = (message: string): EmotionLabel => {
  const normalized = message.toLowerCase();
  for (const rule of EMOTION_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.emotion;
    }
  }
  return 'neutral';
};

/**
 * Resolve which node the `emotionNode` should jump to given the classified
 * emotion, the optional map declared on the node (`data.map`), and the
 * standard fallbacks (`node.next` ?? `'END'`).
 */
export const resolveEmotionTarget = (
  emotion: EmotionLabel,
  emotionMap: Record<string, unknown> | undefined,
  fallbackNext: string | null | undefined,
): string => {
  const mapped = emotionMap?.[emotion];
  if (typeof mapped === 'string' && mapped.length > 0) {
    return mapped;
  }
  return fallbackNext || 'END';
};

/** A validated switch case as the dispatcher consumes it. */
export interface SwitchCase {
  value: unknown;
  target: string;
}

/**
 * Filter a raw `data.cases` array into a typed `SwitchCase[]`, discarding
 * entries that are nullish, non-objects, missing a `target`, or carry a
 * non-string `target`. Mirrors the inline guard in the dispatcher exactly.
 */
export const parseSwitchCases = (raw: unknown): SwitchCase[] => {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (entry): entry is SwitchCase =>
      !!entry &&
      typeof entry === 'object' &&
      'target' in entry &&
      typeof (entry as { target: unknown }).target === 'string',
  );
};

/**
 * Resolve the `switch` node's next target. Compares each case via
 * `String(value)` equality (preserving the loose string-coerced match the
 * dispatcher has always used), then falls back to `defaultCase`,
 * `fallbackNext`, and finally `'END'`.
 */
export const findSwitchTarget = (
  cases: SwitchCase[],
  value: unknown,
  defaultCase: string,
  fallbackNext: string | null | undefined,
): string => {
  const stringValue = String(value);
  const match = cases.find((entry) => String(entry.value) === stringValue);
  if (match) {
    return match.target;
  }
  return defaultCase || fallbackNext || 'END';
};

/**
 * Split a comma-separated keyword list into trimmed, lowercased, non-empty
 * keywords. Used by `waitNode` to interpret `data.expectedKeywords`.
 */
export const parseKeywordsList = (raw: string): string[] =>
  raw
    .split(',')
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(Boolean);

/**
 * Return `true` when the message satisfies the `waitNode` keyword
 * expectation. An empty keyword list matches by definition, otherwise at
 * least one keyword must appear (case-insensitive) inside the message.
 */
export const matchWaitNodeKeywords = (message: string, keywords: readonly string[]): boolean => {
  if (keywords.length === 0) {
    return true;
  }
  const lowered = message.toLowerCase();
  return keywords.some((keyword) => lowered.includes(keyword));
};
