import {
  GENESIS_EVENT,
} from '../lineage/genesis-event';
import type {
  LineageGuardService,
  LineageGuardVerdict,
} from '../lineage/lineage-guard.service';
import { LineageIntegrityGate } from './lineage-integrity.gate';
import type { GateVerdict } from './pulse-gates.types';

/**
 * Shared helpers for lineage-integrity gate specs — split out so the
 * individual spec files stay below the architecture-guard line budget.
 *
 * mockGuard() fabricates a synthetic LineageGuardVerdict; check() spins up a
 * gate with that mock; assertPass/assertFail centralize the per-verdict
 * expectations so the actual it() blocks read like a checklist.
 */

export function mockGuard(
  overrides: Partial<LineageGuardVerdict> = {},
): LineageGuardService {
  const base: LineageGuardVerdict = {
    status: 'intact',
    entryCount: 1,
    tailSequenceNumber: 1,
    tailHash: GENESIS_EVENT.hash,
    genesisHash: GENESIS_EVENT.hash,
    checkedAt: new Date().toISOString(),
  };
  return {
    verify: () => Promise.resolve({ ...base, ...overrides }),
  } as unknown as LineageGuardService;
}

export function check(
  verdictOverrides: Partial<LineageGuardVerdict>,
  mode?: 'log_only' | 'hard_fail',
): Promise<GateVerdict> {
  return new LineageIntegrityGate(mockGuard(verdictOverrides), mode).check();
}

export async function assertPass(
  v: Promise<GateVerdict>,
  expectedMode = 'hard_fail',
) {
  const verdict = await v;
  expect(verdict.status).toBe('PASS');
  expect(verdict.gateName).toBe('lineage-integrity');
  expect(verdict.mode).toBe(expectedMode);
  expect(verdict.measuredBy).toBe('lineage-integrity.gate');
  expect(verdict.measuredAt).toBeDefined();
  expect(verdict.reason).toBeUndefined();
  expect(verdict.evidence).toBeUndefined();
}

export async function assertFail(
  v: Promise<GateVerdict>,
  reasonPattern: RegExp | string,
  opts: {
    mode?: 'log_only' | 'hard_fail';
    evidenceCount?: number;
  } = {},
) {
  const verdict = await v;
  expect(verdict.status).toBe('FAIL');
  expect(verdict.gateName).toBe('lineage-integrity');
  expect(verdict.mode).toBe(opts.mode ?? 'hard_fail');
  expect(verdict.measuredBy).toBe('lineage-integrity.gate');
  expect(verdict.measuredAt).toBeDefined();
  expect(verdict.reason).toBeDefined();
  if (typeof reasonPattern === 'string') {
    expect(verdict.reason).toBe(reasonPattern);
  } else {
    expect(verdict.reason).toMatch(reasonPattern);
  }
  if (opts.evidenceCount !== undefined) {
    expect(verdict.evidence).toBeDefined();
    expect(verdict.evidence!.length).toBe(opts.evidenceCount);
  }
}
