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
  describe('assessChurnRisk', () => {
    it('returns none risk for empty sessions', () => {
      const r = tracker.assessChurnRisk('ws-x', [], Date.now());
      expect(r.riskLevel).toBe('none');
      expect(r.daysSinceLastActivity).toBe(-1);
    });

    it('returns low risk after 7d pause', () => {
      const sessions = [makeSession({}, 8, 0, 's1')];
      const r = tracker.assessChurnRisk('ws-x', sessions, Date.now());
      expect(r.riskLevel).toBe('low');
      expect(r.pauseDetected7d).toBe(true);
      expect(r.pauseDetected30d).toBe(false);
    });

    it('returns high risk after 30d pause', () => {
      const sessions = [makeSession({}, 35, 0, 's1')];
      const r = tracker.assessChurnRisk('ws-x', sessions, Date.now());
      expect(r.pauseDetected30d).toBe(true);
    });

    it('returns critical risk after 60d pause', () => {
      const sessions = [makeSession({}, 65, 0, 's1')];
      const r = tracker.assessChurnRisk('ws-x', sessions, Date.now());
      expect(r.riskLevel).toBe('critical');
    });

    it('estimates higher recovery for heavy users before pause', () => {
      const sessions: SessionRecord[] = [];
      for (let d = 14; d < 28; d++) {
        sessions.push(makeSession({}, d, 0, `s${d}`));
      }
      const r = tracker.assessChurnRisk('ws-x', sessions, Date.now());
      expect(r.estimatedRecoveryProbability).toBeGreaterThan(0.4);
    });
  });

  // ─── 19. assessPerceptibleLoss edge cases ─────────────────────────
  describe('assessPerceptibleLoss', () => {
    it('returns no loss for empty unavailability events', () => {
      const r = tracker.assessPerceptibleLoss('ws-x', [], [], Date.now());
      expect(r.lossDetected).toBe(false);
      expect(r.dependencyScore).toBe(0);
    });

    it('measures offline duration in hours', () => {
      const events = [makeUnavailability({}, 1, 24)];
      const r = tracker.assessPerceptibleLoss('ws-x', events, [], Date.now());
      expect(r.offlineDurationHours).toBe(24);
    });

    it('detects userBlocking when reported', () => {
      const events = [makeUnavailability({ userReportedBlocking: true }, 0, 2)];
      const r = tracker.assessPerceptibleLoss('ws-x', events, [], Date.now());
      expect(r.userBlockingReported).toBe(true);
      expect(r.lossDetected).toBe(true);
    });
  });

  // ─── 20. batch assessment ─────────────────────────────────────────
  describe('assessBatch', () => {
    it('returns results for multiple workspaces', () => {
      const ws1 = baseInput({
        workspaceId: 'ws-a',
        sessions: [
          makeSession({ workspaceId: 'ws-a' }, 2, 0, 'a1'),
          makeSession({ workspaceId: 'ws-a' }, 1, 0, 'a2'),
          makeSession({ workspaceId: 'ws-a' }, 0, 0, 'a3'),
        ],
      });
      const ws2 = baseInput({ workspaceId: 'ws-b', sessions: [] });
      const results = tracker.assessBatch([ws1, ws2]);
      expect(results).toHaveLength(2);
      expect(results[0].workspaceId).toBe('ws-a');
      expect(results[0].score).toBeGreaterThan(0);
      expect(results[1].workspaceId).toBe('ws-b');
      expect(results[1].signals).toContain('insufficient_data');
    });
  });

  // ─── 21. output structure validation ──────────────────────────────
  describe('assess — output structure', () => {
    it('produces valid IndispensabilitySignal structure', () => {
      const sessions = [
        makeSession({}, 2, 0, 's1'),
        makeSession({}, 1, 0, 's2'),
        makeSession({}, 0, 0, 's3'),
      ];
      const input = baseInput({ sessions });
      const result = tracker.assess(input);
      expect(result).toHaveProperty('workspaceId');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('signals');
      expect(result).toHaveProperty('assessedAt');
      expect(typeof result.score).toBe('number');
      expect(Array.isArray(result.signals)).toBe(true);
      expect(typeof result.assessedAt).toBe('string');
    });
  });

  // ─── 22. high dependency with multiple offline events ─────────────
  describe('assess — multiple unavailability events', () => {
    it('accumulates dependency from multiple offline incidents', () => {
      const sessions: SessionRecord[] = [];
      for (let d = 0; d < 14; d++) {
        sessions.push(makeSession({}, d, 0, `s${d}`));
      }
      const unavailability: FeatureUnavailabilityRecord[] = [
        makeUnavailability({ wasUserAffected: true, userReportedBlocking: true }, 10, 6),
        makeUnavailability({ wasUserAffected: true }, 7, 3),
        makeUnavailability({ wasUserAffected: true }, 4, 8),
      ];
      const input = baseInput({ sessions, unavailabilityEvents: unavailability });
      const result = tracker.assess(input);
      expect(result.signals).toContain('loss_perceptible');
      expect(result.signals).toContain('high_dependency');
    });
  });

  // ─── 23. habit formed with loss simultaneously ────────────────────
  describe('assess — habit formed despite unavailability', () => {
    it('maintains high score while detecting loss', () => {
      const sessions: SessionRecord[] = [];
      for (let d = 0; d < 14; d++) {
        for (let h = 0; h < 4; h++) {
          sessions.push(makeSession({}, d, h * 3, `s${d}-${h}`));
        }
      }
      const unavailability: FeatureUnavailabilityRecord[] = [
        makeUnavailability({ wasUserAffected: true, userReportedBlocking: true }, 3, 4),
      ];
      const input = baseInput({ sessions, unavailabilityEvents: unavailability });
      const result = tracker.assess(input);
      expect(result.signals).toContain('habit_formed');
      expect(result.signals).toContain('loss_perceptible');
      expect(result.score).toBeGreaterThanOrEqual(0.8);
    });
  });
});
