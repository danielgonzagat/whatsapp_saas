/**
 * UTP-DELEG-INDISP — IndispensabilityTracker Spec
 *
 * Exaustivo (>= 15 cenarios). Cobre:
 *   - Metrica de uso semanal, diario, gaps
 *   - Deteccao de churn risk 7d/30d/60d
 *   - Deteccao de perda perceptivel
 *   - Score composto e sinais qualitativos
 *   - Edge cases (vazio, score clamping, batch)
 */

import { IndispensabilityTrackerService } from './indispensability.tracker.service';
import type {
  SessionRecord,
  FeatureUnavailabilityRecord,
  IndispensabilityInput,
} from './indispensability.types';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

const makeSession = (
  over: Partial<SessionRecord> = {},
  dayOffset: number,
  hourOffset: number,
  id: string,
): SessionRecord => {
  const baseMs = Date.now() - dayOffset * DAY_MS - hourOffset * HOUR_MS;
  return {
    workspaceId: over.workspaceId ?? 'ws-test',
    sessionId: over.sessionId ?? id,
    startedAt: new Date(baseMs).toISOString(),
    endedAt: new Date(baseMs + (over.durationMs ?? 1800000)).toISOString(),
    featuresUsed: over.featuresUsed ?? ['dashboard', 'inbox'],
    durationMs: over.durationMs ?? 1800000,
    sessionType: over.sessionType ?? 'active',
  };
};

const makeUnavailability = (
  over: Partial<FeatureUnavailabilityRecord> = {},
  startOffsetDays: number,
  durationHours: number,
): FeatureUnavailabilityRecord => {
  const startMs = Date.now() - startOffsetDays * DAY_MS;
  return {
    workspaceId: over.workspaceId ?? 'ws-test',
    featureName: over.featureName ?? 'whatsapp_inbox',
    offlineStartedAt: new Date(startMs).toISOString(),
    offlineEndedAt: new Date(startMs + durationHours * HOUR_MS).toISOString(),
    wasUserAffected: over.wasUserAffected ?? true,
    userReportedBlocking: over.userReportedBlocking ?? false,
  };
};

const baseInput = (
  over: Partial<IndispensabilityInput> = {},
): IndispensabilityInput => ({
  workspaceId: over.workspaceId ?? 'ws-test',
  sessions: over.sessions ?? [],
  unavailabilityEvents: over.unavailabilityEvents ?? [],
  nowMs: over.nowMs ?? Date.now(),
});

