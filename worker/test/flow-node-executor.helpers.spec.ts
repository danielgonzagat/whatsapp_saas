import { describe, expect, it } from 'vitest';
import {
  classifyEmotionFromMessage,
  evaluateConditionOperator,
  findSwitchTarget,
  FLOW_TEMPLATE_PATTERN,
  matchWaitNodeKeywords,
  parseKeywordsList,
  parseSwitchCases,
  renderTemplate,
  resolveEmotionTarget,
} from '../flow-node-executor.helpers';

describe('FLOW_TEMPLATE_PATTERN', () => {
  it('matches the {{ name }} mustache shape used by the dispatcher', () => {
    const template = 'olá {{ name }} e {{age}}';
    const found = [...template.matchAll(FLOW_TEMPLATE_PATTERN)].map((m) => m[1]);
    expect(found).toEqual([' name ', 'age']);
  });
});

describe('renderTemplate', () => {
  it('substitutes whitespace-trimmed keys with their string values', () => {
    const text = renderTemplate('Oi {{ nome }}, tudo bem?', { nome: 'Daniel' });
    expect(text).toBe('Oi Daniel, tudo bem?');
  });

  it('coerces numbers and booleans through varAsString', () => {
    expect(renderTemplate('{{ a }} / {{ b }}', { a: 42, b: true })).toBe('42 / true');
  });

  it('renders unknown variables as empty string (legacy behaviour)', () => {
    expect(renderTemplate('valor: {{missing}}', {})).toBe('valor: ');
  });

  it('renders multiple occurrences of the same key', () => {
    expect(renderTemplate('{{x}} {{x}} {{x}}', { x: 'go' })).toBe('go go go');
  });

  it('returns the template untouched when no placeholders are present', () => {
    expect(renderTemplate('hello world', { name: 'ignored' })).toBe('hello world');
  });

  it('emits empty for object / null values (fallback path of varAsString)', () => {
    expect(renderTemplate('{{a}}|{{b}}', { a: { complex: true }, b: null })).toBe('|');
  });
});

describe('evaluateConditionOperator', () => {
  it('compares equality through string coercion', () => {
    expect(evaluateConditionOperator('==', 1, '1')).toBe(true);
    expect(evaluateConditionOperator('==', '1', 1)).toBe(true);
    expect(evaluateConditionOperator('==', 'foo', 'bar')).toBe(false);
  });

  it('compares inequality through string coercion', () => {
    expect(evaluateConditionOperator('!=', 1, '2')).toBe(true);
    expect(evaluateConditionOperator('!=', 'x', 'x')).toBe(false);
  });

  it('compares numerically with > and <', () => {
    expect(evaluateConditionOperator('>', '5', '4')).toBe(true);
    expect(evaluateConditionOperator('>', 3, 10)).toBe(false);
    expect(evaluateConditionOperator('<', '5', '4')).toBe(false);
    expect(evaluateConditionOperator('<', 3, 10)).toBe(true);
  });

  it('treats non-numeric strings under > / < as NaN (always false)', () => {
    expect(evaluateConditionOperator('>', 'abc', 1)).toBe(false);
    expect(evaluateConditionOperator('<', 'abc', 1)).toBe(false);
  });

  it('contains uses falsy-OR fallback so 0 / false coerce to empty', () => {
    expect(evaluateConditionOperator('contains', 'hello world', 'world')).toBe(true);
    expect(evaluateConditionOperator('contains', 'hello world', 'bye')).toBe(false);
    // legacy: actualValue || '' → 0 becomes '', which contains '' but not 'foo'
    expect(evaluateConditionOperator('contains', 0, 'foo')).toBe(false);
    expect(evaluateConditionOperator('contains', 0, '')).toBe(true);
    expect(evaluateConditionOperator('contains', null, '')).toBe(true);
  });

  it('falls back to == semantics for unknown operators', () => {
    expect(evaluateConditionOperator('???', 'a', 'a')).toBe(true);
    expect(evaluateConditionOperator('???', 'a', 'b')).toBe(false);
  });
});

describe('classifyEmotionFromMessage', () => {
  it('returns neutral on an empty string', () => {
    expect(classifyEmotionFromMessage('')).toBe('neutral');
  });

  it('classifies angry vocabulary first', () => {
    expect(classifyEmotionFromMessage('Estou com muita raiva disso')).toBe('angry');
    expect(classifyEmotionFromMessage('isso é horrivel')).toBe('angry');
    expect(classifyEmotionFromMessage('Que péssimo atendimento')).toBe('angry');
  });

  it('classifies confused messages', () => {
    expect(classifyEmotionFromMessage('como assim?')).toBe('confused');
    expect(classifyEmotionFromMessage('Nao entendi')).toBe('confused');
    expect(classifyEmotionFromMessage('??')).toBe('confused');
  });

  it('classifies anxious messages', () => {
    expect(classifyEmotionFromMessage('preciso AGORA')).toBe('anxious');
    expect(classifyEmotionFromMessage('estou ansioso por isso')).toBe('anxious');
  });

  it('classifies happy messages', () => {
    expect(classifyEmotionFromMessage('Show de bola!')).toBe('happy');
    expect(classifyEmotionFromMessage('perfeito, gostei muito')).toBe('happy');
  });

  it('classifies buying intent', () => {
    expect(classifyEmotionFromMessage('Quanto custa?')).toBe('buying');
    expect(classifyEmotionFromMessage('Quero comprar isso')).toBe('buying');
    expect(classifyEmotionFromMessage('vamos fechar')).toBe('buying');
  });

  it('lets anxious "agora" win over buying when both keywords appear', () => {
    // anxious rule comes before buying — `agora` (anxious) preempts `fechar` (buying)
    expect(classifyEmotionFromMessage('Vamos fechar agora')).toBe('anxious');
  });

  it('applies the cascading priority — angry beats happy when both appear', () => {
    // contains both "raiva" (angry) and "legal" (happy) — angry wins
    expect(classifyEmotionFromMessage('legal mas estou com raiva')).toBe('angry');
  });

  it('returns neutral when no rule keyword matches', () => {
    expect(classifyEmotionFromMessage('oi tudo bem com voce')).toBe('neutral');
  });
});

