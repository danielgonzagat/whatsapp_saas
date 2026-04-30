import { describe, expect, it } from 'vitest';

import type { Break } from '../types';
import {
  deriveDynamicFindingIdentity,
  isBlockingDynamicFinding,
  summarizeDynamicFindingEvents,
} from '../finding-identity';

function makeBreak(overrides: Partial<Break> = {}): Break {
  return {
    type: 'behavioral-control-evidence-gap',
    severity: 'high',
    file: 'backend/src/example.controller.ts',
    line: 42,
    description: 'Mutating external input writes durable state without a rate-limit policy.',
    detail: 'Regex signal matched a money-like token near a POST handler.',
    source: 'regex-scanner',
    ...overrides,
  };
}

describe('finding identity', () => {
  it('derives operational names from the event instead of exposing fixed break type names', () => {
    const identity = deriveDynamicFindingIdentity(makeBreak());

    expect(identity.eventName).toBe(
      'Mutating external input writes durable state without a rate-limit policy',
    );
    expect(identity.eventName).not.toContain('behavioral-control-evidence-gap');
    expect(identity.eventKey).toMatch(/^[a-z0-9]+$/);
  });

  it('keeps regex-only detector output as weak signal that cannot block by itself', () => {
    const identity = deriveDynamicFindingIdentity(makeBreak());

    expect(identity.truthMode).toBe('weak_signal');
    expect(identity.actionability).toBe('needs_probe');
    expect(isBlockingDynamicFinding(makeBreak())).toBe(false);
  });

  it('allows confirmed static evidence to block without using fixed type labels in summaries', () => {
    const structuralFinding = makeBreak({
      description: 'External input reaches durable mutation without throttling evidence.',
      detail: 'AST and behavior graph confirmed a public POST route writes persistent state.',
      source: 'behavior-graph',
    });

    expect(isBlockingDynamicFinding(structuralFinding)).toBe(true);
    expect(summarizeDynamicFindingEvents([structuralFinding, structuralFinding])).toEqual([
      'External input reaches durable mutation without throttling evidence (2)',
    ]);
  });
});
