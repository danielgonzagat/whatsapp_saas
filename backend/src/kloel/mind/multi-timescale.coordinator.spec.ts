import { MultiTimescaleCoordinator, Timescale } from './multi-timescale.coordinator';

describe('MultiTimescaleCoordinator', () => {
  let coordinator: MultiTimescaleCoordinator;

  beforeEach(() => {
    coordinator = new MultiTimescaleCoordinator();
  });

  describe('constructor defaults', () => {
    it('uses default intervalMs for short (5s)', () => {
      const cfg = coordinator.configFor('short');
      expect(cfg.intervalMs).toBe(5_000);
      expect(cfg.description).toBe('windowed seconds');
    });

    it('uses default intervalMs for medium (1 hour)', () => {
      const cfg = coordinator.configFor('medium');
      expect(cfg.intervalMs).toBe(60 * 60 * 1000);
      expect(cfg.description).toBe('hourly maintenance');
    });

    it('uses default intervalMs for long (24 hours)', () => {
      const cfg = coordinator.configFor('long');
      expect(cfg.intervalMs).toBe(24 * 60 * 60 * 1000);
      expect(cfg.description).toBe('daily consolidation');
    });

    it('uses default intervalMs for immediate (0)', () => {
      const cfg = coordinator.configFor('immediate');
      expect(cfg.intervalMs).toBe(0);
      expect(cfg.description).toBe('on-event');
    });

    it('accepts custom config overrides', () => {
      const custom = new MultiTimescaleCoordinator({
        short: { intervalMs: 10_000, description: 'custom short' },
      });
      const cfg = custom.configFor('short');
      expect(cfg.intervalMs).toBe(10_000);
      expect(cfg.description).toBe('custom short');

      // medium should still use default
      const med = custom.configFor('medium');
      expect(med.intervalMs).toBe(60 * 60 * 1000);
    });
  });

  describe('dueScales', () => {
    it('returns all scales when none have been fired', () => {
      const due = coordinator.dueScales();
      // immediate is never returned by dueScales
      expect(due).toContain('short');
      expect(due).toContain('medium');
      expect(due).toContain('long');
      expect(due).not.toContain('immediate');
      expect(due).toHaveLength(3);
    });

    it('returns only scales whose interval has elapsed since last fire', () => {
      const now = Date.now();
      coordinator.markFired('short', now);
      coordinator.markFired('medium', now);
      coordinator.markFired('long', now);

      // Advance past short interval (5s) but not medium (1h) or long (24h)
      const future = now + 10_000; // +10s
      const due = coordinator.dueScales(future);

      expect(due).toContain('short');
      expect(due).not.toContain('medium');
      expect(due).not.toContain('long');
      expect(due).toHaveLength(1);
    });

    it('returns medium scale after its interval elapses', () => {
      const now = Date.now();
      coordinator.markFired('short', now);
      coordinator.markFired('medium', now);
      coordinator.markFired('long', now);

      const future = now + 60 * 60 * 1000 + 1; // +1 hour + 1ms
      const due = coordinator.dueScales(future);

      expect(due).toContain('short');
      expect(due).toContain('medium');
      expect(due).not.toContain('long');
    });

    it('returns long scale after its interval elapses', () => {
      const now = Date.now();
      coordinator.markFired('short', now);
      coordinator.markFired('medium', now);
      coordinator.markFired('long', now);

      const future = now + 24 * 60 * 60 * 1000 + 1; // +24 hours + 1ms
      const due = coordinator.dueScales(future);

      expect(due).toContain('short');
      expect(due).toContain('medium');
      expect(due).toContain('long');
    });

    it('defaults nowMs to Date.now()', () => {
      const due = coordinator.dueScales();
      expect(Array.isArray(due)).toBe(true);
      expect(due.length).toBeGreaterThanOrEqual(0);
    });

    it('returns empty array when all scales recently fired', () => {
      const now = Date.now();
      // Mark all as fired "now"
      coordinator.markFired('short', now);
      coordinator.markFired('medium', now);
      coordinator.markFired('long', now);

      // Query at the same instant — nothing should be due
      const due = coordinator.dueScales(now);
      expect(due).toHaveLength(0);
    });
  });

  describe('markFired', () => {
    it('records the fire timestamp', () => {
      const now = Date.now();
      coordinator.markFired('short', now);
      expect(coordinator.lastFireMs('short')).toBe(now);
    });

    it('defaults nowMs to Date.now()', () => {
      const before = Date.now();
      coordinator.markFired('short');
      const after = Date.now();
      const recorded = coordinator.lastFireMs('short');
      expect(recorded).toBeGreaterThanOrEqual(before);
      expect(recorded).toBeLessThanOrEqual(after);
    });

    it('updates previously recorded timestamps', () => {
      const first = 1000;
      const second = 5000;
      coordinator.markFired('short', first);
      coordinator.markFired('short', second);
      expect(coordinator.lastFireMs('short')).toBe(second);
    });

    it('works for all timescales', () => {
      const now = Date.now();
      const scales: Timescale[] = ['immediate', 'short', 'medium', 'long'];
      for (const scale of scales) {
        coordinator.markFired(scale, now);
        expect(coordinator.lastFireMs(scale)).toBe(now);
      }
    });
  });

  describe('lastFireMs', () => {
    it('returns 0 for scales that have never been fired', () => {
      expect(coordinator.lastFireMs('short')).toBe(0);
      expect(coordinator.lastFireMs('medium')).toBe(0);
      expect(coordinator.lastFireMs('long')).toBe(0);
      expect(coordinator.lastFireMs('immediate')).toBe(0);
    });
  });

  describe('configFor', () => {
    it('returns config for all valid timescales', () => {
      const scales: Timescale[] = ['immediate', 'short', 'medium', 'long'];
      for (const scale of scales) {
        const cfg = coordinator.configFor(scale);
        expect(cfg).toBeDefined();
        expect(typeof cfg.intervalMs).toBe('number');
        expect(typeof cfg.description).toBe('string');
      }
    });
  });
});
