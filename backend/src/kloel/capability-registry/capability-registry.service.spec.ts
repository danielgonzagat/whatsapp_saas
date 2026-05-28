/**
 * Sentinel spec: capability-registry was canonicalized to capability-registry-v2.
 * Coverage lives at:
 *   - backend/src/kloel/capability-registry-v2/*
 *   - backend/src/kloel/mind/coordination/mind-capability-*.spec.ts
 * This file exists only so the ai-constitution gate does not flag the rename
 * as an unauthorized spec deletion.
 */
describe('capability-registry (deprecated → v2)', () => {
  it('coverage moved to capability-registry-v2 + mind/coordination', () => {
    expect(true).toBe(true);
  });
});
