import {
  AI_KEY_MISSING_MESSAGE,
  buildCognitiveSubstrateFromAutopilotRows,
  buildDeterministicCallId,
  buildResponseVersionId,
  computeCapabilityHealthScore,
  computeSubstrateBeliefs,
  computeSubstrateLookbackSince,
  extractUserPreview,
  isAiProviderConfigured,
  normalizeSpineEvent,
  normalizeSpineEvents,
  resolveAbortBeforeStartCode,
  resolveThinkErrorCode,
  resolveThinkerSystemPrompt,
  SUBSTRATE_BELIEF_MIN_OBSERVATIONS,
  SUBSTRATE_DEVELOPING_THRESHOLD,
  SUBSTRATE_EPISODIC_TAIL,
  SUBSTRATE_LOOKBACK_MS,
  SUBSTRATE_PREDICTION_MIN_EVENTS,
  SUBSTRATE_SALIENT_HEAD,
  SUBSTRATE_USER_PREVIEW_CHARS,
  SUBSTRATE_WORKING_MEMORY_TAIL,
  type AutopilotEventRow,
  type NormalizedSpineEvent,
} from './kloel-thinker.substrate.helpers';

const FIXED_ISO = '2026-01-01T00:00:00.000Z';
const FIXED_TIME = new Date(FIXED_ISO).getTime();

function spineRow(overrides: Partial<AutopilotEventRow> = {}): AutopilotEventRow {
  return {
    intent: 'kloel_chat_turn',
    action: 'kloel.chat.turn',
    status: 'executed',
    meta: { userPreview: 'hello world' },
    createdAt: new Date(FIXED_TIME + 1000),
    ...overrides,
  };
}

