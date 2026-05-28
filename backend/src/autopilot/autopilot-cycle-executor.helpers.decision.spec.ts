import {
  ACTION_TO_RESPONSE_TYPE,
  AUTOPILOT_ACTIONS,
  AUTOPILOT_MIND_DECISION_TYPE,
  decideActionBaseline,
  decideBuyingAction,
  decideIntentAction,
  decideNightAction,
  decideStageAction,
  HARDCODED_NIGHT_RESPONSES,
  isNightHour,
  readRecord,
  RESPONSE_TEMPLATES,
} from './autopilot-cycle-executor.helpers';

describe('autopilot-cycle-executor.helpers — decision', () => {
  describe('constants', () => {
    it('exposes the canonical decision type', () => {
      expect(AUTOPILOT_MIND_DECISION_TYPE).toBe('autopilot_action');
    });

    it('lists all 12 actions in a stable order', () => {
      expect(AUTOPILOT_ACTIONS).toEqual([
        'send_offer',
        'send_offer_soft',
        'send_price',
        'send_calendar',
        'handover_human',
        'handle_objection',
        'qualify',
        'try_upsell',
        'send_cta',
        'soft_close_night',
        'auto_reply_night',
        'ai_chat',
      ]);
    });

    it('freezes maps so callers cannot mutate them', () => {
      expect(Object.isFrozen(ACTION_TO_RESPONSE_TYPE)).toBe(true);
      expect(Object.isFrozen(HARDCODED_NIGHT_RESPONSES)).toBe(true);
      expect(Object.isFrozen(RESPONSE_TEMPLATES)).toBe(true);
    });
  });

  describe('readRecord', () => {
    it('returns the object when it is a plain record', () => {
      const obj = { a: 1 };
      expect(readRecord(obj)).toBe(obj);
    });

    it('returns an empty record for null/undefined/primitives', () => {
      expect(readRecord(null)).toEqual({});
      expect(readRecord(undefined)).toEqual({});
      expect(readRecord(42)).toEqual({});
      expect(readRecord('s')).toEqual({});
      expect(readRecord(false)).toEqual({});
    });

    it('still returns the value for arrays (typeof === object)', () => {
      const arr: unknown = [1, 2];
      expect(readRecord(arr)).toBe(arr);
    });
  });

  describe('isNightHour', () => {
    it('treats hours > 22 as night', () => {
      expect(isNightHour(23)).toBe(true);
    });
    it('treats hours < 7 as night', () => {
      expect(isNightHour(0)).toBe(true);
      expect(isNightHour(6)).toBe(true);
    });
    it('treats daytime hours as not night', () => {
      expect(isNightHour(7)).toBe(false);
      expect(isNightHour(12)).toBe(false);
      expect(isNightHour(22)).toBe(false);
    });
  });

  describe('decideNightAction', () => {
    it('returns null when it is not night', () => {
      expect(decideNightAction(false, true)).toBeNull();
      expect(decideNightAction(false, false)).toBeNull();
    });
    it('returns soft_close_night when buying signal at night', () => {
      expect(decideNightAction(true, true)).toBe('soft_close_night');
    });
    it('returns auto_reply_night when no buying signal at night', () => {
      expect(decideNightAction(true, false)).toBe('auto_reply_night');
      expect(decideNightAction(true, undefined)).toBe('auto_reply_night');
    });
  });

  describe('decideBuyingAction', () => {
    it('returns null when there is no buying signal', () => {
      expect(decideBuyingAction(false, true)).toBeNull();
      expect(decideBuyingAction(undefined, true)).toBeNull();
    });
    it('returns send_offer when buying signal at optimal time', () => {
      expect(decideBuyingAction(true, true)).toBe('send_offer');
    });
    it('returns send_offer_soft when buying signal off-peak', () => {
      expect(decideBuyingAction(true, false)).toBe('send_offer_soft');
      expect(decideBuyingAction(true, undefined)).toBe('send_offer_soft');
    });
  });

  describe('decideIntentAction', () => {
    it.each([
      ['question_price', 'send_price'],
      ['scheduling', 'send_calendar'],
      ['complaint', 'handover_human'],
      ['objection', 'handle_objection'],
    ])('maps intent %s -> %s', (intent, expected) => {
      expect(decideIntentAction(intent)).toBe(expected);
    });
    it('returns null for unknown or missing intent', () => {
      expect(decideIntentAction('unknown_intent')).toBeNull();
      expect(decideIntentAction(undefined)).toBeNull();
      expect(decideIntentAction('')).toBeNull();
    });
  });

  describe('decideStageAction', () => {
    it('returns qualify for stage=new', () => {
      expect(decideStageAction('new')).toBe('qualify');
    });
    it('returns try_upsell on closing+positive+no-buying-signal', () => {
      expect(decideStageAction('closing', 'positive', false)).toBe('try_upsell');
    });
    it('returns send_cta on closing when sentiment is not positive', () => {
      expect(decideStageAction('closing', 'neutral', false)).toBe('send_cta');
      expect(decideStageAction('closing', 'negative', false)).toBe('send_cta');
    });
    it('returns send_cta on closing when buying signal is true', () => {
      expect(decideStageAction('closing', 'positive', true)).toBe('send_cta');
    });
    it('returns null for other stages', () => {
      expect(decideStageAction('negotiation', 'positive', true)).toBeNull();
      expect(decideStageAction(undefined)).toBeNull();
    });
  });

  describe('decideActionBaseline', () => {
    const fixedDaytime = new Date('2026-05-28T12:00:00.000Z');
    const fixedNight = new Date('2026-05-28T03:00:00.000Z');

    it('falls back to ai_chat when nothing matches', () => {
      const fakeNow = { getHours: () => 12 } as unknown as Date;
      expect(decideActionBaseline({}, false, fakeNow)).toBe('ai_chat');
    });

    it('uses night precedence over buying when applicable', () => {
      const fakeNight = { getHours: () => 3 } as unknown as Date;
      expect(
        decideActionBaseline({ buyingSignal: true }, true, fakeNight),
      ).toBe('soft_close_night');
    });

    it('uses buying precedence over intent during the day', () => {
      const fakeNoon = { getHours: () => 12 } as unknown as Date;
      expect(
        decideActionBaseline(
          { buyingSignal: true, intent: 'question_price' },
          true,
          fakeNoon,
        ),
      ).toBe('send_offer');
    });

    it('falls through to intent mapping when no night/buying', () => {
      expect(
        decideActionBaseline({ intent: 'scheduling' }, false, fixedDaytime),
      ).toBe('send_calendar');
    });

    it('falls through to stage when night/buying/intent are absent', () => {
      expect(
        decideActionBaseline({ stage: 'new' }, false, fixedDaytime),
      ).toBe('qualify');
    });

    it('uses real Date() when now is omitted', () => {
      // Best-effort smoke test — just ensure no throw and returns a string.
      expect(typeof decideActionBaseline({}, false)).toBe('string');
      // Night-clock cannot be assumed; we don't assert the value.
      expect(typeof fixedNight.getHours()).toBe('number');
    });
  });
});
