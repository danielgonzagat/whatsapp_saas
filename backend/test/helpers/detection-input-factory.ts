/**
 * Canonical detection input factory for spec tests.
 *
 * Audit A4 (2026-05-21) found 12 byte-identical `baseInput` declarations
 * across postsale-consumers*.spec.ts (11 files) and channel/channel.spec.ts
 * (1 file).
 *
 * Usage:
 * ```ts
 * import { baseInput } from '../../test/helpers/detection-input-factory';
 * const result = baseInput(events, 'ws_001');
 * ```
 *
 * The function is generic to support two structurally identical `DetectionInput`
 * types (postsale-consumers.types.ts:224 and channel/types.ts:133).
 */

import type { SpineEventRef } from '../../src/kloel/mind/mind.types';

/**
 * Creates a DetectionInput from the given events, workspaceId and optional
 * nowMs. Uses `Date.now()` when nowMs is omitted.
 */
export function baseInput<
  T extends { events: SpineEventRef[]; workspaceId: string; nowMs?: number },
>(events: SpineEventRef[], workspaceId: string, nowMs?: number): T {
  return { events, workspaceId, nowMs: nowMs ?? Date.now() } as T;
}
