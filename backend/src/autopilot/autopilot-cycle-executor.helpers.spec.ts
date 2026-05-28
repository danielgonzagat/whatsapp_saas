import {
  ACTION_TO_RESPONSE_TYPE,
  AUTOPILOT_ACTIONS,
  AUTOPILOT_MIND_DECISION_TYPE,
  autopilotOutcomeKey,
  autopilotSubject,
  buildMindActionContext,
  buildMindActionOptions,
  decideActionBaseline,
  decideBuyingAction,
  decideIntentAction,
  decideNightAction,
  decideStageAction,
  formatProductContext,
  formatProductLine,
  HARDCODED_NIGHT_RESPONSES,
  isCommercialAction,
  isNightHour,
  readRecord,
  RESPONSE_TEMPLATES,
  resolveHardcodedNightResponse,
  resolveResponseTemplate,
  resolveResponseType,
} from './autopilot-cycle-executor.helpers';

describe('autopilot-cycle-executor.helpers', () => {
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

  describe('autopilotSubject', () => {
    it('prefers contact.id when present', () => {
      expect(
        autopilotSubject({
          id: 'c1',
          workspaceId: 'w',
          contact: { id: 'ct1' },
          messages: [],
        }),
      ).toBe('contact:ct1');
    });
    it('falls back to contactId', () => {
      expect(
        autopilotSubject({
          id: 'c1',
          workspaceId: 'w',
          contact: null,
          contactId: 'ct2',
          messages: [],
        }),
      ).toBe('contact:ct2');
    });
    it('falls back to conversation id when no contact info', () => {
      expect(
        autopilotSubject({
          id: 'conv-99',
          workspaceId: 'w',
          contact: null,
          messages: [],
        }),
      ).toBe('conversation:conv-99');
    });
  });

  describe('autopilotOutcomeKey', () => {
    it('uses the latest INBOUND createdAt when available', () => {
      const inboundAt = new Date('2026-05-28T10:00:00.000Z');
      const key = autopilotOutcomeKey({
        id: 'conv-1',
        workspaceId: 'ws-1',
        contact: { id: 'c' },
        messages: [
          { direction: 'OUTBOUND', createdAt: new Date('2026-05-27T00:00:00Z') },
          { direction: 'INBOUND', createdAt: inboundAt },
        ],
      });
      expect(key).toBe(
        `autopilot_action:ws-1:conv-1:${inboundAt.toISOString()}`,
      );
    });

    it('falls back to "no-inbound" suffix when there are no inbound messages', () => {
      expect(
        autopilotOutcomeKey({
          id: 'conv-2',
          workspaceId: 'ws-2',
          contact: { id: 'c' },
          messages: [
            { direction: 'OUTBOUND', createdAt: new Date('2026-05-27T00:00:00Z') },
          ],
        }),
      ).toBe('autopilot_action:ws-2:conv-2:no-inbound');
    });

    it('falls back to "no-inbound" when createdAt is null on the inbound', () => {
      expect(
        autopilotOutcomeKey({
          id: 'conv-3',
          workspaceId: 'ws-3',
          contact: { id: 'c' },
          messages: [{ direction: 'INBOUND', createdAt: null }],
        }),
      ).toBe('autopilot_action:ws-3:conv-3:no-inbound');
    });
  });

  describe('buildMindActionContext', () => {
    it('produces the canonical mind decision context', () => {
      const fakeNow = { getHours: () => 14 } as unknown as Date;
      const inboundAt = new Date('2026-05-28T10:00:00.000Z');
      const ctx = buildMindActionContext(
        {
          intent: 'question_price',
          sentiment: 'positive',
          buyingSignal: true,
          stage: 'closing',
        },
        {
          id: 'conv-1',
          workspaceId: 'ws-1',
          contact: { id: 'ct-1' },
          messages: [{ direction: 'INBOUND', createdAt: inboundAt }],
        },
        true,
        fakeNow,
      );
      expect(ctx).toEqual({
        channel: 'whatsapp',
        conversationId: 'conv-1',
        contactId: 'ct-1',
        hour: 14,
        intent: 'question_price',
        sentiment: 'positive',
        buyingSignal: true,
        stage: 'closing',
        isOptimalTime: true,
        lastInboundAt: inboundAt.toISOString(),
      });
    });

    it('fills defaults when analysis fields are missing', () => {
      const fakeNow = { getHours: () => 9 } as unknown as Date;
      const ctx = buildMindActionContext(
        {},
        {
          id: 'conv-x',
          workspaceId: 'ws-x',
          contact: null,
          contactId: null,
          messages: [],
        },
        false,
        fakeNow,
      );
      expect(ctx).toMatchObject({
        intent: 'unknown',
        sentiment: 'neutral',
        buyingSignal: false,
        stage: 'unknown',
        contactId: null,
        lastInboundAt: null,
        isOptimalTime: false,
        hour: 9,
      });
    });

    it('treats non-true buyingSignal as false (===)', () => {
      const fakeNow = { getHours: () => 9 } as unknown as Date;
      const ctx = buildMindActionContext(
        { buyingSignal: undefined },
        {
          id: 'c',
          workspaceId: 'w',
          contact: { id: 'a' },
          messages: [],
        },
        false,
        fakeNow,
      );
      expect(ctx.buyingSignal).toBe(false);
    });
  });

  describe('buildMindActionOptions', () => {
    it('produces one option per AUTOPILOT_ACTIONS entry with a merged context', () => {
      const baseContext = buildMindActionContext(
        { intent: 'greeting' },
        { id: 'c', workspaceId: 'w', contact: { id: 'a' }, messages: [] },
        false,
        { getHours: () => 10 } as unknown as Date,
      );
      const options = buildMindActionOptions(baseContext);
      expect(options).toHaveLength(AUTOPILOT_ACTIONS.length);
      expect(options[0]).toEqual({
        action: 'send_offer',
        predicate: 'P(success|autopilot_action,intent,stage,channel,hour)',
        context: { ...baseContext, action: 'send_offer' },
      });
      const actions = options.map((o) => o.action);
      expect(actions).toEqual(Array.from(AUTOPILOT_ACTIONS));
    });
  });

  describe('isCommercialAction', () => {
    it.each(['offer', 'offer_soft', 'price', 'upsell', 'lead_unlocker'])(
      'flags %s as commercial',
      (t) => {
        expect(isCommercialAction(t)).toBe(true);
      },
    );
    it.each(['chat', 'qualify', 'objection', 'follow_up', 'random'])(
      'does not flag %s as commercial',
      (t) => {
        expect(isCommercialAction(t)).toBe(false);
      },
    );
  });

  describe('resolveResponseType', () => {
    it('returns the mapped type for known actions', () => {
      expect(resolveResponseType('send_offer')).toBe('offer');
      expect(resolveResponseType('try_upsell')).toBe('upsell');
      expect(resolveResponseType('ai_chat')).toBe('chat');
    });
    it('returns null for unmapped actions', () => {
      expect(resolveResponseType('send_calendar')).toBeNull();
      expect(resolveResponseType('handover_human')).toBeNull();
      expect(resolveResponseType('soft_close_night')).toBeNull();
      expect(resolveResponseType('totally_unknown')).toBeNull();
    });
  });

  describe('resolveHardcodedNightResponse', () => {
    it('returns the canned text for night actions', () => {
      expect(resolveHardcodedNightResponse('soft_close_night')).toContain(
        'Já deixei tudo preparado',
      );
      expect(resolveHardcodedNightResponse('auto_reply_night')).toContain(
        'Amanhã 8h te respondo',
      );
    });
    it('returns null for other actions', () => {
      expect(resolveHardcodedNightResponse('send_offer')).toBeNull();
      expect(resolveHardcodedNightResponse('')).toBeNull();
    });
  });

  describe('resolveResponseTemplate', () => {
    it('returns the matching template', () => {
      expect(resolveResponseTemplate('offer')).toBe(RESPONSE_TEMPLATES.offer);
      expect(resolveResponseTemplate('qualify')).toBe(
        RESPONSE_TEMPLATES.qualify,
      );
    });
    it('falls back to the chat template for unknown types', () => {
      expect(resolveResponseTemplate('not_a_real_type')).toBe(
        RESPONSE_TEMPLATES.chat,
      );
    });
  });

  describe('formatProductLine', () => {
    it('formats BRL products with the R$ prefix and 2 decimals', () => {
      expect(
        formatProductLine({
          name: 'Curso X',
          price: 199.9,
          currency: 'BRL',
          description: 'Acesso vitalício',
        }),
      ).toBe('- Curso X: R$199.90 — Acesso vitalício');
    });
    it('formats non-BRL with currency code prefix', () => {
      expect(
        formatProductLine({
          name: 'Plan',
          price: 9.95,
          currency: 'USD',
          description: null,
        }),
      ).toBe('- Plan: USD 9.95');
    });
    it('omits the description suffix when description is null', () => {
      expect(
        formatProductLine({
          name: 'A',
          price: 1,
          currency: 'BRL',
          description: null,
        }),
      ).toBe('- A: R$1.00');
    });
  });

  describe('formatProductContext', () => {
    it('joins product lines with newlines preserving order', () => {
      const out = formatProductContext([
        { name: 'A', price: 10, currency: 'BRL', description: null },
        { name: 'B', price: 20, currency: 'USD', description: 'Pro' },
      ]);
      expect(out).toBe('- A: R$10.00\n- B: USD 20.00 — Pro');
    });
    it('returns empty string for empty input', () => {
      expect(formatProductContext([])).toBe('');
    });
  });
});
