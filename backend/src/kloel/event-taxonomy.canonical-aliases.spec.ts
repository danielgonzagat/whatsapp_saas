import {
  KLOEL_TO_COGNITION_ALIAS,
  dualEventNames,
  emitCognitionAlias,
  resolveCanonicalAlias,
  type KloelLegacyEventName,
} from './event-taxonomy.canonical-aliases';

/**
 * Anti-regression spec for the `kloel.*` → `cognition.*` migration.
 *
 * Verifies that, for every registered legacy event name, emitting via the
 * alias helper fires BOTH the legacy name AND the canonical name in a single
 * trigger — so consumers that have already migrated to `cognition.*` see the
 * event while consumers still listening to `kloel.*` keep working.
 */
describe('event-taxonomy.canonical-aliases', () => {
  describe('KLOEL_TO_COGNITION_ALIAS map', () => {
    it('registers exactly the three events identified by macro audit', () => {
      expect(Object.keys(KLOEL_TO_COGNITION_ALIAS).sort()).toEqual([
        'kloel.chat.turn',
        'kloel.handoff.confidence',
        'kloel.handoff.confidence.blocking',
      ]);
    });

    it('maps every legacy name to a `cognition.*` canonical with the same suffix', () => {
      for (const [legacy, canonical] of Object.entries(KLOEL_TO_COGNITION_ALIAS)) {
        expect(canonical).toMatch(/^cognition\./);
        const legacySuffix = legacy.replace(/^kloel\./, '');
        const canonicalSuffix = canonical.replace(/^cognition\./, '');
        expect(canonicalSuffix).toBe(legacySuffix);
      }
    });

    it('contains no `kloel.*` value (canonicals must be cognition.*)', () => {
      for (const canonical of Object.values(KLOEL_TO_COGNITION_ALIAS)) {
        expect(canonical.startsWith('kloel.')).toBe(false);
      }
    });
  });

  describe('resolveCanonicalAlias', () => {
    it('returns the canonical name for every registered legacy entry', () => {
      for (const legacy of Object.keys(KLOEL_TO_COGNITION_ALIAS)) {
        const canonical = resolveCanonicalAlias(legacy);
        expect(canonical).toBe(
          KLOEL_TO_COGNITION_ALIAS[legacy as KloelLegacyEventName],
        );
      }
    });

    it('returns undefined for unknown event names (no silent miss)', () => {
      expect(resolveCanonicalAlias('not.an.event')).toBeUndefined();
      expect(resolveCanonicalAlias('kloel.unrelated.event')).toBeUndefined();
      expect(resolveCanonicalAlias('cognition.handoff.confidence')).toBeUndefined();
    });
  });

  describe('dualEventNames', () => {
    it('returns a {legacy, canonical} pair for each registered entry', () => {
      const pair = dualEventNames('kloel.handoff.confidence.blocking');
      expect(pair.legacy).toBe('kloel.handoff.confidence.blocking');
      expect(pair.canonical).toBe('cognition.handoff.confidence.blocking');
    });
  });

  describe('emitCognitionAlias — dual-emit guarantee', () => {
    it.each(Object.keys(KLOEL_TO_COGNITION_ALIAS) as KloelLegacyEventName[])(
      'fires BOTH legacy `%s` and its canonical alias on a single trigger',
      (legacy) => {
        const calls: Array<{ name: string; payload: Record<string, unknown> }> = [];
        emitCognitionAlias(
          (name, payload) => {
            calls.push({ name, payload });
          },
          legacy,
          { workspaceId: 'ws_test', sample: 1 },
        );
        expect(calls).toHaveLength(2);
        const names = calls.map((c) => c.name).sort();
        const expectedNames = [legacy, KLOEL_TO_COGNITION_ALIAS[legacy]].sort();
        expect(names).toEqual(expectedNames);
      },
    );

    it('preserves payload fields across both emissions', () => {
      const calls: Array<{ name: string; payload: Record<string, unknown> }> = [];
      emitCognitionAlias(
        (name, payload) => {
          calls.push({ name, payload });
        },
        'kloel.chat.turn',
        { workspaceId: 'ws_test', conversationId: 'conv_1', latencyMs: 42 },
      );
      for (const call of calls) {
        expect(call.payload['workspaceId']).toBe('ws_test');
        expect(call.payload['conversationId']).toBe('conv_1');
        expect(call.payload['latencyMs']).toBe(42);
      }
    });

    it('rewrites the `context` field per emission so structured logs match the name', () => {
      const calls: Array<{ name: string; payload: Record<string, unknown> }> = [];
      emitCognitionAlias(
        (name, payload) => {
          calls.push({ name, payload });
        },
        'kloel.handoff.confidence',
        { context: 'kloel.handoff.confidence', composite: 0.3 },
      );
      const legacyCall = calls.find((c) => c.name === 'kloel.handoff.confidence');
      const canonicalCall = calls.find((c) => c.name === 'cognition.handoff.confidence');
      expect(legacyCall?.payload['context']).toBe('kloel.handoff.confidence');
      expect(canonicalCall?.payload['context']).toBe('cognition.handoff.confidence');
    });

    it('leaves payload untouched when no `context` field is present', () => {
      const calls: Array<{ name: string; payload: Record<string, unknown> }> = [];
      const input = { workspaceId: 'ws_test', metric: 1 };
      emitCognitionAlias(
        (name, payload) => {
          calls.push({ name, payload });
        },
        'kloel.chat.turn',
        input,
      );
      for (const call of calls) {
        expect('context' in call.payload).toBe(false);
        expect(call.payload['workspaceId']).toBe('ws_test');
      }
    });

    it('emits legacy first, then canonical (ordering contract)', () => {
      const order: string[] = [];
      emitCognitionAlias(
        (name) => {
          order.push(name);
        },
        'kloel.handoff.confidence.blocking',
        { workspaceId: 'ws_test' },
      );
      expect(order).toEqual([
        'kloel.handoff.confidence.blocking',
        'cognition.handoff.confidence.blocking',
      ]);
    });

    it('preserves workspaceId across both emissions (workspace isolation)', () => {
      const observed: Array<string | undefined> = [];
      emitCognitionAlias(
        (_name, payload) => {
          observed.push(payload['workspaceId'] as string | undefined);
        },
        'kloel.chat.turn',
        { workspaceId: 'ws_iso_check' },
      );
      expect(observed).toEqual(['ws_iso_check', 'ws_iso_check']);
    });
  });
});
