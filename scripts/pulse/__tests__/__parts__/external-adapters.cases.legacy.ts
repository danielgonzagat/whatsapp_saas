import { describe, it, expect } from 'vitest';
import { legacyCycle, evaluateLegacyConvergenceGate } from './external-adapters.helpers';
import type { LegacyConvergenceState } from './external-adapters.helpers';

describe('required adapter not_available blocks certification', () => {
  it('should track missingAdapters when required adapter is not_available', () => {
    const autonomyState: LegacyConvergenceState = {
      history: [
        legacyCycle({
          cycleId: 'cycle-1',
          timestamp: '2026-04-25T00:00:00Z',
          status: 'completed',
          score: 80,
          blockingTier: 2,
          validationCommands: { total: 20, passing: 20 },
          missingAdapters: ['stripe', 'railway_db'],
        }),
      ],
    };

    const result = evaluateLegacyConvergenceGate(autonomyState);

    expect(result.status).toBe('fail');
    expect(result.reason).toContain('missing adapter');
  });

  it('should fail when required adapter status is invalid', () => {
    const autonomyState: LegacyConvergenceState = {
      history: [
        legacyCycle({
          cycleId: 'cycle-1',
          timestamp: '2026-04-25T00:00:00Z',
          status: 'completed',
          score: 80,
          blockingTier: 2,
          validationCommands: { total: 20, passing: 20 },
          adapterStatus: {
            stripe: 'invalid',
            railway_db: 'stale',
          },
        }),
      ],
    };

    const result = evaluateLegacyConvergenceGate(autonomyState);

    expect(result.status).toBe('fail');
  });
});

describe('optional adapter not_available does not block', () => {
  it('should pass when only optional adapters are not_available', () => {
    const autonomyState: LegacyConvergenceState = {
      history: [
        legacyCycle({
          cycleId: 'cycle-1',
          timestamp: '2026-04-25T00:00:00Z',
          status: 'completed',
          score: 75,
          blockingTier: 3,
          validationCommands: { total: 15, passing: 15 },
          optionalAdapters: ['slack_webhook', 'datadog'],
        }),
        legacyCycle({
          cycleId: 'cycle-2',
          timestamp: '2026-04-25T01:00:00Z',
          status: 'completed',
          score: 78,
          blockingTier: 3,
          validationCommands: { total: 15, passing: 15 },
          optionalAdapters: ['slack_webhook', 'datadog'],
        }),
        legacyCycle({
          cycleId: 'cycle-3',
          timestamp: '2026-04-25T02:00:00Z',
          status: 'completed',
          score: 80,
          blockingTier: 2,
          validationCommands: { total: 15, passing: 15 },
          optionalAdapters: ['slack_webhook', 'datadog'],
        }),
      ],
    };

    const result = evaluateLegacyConvergenceGate(autonomyState);

    expect(result.status).toBe('pass');
  });

  it('should pass when optional adapter has optional_not_configured status', () => {
    const autonomyState: LegacyConvergenceState = {
      history: [
        legacyCycle({
          cycleId: 'cycle-1',
          timestamp: '2026-04-25T00:00:00Z',
          status: 'completed',
          score: 80,
          blockingTier: 2,
          validationCommands: { total: 20, passing: 20 },
          adapterStatus: {
            slack: 'optional_not_configured',
            notifications: 'optional_not_configured',
          },
        }),
        legacyCycle({
          cycleId: 'cycle-2',
          timestamp: '2026-04-25T01:00:00Z',
          status: 'completed',
          score: 80,
          blockingTier: 2,
          validationCommands: { total: 20, passing: 20 },
          adapterStatus: {
            slack: 'optional_not_configured',
            notifications: 'optional_not_configured',
          },
        }),
        legacyCycle({
          cycleId: 'cycle-3',
          timestamp: '2026-04-25T02:00:00Z',
          status: 'completed',
          score: 81,
          blockingTier: 2,
          validationCommands: { total: 20, passing: 20 },
          adapterStatus: {
            slack: 'optional_not_configured',
            notifications: 'optional_not_configured',
          },
        }),
      ],
    };

    const result = evaluateLegacyConvergenceGate(autonomyState);

    expect(result.status).toBe('pass');
  });
});

describe('mixed required and optional adapters', () => {
  it('should pass when required adapters are ready and optional adapters are optional_not_configured', () => {
    const autonomyState: LegacyConvergenceState = {
      history: [
        legacyCycle({
          cycleId: 'cycle-1',
          timestamp: '2026-04-25T00:00:00Z',
          status: 'completed',
          score: 85,
          blockingTier: 1,
          validationCommands: { total: 25, passing: 25 },
          adapterStatus: {
            stripe: 'ready',
            railway_db: 'ready',
            slack: 'optional_not_configured',
            datadog: 'optional_not_configured',
          },
        }),
        legacyCycle({
          cycleId: 'cycle-2',
          timestamp: '2026-04-25T01:00:00Z',
          status: 'completed',
          score: 86,
          blockingTier: 1,
          validationCommands: { total: 25, passing: 25 },
          adapterStatus: {
            stripe: 'ready',
            railway_db: 'ready',
            slack: 'optional_not_configured',
            datadog: 'optional_not_configured',
          },
        }),
        legacyCycle({
          cycleId: 'cycle-3',
          timestamp: '2026-04-25T02:00:00Z',
          status: 'completed',
          score: 87,
          blockingTier: 1,
          validationCommands: { total: 25, passing: 25 },
          adapterStatus: {
            stripe: 'ready',
            railway_db: 'ready',
            slack: 'optional_not_configured',
            datadog: 'optional_not_configured',
          },
        }),
      ],
    };

    const result = evaluateLegacyConvergenceGate(autonomyState);

    expect(result.status).toBe('pass');
    expect(result.confidence).toBe('high');
  });

  it('should fail when required adapter is not_available even with optional adapters ready', () => {
    const autonomyState: LegacyConvergenceState = {
      history: [
        legacyCycle({
          cycleId: 'cycle-1',
          timestamp: '2026-04-25T00:00:00Z',
          status: 'completed',
          score: 80,
          blockingTier: 2,
          validationCommands: { total: 20, passing: 20 },
          adapterStatus: {
            stripe: 'not_available',
            slack: 'ready',
            datadog: 'ready',
          },
        }),
        legacyCycle({
          cycleId: 'cycle-2',
          timestamp: '2026-04-25T01:00:00Z',
          status: 'completed',
          score: 80,
          blockingTier: 2,
          validationCommands: { total: 20, passing: 20 },
          adapterStatus: {
            stripe: 'not_available',
            slack: 'ready',
            datadog: 'ready',
          },
        }),
        legacyCycle({
          cycleId: 'cycle-3',
          timestamp: '2026-04-25T02:00:00Z',
          status: 'completed',
          score: 80,
          blockingTier: 2,
          validationCommands: { total: 20, passing: 20 },
          adapterStatus: {
            stripe: 'not_available',
            slack: 'ready',
            datadog: 'ready',
          },
        }),
      ],
    };

    const result = evaluateLegacyConvergenceGate(autonomyState);

    expect(result.status).toBe('fail');
    expect(result.reason).toContain('stripe');
  });
});