describe('resolveEmotionTarget', () => {
  it('returns the mapped node id when emotionMap has a string entry', () => {
    expect(resolveEmotionTarget('angry', { angry: 'node-A', happy: 'node-H' }, 'next-node')).toBe(
      'node-A',
    );
  });

  it('falls back to node.next when no mapping exists', () => {
    expect(resolveEmotionTarget('neutral', { angry: 'node-A' }, 'next-node')).toBe('next-node');
  });

  it('falls back to END when there is no map and no next', () => {
    expect(resolveEmotionTarget('happy', undefined, undefined)).toBe('END');
  });

  it('ignores non-string map entries and walks the fallback chain', () => {
    expect(resolveEmotionTarget('happy', { happy: 42 as unknown as string }, 'fallback')).toBe(
      'fallback',
    );
  });

  it('treats an empty-string mapping as "no match" so we fall through', () => {
    expect(resolveEmotionTarget('angry', { angry: '' }, 'fallback')).toBe('fallback');
  });
});

describe('parseSwitchCases', () => {
  it('returns an empty array for non-array inputs', () => {
    expect(parseSwitchCases(undefined)).toEqual([]);
    expect(parseSwitchCases(null)).toEqual([]);
    expect(parseSwitchCases('not-array')).toEqual([]);
    expect(parseSwitchCases({})).toEqual([]);
  });

  it('keeps only entries with a string "target" field', () => {
    const raw = [
      { value: 'a', target: 'node-a' },
      { value: 'b', target: 42 },
      { value: 'c' },
      null,
      'plain-string',
      { target: 'node-d' },
    ];
    expect(parseSwitchCases(raw)).toEqual([{ value: 'a', target: 'node-a' }, { target: 'node-d' }]);
  });
});

describe('findSwitchTarget', () => {
  const cases = [
    { value: 'yes', target: 'node-yes' },
    { value: 1, target: 'node-one' },
  ];

  it('returns the matching case target', () => {
    expect(findSwitchTarget(cases, 'yes', '', 'next')).toBe('node-yes');
  });

  it('matches via string coercion (numeric vs string)', () => {
    expect(findSwitchTarget(cases, '1', '', 'next')).toBe('node-one');
    expect(findSwitchTarget(cases, 1, '', 'next')).toBe('node-one');
  });

  it('falls back to defaultCase when nothing matches', () => {
    expect(findSwitchTarget(cases, 'unknown', 'default-node', 'next')).toBe('default-node');
  });

  it('falls back to fallbackNext when defaultCase is empty', () => {
    expect(findSwitchTarget(cases, 'unknown', '', 'next-node')).toBe('next-node');
  });

  it('falls back to END when both default and next are missing', () => {
    expect(findSwitchTarget(cases, 'unknown', '', undefined)).toBe('END');
  });

  it('works with an empty case list — never matches, hits fallback', () => {
    expect(findSwitchTarget([], 'anything', '', 'next')).toBe('next');
  });
});

describe('parseKeywordsList', () => {
  it('returns empty when given an empty string', () => {
    expect(parseKeywordsList('')).toEqual([]);
  });

  it('trims, lowercases, and filters blanks', () => {
    expect(parseKeywordsList('  Sim ,  NAO,  , OK')).toEqual(['sim', 'nao', 'ok']);
  });

  it('drops keywords that become empty after trimming', () => {
    expect(parseKeywordsList(' , ,  ')).toEqual([]);
  });
});

describe('matchWaitNodeKeywords', () => {
  it('returns true for an empty keyword list (legacy contract)', () => {
    expect(matchWaitNodeKeywords('whatever', [])).toBe(true);
  });

  it('returns true when at least one keyword appears (case-insensitive)', () => {
    expect(matchWaitNodeKeywords('Quero PAGAR agora', ['pagar', 'comprar'])).toBe(true);
  });

  it('returns false when no keyword appears', () => {
    expect(matchWaitNodeKeywords('texto sem nada relevante', ['pagar', 'comprar'])).toBe(false);
  });

  it('handles substring matches inside compound words', () => {
    expect(matchWaitNodeKeywords('estou ansioso aqui', ['ansios'])).toBe(true);
  });
});