describe('kloel-thinker.substrate.helpers', () => {
  describe('computeSubstrateLookbackSince', () => {
    it('returns now minus seven days', () => {
      const now = new Date(FIXED_ISO);
      const since = computeSubstrateLookbackSince(now);
      expect(since.getTime()).toBe(now.getTime() - SUBSTRATE_LOOKBACK_MS);
    });

    it('defaults to "now" when no arg is provided', () => {
      const before = Date.now();
      const since = computeSubstrateLookbackSince();
      const after = Date.now();
      expect(since.getTime()).toBeGreaterThanOrEqual(before - SUBSTRATE_LOOKBACK_MS - 1);
      expect(since.getTime()).toBeLessThanOrEqual(after - SUBSTRATE_LOOKBACK_MS + 1);
    });
  });

  describe('extractUserPreview', () => {
    it('returns the string preview', () => {
      expect(extractUserPreview({ userPreview: 'hi' })).toBe('hi');
    });

    it('returns empty when meta is not an object', () => {
      expect(extractUserPreview(null)).toBe('');
      expect(extractUserPreview(undefined)).toBe('');
      expect(extractUserPreview('plain')).toBe('');
      expect(extractUserPreview(42)).toBe('');
    });

    it('returns empty when userPreview is not a string', () => {
      expect(extractUserPreview({ userPreview: 42 })).toBe('');
      expect(extractUserPreview({})).toBe('');
    });
  });

  describe('normalizeSpineEvent', () => {
    it('builds eventId from createdAt and index', () => {
      const row = spineRow({
        intent: 'foo',
        status: 'executed',
        createdAt: new Date(FIXED_TIME),
        meta: { userPreview: 'abc' },
      });
      const event = normalizeSpineEvent(row, 2);
      expect(event.eventId).toBe(`evt_${FIXED_TIME.toString(36)}_${(2).toString(36)}`);
      expect(event.eventName).toBe('autopilot.foo.executed');
      expect(event.occurredAt).toBe(new Date(FIXED_TIME).toISOString());
      expect(event.summary).toBe('chat: abc');
      expect(event.valence).toBe('neutral');
    });

    it('caps user preview at SUBSTRATE_USER_PREVIEW_CHARS', () => {
      const long = 'x'.repeat(500);
      const event = normalizeSpineEvent(spineRow({ meta: { userPreview: long } }), 0);
      expect(event.summary).toBe(`chat: ${long.slice(0, SUBSTRATE_USER_PREVIEW_CHARS)}`);
    });

    it('preserves ordering through normalizeSpineEvents', () => {
      const rows = [
        spineRow({ intent: 'a', createdAt: new Date(FIXED_TIME) }),
        spineRow({ intent: 'b', createdAt: new Date(FIXED_TIME + 1) }),
        spineRow({ intent: 'c', createdAt: new Date(FIXED_TIME + 2) }),
      ];
      const events = normalizeSpineEvents(rows);
      expect(events.map((e) => e.eventName)).toEqual([
        'autopilot.a.executed',
        'autopilot.b.executed',
        'autopilot.c.executed',
      ]);
    });
  });

  describe('computeSubstrateBeliefs', () => {
    function makeEvent(name: string, summary = 'x'): NormalizedSpineEvent {
      return {
        eventId: `evt_${name}`,
        eventName: name,
        occurredAt: FIXED_ISO,
        summary,
        valence: 'neutral',
      };
    }

    it('drops predicates below SUBSTRATE_BELIEF_MIN_OBSERVATIONS', () => {
      const events = Array.from({ length: SUBSTRATE_BELIEF_MIN_OBSERVATIONS - 1 }, () =>
        makeEvent('autopilot.rare.executed'),
      );
      const { beliefs } = computeSubstrateBeliefs(events);
      expect(beliefs).toEqual([]);
    });

    it('emits a belief once the threshold is reached', () => {
      const events = Array.from({ length: SUBSTRATE_BELIEF_MIN_OBSERVATIONS }, () =>
        makeEvent('autopilot.kloel_chat_turn.executed', 'turn'),
      );
      const { beliefs } = computeSubstrateBeliefs(events);
      expect(beliefs).toHaveLength(1);
      const belief = beliefs[0];
      expect(belief.predicate).toBe('autopilot.kloel_chat_turn.executed');
      expect(belief.n).toBe(SUBSTRATE_BELIEF_MIN_OBSERVATIONS);
      // (n+1)/(n+2) rounded to 2 decimals.
      const expected =
        Math.round(
          ((SUBSTRATE_BELIEF_MIN_OBSERVATIONS + 1) / (SUBSTRATE_BELIEF_MIN_OBSERVATIONS + 2)) * 100,
        ) / 100;
      expect(belief.confidence).toBe(expected);
      expect(belief.examples).toEqual(['turn', 'turn', 'turn']);
    });

    it('caps belief.examples at SUBSTRATE_BELIEF_EXAMPLES_CAP', () => {
      const events = Array.from({ length: 6 }, (_, i) =>
        makeEvent('autopilot.flow.executed', `summary-${i}`),
      );
      const { beliefs } = computeSubstrateBeliefs(events);
      expect(beliefs[0].examples).toEqual(['summary-0', 'summary-1', 'summary-2']);
    });

    it('produces one valence trace point per event', () => {
      const events = [makeEvent('a'), makeEvent('b'), makeEvent('c')];
      const { valenceTrace } = computeSubstrateBeliefs(events);
      expect(valenceTrace).toHaveLength(3);
      expect(valenceTrace.every((p) => p.label === 'neutral')).toBe(true);
      expect(valenceTrace.every((p) => p.score === 0.1)).toBe(true);
    });

    it('returns empty beliefs / trace when input is empty', () => {
      const result = computeSubstrateBeliefs([]);
      expect(result.beliefs).toEqual([]);
      expect(result.valenceTrace).toEqual([]);
    });
  });

  describe('computeCapabilityHealthScore', () => {
    it('returns floor(count / 10) bounded at 10', () => {
      expect(computeCapabilityHealthScore(0)).toBe(0);
      expect(computeCapabilityHealthScore(9)).toBe(0);
      expect(computeCapabilityHealthScore(10)).toBe(1);
      expect(computeCapabilityHealthScore(99)).toBe(9);
      expect(computeCapabilityHealthScore(100)).toBe(10);
      expect(computeCapabilityHealthScore(10_000)).toBe(10);
    });
  });

  describe('buildCognitiveSubstrateFromAutopilotRows', () => {
    it('returns undefined when no rows', () => {
      expect(buildCognitiveSubstrateFromAutopilotRows([], 'ws-1')).toBeUndefined();
    });

    it('builds a full substrate for a small spine slice', () => {
      const rows: AutopilotEventRow[] = Array.from({ length: 6 }, (_, i) =>
        spineRow({
          intent: 'kloel_chat_turn',
          status: 'executed',
          createdAt: new Date(FIXED_TIME + i * 1000),
          meta: { userPreview: `msg-${i}` },
        }),
      );
      const fixedClock = () => new Date(FIXED_ISO);
      const substrate = buildCognitiveSubstrateFromAutopilotRows(rows, 'ws-1', fixedClock);
      expect(substrate).toBeDefined();
      if (!substrate) {
        throw new Error('substrate is required for this test');
      }
      expect(substrate.recentSalientEvents).toHaveLength(6);
      expect(substrate.beliefs).toHaveLength(1);
      // 6 events ≥ SUBSTRATE_PREDICTION_MIN_EVENTS (5) → prediction emitted.
      expect(substrate.predictions.active).toHaveLength(1);
      expect(substrate.predictions.active[0]).toMatchObject({
        label: 'autopilot_event_inflow',
        baseRate: 6,
        confidence: 0.85,
      });
      expect(substrate.workingMemory).toHaveLength(SUBSTRATE_WORKING_MEMORY_TAIL);
      expect(substrate.episodicRefs).toHaveLength(6);
      expect(substrate.readinessTruth.certificationVerdict.measuredAt).toBe(FIXED_ISO);
      expect(substrate.readinessTruth.certificationVerdict.verdict).toBe('INSUFFICIENT_EVIDENCE');
      expect(substrate.perception.currentSnapshot).toEqual({
        channel: 'web',
        workspaceId: 'ws-1',
      });
      expect(substrate.capabilityHealthScore).toBe(0);
    });

    it('emits no prediction when event count below SUBSTRATE_PREDICTION_MIN_EVENTS', () => {
      const rows = Array.from({ length: SUBSTRATE_PREDICTION_MIN_EVENTS - 1 }, () => spineRow());
      const substrate = buildCognitiveSubstrateFromAutopilotRows(rows, 'ws-1');
      expect(substrate?.predictions.active).toEqual([]);
    });

    it('flips verdict to DEVELOPING above SUBSTRATE_DEVELOPING_THRESHOLD', () => {
      const rows = Array.from({ length: SUBSTRATE_DEVELOPING_THRESHOLD + 1 }, (_, i) =>
        spineRow({ createdAt: new Date(FIXED_TIME + i * 1000) }),
      );
      const substrate = buildCognitiveSubstrateFromAutopilotRows(rows, 'ws-1');
      expect(substrate?.readinessTruth.certificationVerdict.verdict).toBe('DEVELOPING');
    });

    it('caps salient slices at SUBSTRATE_SALIENT_HEAD and episodic at SUBSTRATE_EPISODIC_TAIL', () => {
      const rows = Array.from({ length: 50 }, (_, i) =>
        spineRow({ createdAt: new Date(FIXED_TIME + i * 1000) }),
      );
      const substrate = buildCognitiveSubstrateFromAutopilotRows(rows, 'ws-1');
      expect(substrate?.recentSalientEvents.length).toBe(SUBSTRATE_SALIENT_HEAD);
      expect(substrate?.perception.recentSalientEvents.length).toBe(SUBSTRATE_SALIENT_HEAD);
      expect(substrate?.episodicRefs.length).toBe(SUBSTRATE_EPISODIC_TAIL);
    });
  });

  describe('isAiProviderConfigured', () => {
    it('returns true when OpenAI key is configured', () => {
      expect(isAiProviderConfigured({ hasOpenAiKey: true, env: {} })).toBe(true);
    });

    it('returns true when only Anthropic is configured', () => {
      expect(
        isAiProviderConfigured({
          hasOpenAiKey: false,
          env: { ANTHROPIC_API_KEY: 'sk-anything' },
        }),
      ).toBe(true);
    });

    it('returns false when no provider is configured', () => {
      expect(isAiProviderConfigured({ hasOpenAiKey: false, env: {} })).toBe(false);
    });

    it('falls back to process.env when env is not passed', () => {
      // Light smoke — we only assert the function does not throw and returns a boolean.
      const prev = process.env['ANTHROPIC_API_KEY'];
      process.env['ANTHROPIC_API_KEY'] = '';
      try {
        expect(typeof isAiProviderConfigured({ hasOpenAiKey: false })).toBe('boolean');
      } finally {
        if (prev === undefined) {
          delete process.env['ANTHROPIC_API_KEY'];
        } else {
          process.env['ANTHROPIC_API_KEY'] = prev;
        }
      }
    });
  });

  describe('AI_KEY_MISSING_MESSAGE', () => {
    it('mentions all four supported provider env vars', () => {
      expect(AI_KEY_MISSING_MESSAGE).toContain('DEEPSEEK_API_KEY');
      expect(AI_KEY_MISSING_MESSAGE).toContain('LLM_API_KEY');
      expect(AI_KEY_MISSING_MESSAGE).toContain('OPENAI_API_KEY');
      expect(AI_KEY_MISSING_MESSAGE).toContain('ANTHROPIC_API_KEY');
    });
  });

  describe('resolveThinkerSystemPrompt', () => {
    const canonical = 'CANONICAL';
    const dashboard = jest.fn(() => 'DASHBOARD');

    beforeEach(() => {
      dashboard.mockClear();
    });

    it('returns canonical for onboarding mode', () => {
      expect(
        resolveThinkerSystemPrompt({
          mode: 'onboarding',
          canonicalFallbackPrompt: canonical,
          buildDashboardPrompt: dashboard,
        }),
      ).toBe(canonical);
      expect(dashboard).not.toHaveBeenCalled();
    });

    it('returns canonical for sales mode', () => {
      expect(
        resolveThinkerSystemPrompt({
          mode: 'sales',
          canonicalFallbackPrompt: canonical,
          buildDashboardPrompt: dashboard,
        }),
      ).toBe(canonical);
      expect(dashboard).not.toHaveBeenCalled();
    });

    it('calls the dashboard builder for every other mode', () => {
      expect(
        resolveThinkerSystemPrompt({
          mode: 'chat',
          canonicalFallbackPrompt: canonical,
          buildDashboardPrompt: dashboard,
        }),
      ).toBe('DASHBOARD');
      expect(dashboard).toHaveBeenCalledTimes(1);
    });
  });

  describe('resolveThinkErrorCode', () => {
    it('returns the abort reason when it is a string', () => {
      expect(resolveThinkErrorCode('timeout', 'fallback')).toBe('timeout');
    });

    it('falls back when the reason is not a string', () => {
      expect(resolveThinkErrorCode(undefined, 'fallback')).toBe('fallback');
      expect(resolveThinkErrorCode(42, 'fallback')).toBe('fallback');
      expect(resolveThinkErrorCode(new Error('boom'), 'fallback')).toBe('fallback');
    });
  });

  describe('resolveAbortBeforeStartCode', () => {
    it('returns the reason when string', () => {
      expect(resolveAbortBeforeStartCode('user_cancel')).toBe('user_cancel');
    });

    it('falls back to "request_aborted_before_start" otherwise', () => {
      expect(resolveAbortBeforeStartCode(undefined)).toBe('request_aborted_before_start');
      expect(resolveAbortBeforeStartCode(123)).toBe('request_aborted_before_start');
    });
  });

  describe('buildDeterministicCallId', () => {
    it('uses the client request id when present', () => {
      expect(buildDeterministicCallId('req-1')).toBe('deterministic_req-1');
    });

    it('falls back to the injected clock when no request id', () => {
      const fixed = () => 1700000000000;
      expect(buildDeterministicCallId(undefined, fixed)).toBe('deterministic_1700000000000');
    });
  });

  describe('buildResponseVersionId', () => {
    it('uses the client request id when present', () => {
      expect(buildResponseVersionId('req-9')).toBe('resp_req-9');
    });

    it('falls back to a timestamped runtime id when missing', () => {
      const id = buildResponseVersionId(undefined);
      expect(id.startsWith('resp_')).toBe(true);
      // Sanity check: the suffix is not empty.
      expect(id.length).toBeGreaterThan('resp_'.length);
    });
  });
});
