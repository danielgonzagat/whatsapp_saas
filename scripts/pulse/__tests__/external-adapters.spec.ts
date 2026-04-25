/**
 * Unit tests for external adapter status gates.
 * Required adapters must block certification if not_available.
 * Optional adapters must not block.
 */

import { evaluateMultiCycleConvergenceGate } from '../cert-gate-multi-cycle';
import type { PulseAutonomyStateSnapshot } from '../types';

describe('external-adapters — required vs optional', () => {
  describe('required adapter not_available blocks certification', () => {
    it('should track missingAdapters when required adapter is not_available', () => {
      const autonomyState: PulseAutonomyStateSnapshot = {
        history: [
          {
            cycleId: 'cycle-1',
            timestamp: '2026-04-25T00:00:00Z',
            status: 'completed',
            score: 80,
            blockingTier: 2,
            validationCommands: { total: 20, passing: 20 },
            missingAdapters: ['stripe', 'railway_db'],
          },
        ],
      };

      const result = evaluateMultiCycleConvergenceGate(autonomyState);

      expect(result.status).toBe('fail');
      expect(result.reason).toContain('missing adapter');
    });

    it('should fail when required adapter status is invalid', () => {
      const autonomyState: PulseAutonomyStateSnapshot = {
        history: [
          {
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
          },
        ],
      };

      const result = evaluateMultiCycleConvergenceGate(autonomyState);

      expect(result.status).toBe('fail');
    });
  });

  describe('optional adapter not_available does not block', () => {
    it('should pass when only optional adapters are not_available', () => {
      const autonomyState: PulseAutonomyStateSnapshot = {
        history: [
          {
            cycleId: 'cycle-1',
            timestamp: '2026-04-25T00:00:00Z',
            status: 'completed',
            score: 75,
            blockingTier: 3,
            validationCommands: { total: 15, passing: 15 },
            optionalAdapters: ['slack_webhook', 'datadog'],
          },
          {
            cycleId: 'cycle-2',
            timestamp: '2026-04-25T01:00:00Z',
            status: 'completed',
            score: 78,
            blockingTier: 3,
            validationCommands: { total: 15, passing: 15 },
            optionalAdapters: ['slack_webhook', 'datadog'],
          },
          {
            cycleId: 'cycle-3',
            timestamp: '2026-04-25T02:00:00Z',
            status: 'completed',
            score: 80,
            blockingTier: 2,
            validationCommands: { total: 15, passing: 15 },
            optionalAdapters: ['slack_webhook', 'datadog'],
          },
        ],
      };

      const result = evaluateMultiCycleConvergenceGate(autonomyState);

      expect(result.status).toBe('pass');
    });

    it('should pass when optional adapter has optional_not_configured status', () => {
      const autonomyState: PulseAutonomyStateSnapshot = {
        history: [
          {
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
          },
          {
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
          },
          {
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
          },
        ],
      };

      const result = evaluateMultiCycleConvergenceGate(autonomyState);

      expect(result.status).toBe('pass');
    });
  });

  describe('mixed required and optional adapters', () => {
    it('should pass when required adapters are ready and optional adapters are optional_not_configured', () => {
      const autonomyState: PulseAutonomyStateSnapshot = {
        history: [
          {
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
          },
          {
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
          },
          {
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
          },
        ],
      };

      const result = evaluateMultiCycleConvergenceGate(autonomyState);

      expect(result.status).toBe('pass');
      expect(result.confidence).toBe('high');
    });

    it('should fail when required adapter is not_available even with optional adapters ready', () => {
      const autonomyState: PulseAutonomyStateSnapshot = {
        history: [
          {
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
          },
          {
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
          },
          {
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
          },
        ],
      };

      const result = evaluateMultiCycleConvergenceGate(autonomyState);

      expect(result.status).toBe('fail');
      expect(result.reason).toContain('stripe');
    });
  });
});
