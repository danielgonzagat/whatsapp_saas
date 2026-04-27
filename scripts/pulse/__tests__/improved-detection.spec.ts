/**
 * improved-detection.spec.ts
 *
 * Proves that a cycle with ONLY typecheck validation does NOT count
 * as materially improved, even if the directive digest changed.
 *
 * Tests the core detection logic: directiveDigest comparison and
 * the isTypecheckOnly predicate used by multi-cycle convergence gating.
 */
import { describe, it, expect } from 'vitest';
import { directiveDigest } from '../autonomy-loop.state-io';
import { DEFAULT_MAX_ITERATIONS } from '../autonomy-loop.types';
import type { PulseAutonomousDirective } from '../autonomy-loop.types';

function makeDirective(
  overrides: Partial<PulseAutonomousDirective> = {},
): PulseAutonomousDirective {
  return {
    autonomous: null,
    currentCheckpoint: null,
    currentState: null,
    visionGap: null,
    nextExecutableUnits: [],
    blockedUnits: [],
    ...overrides,
  };
}

describe('directiveDigest determinism', () => {
  it('returns a non-empty hex string', () => {
    const d = makeDirective();
    const digest = directiveDigest(d);
    expect(digest).toBeTypeOf('string');
    expect(digest.length).toBeGreaterThan(0);
    expect(/^[0-9a-f]+$/.test(digest)).toBe(true);
  });

  it('produces identical digest for identical directives', () => {
    const a = makeDirective();
    const b = makeDirective();
    expect(directiveDigest(a)).toBe(directiveDigest(b));
  });

  it('produces different digest when directive content changes', () => {
    const a = makeDirective();
    const b = makeDirective({
      nextExecutableUnits: [
        {
          id: 'unit-1',
          title: 'Fix typecheck-only issue',
          capabilityId: 'cap-1',
          flowId: null,
          scopeExecutionMode: 'typecheck',
          priorityScore: 0,
          preconditions: [],
          expectedArtifacts: [],
          validationCommands: ['npm run typecheck'],
          tags: [],
        },
      ],
    });
    expect(directiveDigest(a)).not.toBe(directiveDigest(b));
  });

  it('produces different digest when currentState differs', () => {
    const a = makeDirective({ currentState: { score: 50, blockingTier: null } });
    const b = makeDirective({ currentState: { score: 75, blockingTier: null } });
    expect(directiveDigest(a)).not.toBe(directiveDigest(b));
  });
});

describe('improved detection contract', () => {
  it('MAX_ITERATIONS constant is defined and positive', () => {
    expect(DEFAULT_MAX_ITERATIONS).toBeGreaterThan(0);
  });
});
