import {
  AUTOPILOT_ACTIONS,
  autopilotOutcomeKey,
  autopilotSubject,
  buildMindActionContext,
  buildMindActionOptions,
} from './autopilot-cycle-executor.helpers';

describe('autopilot-cycle-executor.helpers — conversation', () => {
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
});
