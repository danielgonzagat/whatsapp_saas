/**
 * Canonical SpineEvent factory for unit tests.
 *
 * Audit A4 (2026-05-21) found 28 spec files declaring local `makeEvent`
 * helpers with 4 variant shapes (Variant A: `let seq = 0` module-scope;
 * Variant B: `makeEvent._seq` property; Variant C: domain-specific with
 * hardcoded ws_001; Variant D: `Date` argument). Variants A and B are
 * byte-identical in body — 18 files total.
 *
 * The factory pattern preserves per-spec-file isolation (no cross-worker
 * leakage under parallel Jest) while removing the per-file boilerplate.
 *
 * Usage:
 * ```ts
 * import { makeEventFactory } from '../../test/helpers/spine-event-factory';
 *
 * describe('MyService', () => {
 *   const makeEvent = makeEventFactory();
 *
 *   it('emits commerce.lead.created', () => {
 *     const event = makeEvent('commerce.lead.created', 'ws_001', '2026-05-21T00:00:00Z');
 *     ...
 *   });
 * });
 * ```
 *
 * For Variant A specs that pass `occurredAtMs: number`, wrap with
 * `new Date(ms).toISOString()` at call site.
 *
 * Variant C (drift files) and Variant D (wisdom-pattern-extractor) have
 * domain-specific signatures and should KEEP their local helpers.
 */

import type { SpineEventRef } from '../../src/kloel/mind/mind.types';

export type MakeEvent = (
  eventName: string,
  workspaceId: string,
  occurredAt: string,
  overrides?: Partial<SpineEventRef>,
) => SpineEventRef;

/**
 * Returns a fresh closure with isolated sequence counter. Each spec
 * calls this once at the top of `describe()` to get its own makeEvent.
 *
 * `seq` starts at 0 within each closure; consecutive calls produce
 * `evt_00001`, `evt_00002`, etc. — matches the existing 18 spec
 * implementations exactly.
 */
export function makeEventFactory(): MakeEvent {
  let seq = 0;
  return function makeEvent(
    eventName: string,
    workspaceId: string,
    occurredAt: string,
    overrides: Partial<SpineEventRef> = {},
  ): SpineEventRef {
    seq++;
    return {
      eventId: `evt_${String(seq).padStart(5, '0')}`,
      eventName,
      workspaceId,
      occurredAt,
      truthMode: 'observed',
      ...overrides,
    };
  };
}

/**
 * Variant of {@link makeEventFactory} that accepts `occurredAtMs: number`
 * instead of an ISO string. Use for specs that previously had
 * `function makeEvent(name, ws, occurredAtMs: number, overrides)`.
 */
export function makeEventFactoryMs(): (
  eventName: string,
  workspaceId: string,
  occurredAtMs: number,
  overrides?: Partial<SpineEventRef>,
) => SpineEventRef {
  let seq = 0;
  return function makeEvent(
    eventName: string,
    workspaceId: string,
    occurredAtMs: number,
    overrides: Partial<SpineEventRef> = {},
  ): SpineEventRef {
    seq++;
    return {
      eventId: `evt_${String(seq).padStart(5, '0')}`,
      eventName,
      workspaceId,
      occurredAt: new Date(occurredAtMs).toISOString(),
      truthMode: 'observed',
      ...overrides,
    };
  };
}