describe('IndispensabilityTrackerService (UTP-DELEG-INDISP)', () => {
  let tracker: IndispensabilityTrackerService;

  beforeEach(() => {
    tracker = new IndispensabilityTrackerService();
  });

  // ─── 1. insufficient data (< 2 sessions) ─────────────────────────
  describe('assess — insufficient data', () => {
    it('returns low score and insufficient_data signal for < 2 sessions', () => {
      const input = baseInput({
        sessions: [makeSession({}, 0, 0, 's1')],
      });
      const result = tracker.assess(input);
      expect(result.score).toBeLessThanOrEqual(0.1);
      expect(result.signals).toContain('insufficient_data');
      expect(result.signals).not.toContain('habit_forming');
    });
  });

  // ─── 2. zero sessions → inactive ──────────────────────────────────
  describe('assess — inactive', () => {
    it('returns score 0 with insufficient_data for zero sessions', () => {
      const input = baseInput({ sessions: [] });
      const result = tracker.assess(input);
      expect(result.score).toBe(0);
      expect(result.signals).toContain('insufficient_data');
    });
  });

  // ─── 3. high weekly frequency ─────────────────────────────────────
  describe('assess — high weekly frequency', () => {
    it('detects high_weekly_frequency when >= 5 sessions/week', () => {
      const sessions: SessionRecord[] = [];
      for (let d = 0; d < 7; d++) {
        for (let h = 0; h < 2; h++) {
          sessions.push(makeSession({}, d, h * 8, `s${d}-${h}`));
        }
      }
      const input = baseInput({ sessions });
      const result = tracker.assess(input);
      expect(result.signals).toContain('high_weekly_frequency');
      expect(result.score).toBeGreaterThan(0.5);
    });
  });

  // ─── 4. consistent daily use ──────────────────────────────────────
  describe('assess — consistent daily use', () => {
    it('detects consistent_daily_use when dailyFrequency >= 1', () => {
      const sessions: SessionRecord[] = [];
      for (let d = 0; d < 10; d++) {
        sessions.push(makeSession({}, d, 0, `s${d}`));
      }
      const input = baseInput({ sessions });
      const result = tracker.assess(input);
      expect(result.signals).toContain('consistent_daily_use');
    });
  });

  // ─── 5. short inter-session gap ───────────────────────────────────
  describe('assess — short inter-session gap', () => {
    it('detects short_inter_session_gap when avgGap <= 12h', () => {
      const sessions: SessionRecord[] = [];
      for (let h = 0; h < 10; h++) {
        sessions.push(makeSession({}, 0, h * 4, `s${h}`));
      }
      const input = baseInput({ sessions });
      const result = tracker.assess(input);
      expect(result.signals).toContain('short_inter_session_gap');
    });
  });

  // ─── 6. regular pattern detected ──────────────────────────────────
  describe('assess — regular pattern detected', () => {
    it('detects regular_pattern_detected when >= 70% active days', () => {
      const sessions: SessionRecord[] = [];
      for (let d = 0; d < 7; d++) {
        sessions.push(makeSession({}, d, 2, `s${d}a`));
        sessions.push(makeSession({}, d, 6, `s${d}b`));
      }
      const input = baseInput({ sessions });
      const result = tracker.assess(input);
      expect(result.signals).toContain('regular_pattern_detected');
    });
  });

  // ─── 7. habit forming (score >= 0.5) ──────────────────────────────
  describe('assess — habit forming', () => {
    it('emits habit_forming when score >= 0.5', () => {
      const sessions: SessionRecord[] = [];
      for (let d = 0; d < 5; d++) {
        sessions.push(makeSession({}, d + 1, 0, `s${d}`));
      }
      const input = baseInput({ sessions });
      const result = tracker.assess(input);
      expect(result.signals).toContain('habit_forming');
      expect(result.score).toBeGreaterThanOrEqual(0.5);
      expect(result.score).toBeLessThan(0.8);
    });
  });

  // ─── 8. habit formed (score >= 0.8) ───────────────────────────────
  describe('assess — habit formed', () => {
    it('emits habit_formed when score >= 0.8', () => {
      const sessions: SessionRecord[] = [];
      for (let d = 0; d < 14; d++) {
        for (let h = 0; h < 3; h++) {
          sessions.push(makeSession({}, d, h * 5, `s${d}-${h}`));
        }
      }
      const input = baseInput({ sessions });
      const result = tracker.assess(input);
      expect(result.signals).toContain('habit_formed');
      expect(result.score).toBeGreaterThanOrEqual(0.8);
    });
  });

  // ─── 9. churn risk 7d ─────────────────────────────────────────────
  describe('assess — churn risk 7d', () => {
    it('emits churn_risk_7d after 7+ days of inactivity', () => {
      const sessions = [
        makeSession({}, 15, 0, 's-old1'),
        makeSession({}, 15, 1, 's-old2'),
        makeSession({}, 15, 2, 's-old3'),
        makeSession({}, 15, 3, 's-old4'),
        makeSession({}, 10, 0, 's-mid'),
      ];
      const input = baseInput({ sessions });
      const result = tracker.assess(input);
      expect(result.signals).toContain('churn_risk_7d');
    });
  });

  // ─── 10. churn risk 30d ───────────────────────────────────────────
  describe('assess — churn risk 30d', () => {
    it('emits churn_risk_30d after 30+ days of inactivity', () => {
      const sessions = [
        makeSession({}, 45, 0, 's-old1'),
        makeSession({}, 45, 2, 's-old2'),
      ];
      const input = baseInput({ sessions });
      const result = tracker.assess(input);
      expect(result.signals).toContain('churn_risk_30d');
    });
  });

  // ─── 11. churn risk critical ──────────────────────────────────────
  describe('assess — churn risk critical', () => {
    it('emits churn_risk_critical after 60+ days of inactivity', () => {
      const sessions = [
        makeSession({}, 70, 0, 's-old1'),
        makeSession({}, 71, 0, 's-old2'),
      ];
      const input = baseInput({ sessions });
      const result = tracker.assess(input);
      expect(result.signals).toContain('churn_risk_critical');
    });
  });

  // ─── 12. loss perceptible ─────────────────────────────────────────
  describe('assess — loss perceptible', () => {
    it('detects loss_perceptible when feature offline affected user', () => {
      const sessions = [
        makeSession({}, 3, 0, 's1'),
        makeSession({}, 2, 0, 's2'),
        makeSession({}, 1, 0, 's3'),
        makeSession({}, 0, 0, 's4'),
      ];
      const unavailability: FeatureUnavailabilityRecord[] = [
        makeUnavailability({ wasUserAffected: true }, 2, 4),
      ];
      const input = baseInput({ sessions, unavailabilityEvents: unavailability });
      const result = tracker.assess(input);
      expect(result.signals).toContain('loss_perceptible');
    });
  });

  // ─── 13. high dependency ──────────────────────────────────────────
  describe('assess — high dependency', () => {
    it('detects high_dependency when user reports blocking', () => {
      const sessions: SessionRecord[] = [];
      for (let d = 0; d < 10; d++) {
        sessions.push(makeSession({}, d, 0, `s${d}`));
      }
      const unavailability: FeatureUnavailabilityRecord[] = [
        makeUnavailability({ wasUserAffected: true, userReportedBlocking: true }, 5, 12),
      ];
      const input = baseInput({ sessions, unavailabilityEvents: unavailability });
      const result = tracker.assess(input);
      expect(result.signals).toContain('high_dependency');
    });
  });

  // ─── 14. recovery likely ──────────────────────────────────────────
  describe('assess — recovery likely', () => {
    it('emits recovery_likely when had habit before pause', () => {
      const sessions: SessionRecord[] = [];
      for (let d = 14; d < 28; d++) {
        sessions.push(makeSession({}, d, 0, `s${d}a`));
        sessions.push(makeSession({}, d, 7, `s${d}b`));
      }
      const input = baseInput({ sessions });
      const result = tracker.assess(input);
      expect(result.signals).toContain('recovery_likely');
    });
  });

  // ─── 15. score clamped to [0, 1] ──────────────────────────────────
  describe('assess — score clamping', () => {
    it('clamps score to max 1.0', () => {
      const sessions: SessionRecord[] = [];
      for (let d = 0; d < 30; d++) {
        for (let h = 0; h < 8; h++) {
          sessions.push(makeSession({}, d, h * 2, `s${d}-${h}`));
        }
      }
      const input = baseInput({ sessions });
      const result = tracker.assess(input);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it('clamps score to min 0.0', () => {
      const sessions = [
        makeSession({}, 70, 0, 's-old1'),
        makeSession({}, 70, 1, 's-old2'),
      ];
      const input = baseInput({ sessions });
      const result = tracker.assess(input);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── 16. no habit detected ────────────────────────────────────────
  describe('assess — no habit detected', () => {
    it('emits no_habit_detected for sporadic use', () => {
      const sessions = [
        makeSession({}, 20, 0, 's1'),
        makeSession({}, 10, 0, 's2'),
      ];
      const input = baseInput({ sessions });
      const result = tracker.assess(input);
      expect(result.signals).toContain('no_habit_detected');
      expect(result.signals).toContain('churn_risk_7d');
      expect(result.score).toBeLessThan(0.3);
    });
  });

  // ─── 17. computeUsageMetrics — empty sessions ──────────────────────
  describe('computeUsageMetrics', () => {
    it('returns zero metrics for empty sessions', () => {
      const m = tracker.computeUsageMetrics('ws-x', [], Date.now());
      expect(m.totalSessions).toBe(0);
      expect(m.weeklyAverage).toBe(0);
      expect(m.dailyFrequency).toBe(0);
      expect(m.avgGapHours).toBe(0);
      expect(m.activeDaysCount).toBe(0);
    });

    it('correctly computes metrics for multiple sessions', () => {
      const sessions: SessionRecord[] = [];
      for (let d = 0; d < 7; d++) {
        sessions.push(makeSession({}, d, 0, `s${d}`));
      }
      const m = tracker.computeUsageMetrics('ws-x', sessions, Date.now());
      expect(m.totalSessions).toBe(7);
      expect(m.activeDaysCount).toBe(7);
      expect(m.dailyFrequency).toBeGreaterThan(0);
    });
  });

  // ─── 18. assessChurnRisk edge cases ───────────────────────────────
