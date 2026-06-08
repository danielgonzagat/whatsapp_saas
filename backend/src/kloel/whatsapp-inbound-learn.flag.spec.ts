import {
  isWhatsAppInboundLearnEnabled,
  recordWhatsAppInboundOutcome,
  WHATSAPP_REPLY_DECISION_TYPE,
} from './whatsapp-inbound-learn.flag';
import type { DecisionOutcomeService } from './decision-outcome.service';
import { castMock } from '../../test/helpers/cast-mock';

/**
 * Proves the flag-gated CLOSURE of the WhatsApp-inbound learning loop. The
 * production WhatsApp reply seam (KloelLeadProcessorService.processWhatsAppMessage)
 * produces a reply but historically NEVER recorded a decision/outcome, so it sat
 * OUTSIDE the bandit loop the chat path already joins. This module records +
 * closes a `whatsapp_reply` decision with the SAME reply-adequacy reward.
 *
 * Default OFF → byte-identical (no recordDecision, no closeOutcome).
 *
 * @see backend/src/kloel/whatsapp-inbound-learn.flag.ts
 */
function makeLogger() {
  return { warn: jest.fn() };
}

type DecisionOutcomeMock = {
  recordDecision: jest.Mock;
  closeOutcome: jest.Mock;
};

function makeDecisionOutcome(
  overrides: Partial<DecisionOutcomeMock> = {},
): DecisionOutcomeService & DecisionOutcomeMock {
  return {
    recordDecision: jest.fn().mockResolvedValue(undefined),
    closeOutcome: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as DecisionOutcomeService & DecisionOutcomeMock;
}

/** Flush the fire-and-forget async IIFE inside recordWhatsAppInboundOutcome. */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

const WS = 'ws-1';
const ADEQUATE_REPLY = 'Olá! Claro, posso te ajudar com isso agora mesmo.';
const SHORT_REPLY = 'Oi';
const ORIGINAL = process.env.KLOEL_WHATSAPP_INBOUND_LEARN;

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.KLOEL_WHATSAPP_INBOUND_LEARN;
  } else {
    process.env.KLOEL_WHATSAPP_INBOUND_LEARN = ORIGINAL;
  }
  jest.clearAllMocks();
});

describe('isWhatsAppInboundLearnEnabled (default-OFF gate)', () => {
  it('is false unless the flag is exactly "true"', () => {
    delete process.env.KLOEL_WHATSAPP_INBOUND_LEARN;
    expect(isWhatsAppInboundLearnEnabled()).toBe(false);
    process.env.KLOEL_WHATSAPP_INBOUND_LEARN = '1';
    expect(isWhatsAppInboundLearnEnabled()).toBe(false);
    process.env.KLOEL_WHATSAPP_INBOUND_LEARN = 'false';
    expect(isWhatsAppInboundLearnEnabled()).toBe(false);
    process.env.KLOEL_WHATSAPP_INBOUND_LEARN = 'TRUE';
    expect(isWhatsAppInboundLearnEnabled()).toBe(false);
    process.env.KLOEL_WHATSAPP_INBOUND_LEARN = 'true';
    expect(isWhatsAppInboundLearnEnabled()).toBe(true);
  });
});

describe('recordWhatsAppInboundOutcome — flag OFF (byte-identical to today)', () => {
  it('never records or closes any decision when the flag is unset', async () => {
    delete process.env.KLOEL_WHATSAPP_INBOUND_LEARN;
    const decisionOutcome = makeDecisionOutcome();
    recordWhatsAppInboundOutcome(decisionOutcome, makeLogger(), {
      workspaceId: WS,
      reply: ADEQUATE_REPLY,
    });
    await flush();
    expect(decisionOutcome.recordDecision).not.toHaveBeenCalled();
    expect(decisionOutcome.closeOutcome).not.toHaveBeenCalled();
  });

  it('never records or closes when the flag is "false"', async () => {
    process.env.KLOEL_WHATSAPP_INBOUND_LEARN = 'false';
    const decisionOutcome = makeDecisionOutcome();
    recordWhatsAppInboundOutcome(decisionOutcome, makeLogger(), {
      workspaceId: WS,
      reply: ADEQUATE_REPLY,
    });
    await flush();
    expect(decisionOutcome.recordDecision).not.toHaveBeenCalled();
    expect(decisionOutcome.closeOutcome).not.toHaveBeenCalled();
  });
});

describe('recordWhatsAppInboundOutcome — flag ON (loop closes)', () => {
  beforeEach(() => {
    process.env.KLOEL_WHATSAPP_INBOUND_LEARN = 'true';
  });

  it('records a whatsapp_reply decision and closes it as a WIN for an adequate reply', async () => {
    const decisionOutcome = makeDecisionOutcome();
    recordWhatsAppInboundOutcome(decisionOutcome, makeLogger(), {
      workspaceId: WS,
      reply: ADEQUATE_REPLY,
      surface: 'whatsapp-lead-processor',
    });
    await flush();

    expect(decisionOutcome.recordDecision).toHaveBeenCalledTimes(1);
    const recordArg = castMock<
      [
        {
          workspaceId: string;
          decisionType: string;
          chosenAction: string;
          baselineAction: string;
          outcomeKey: string;
          expectedWindow: number;
          contextSnapshot: Record<string, unknown>;
        },
      ]
    >(decisionOutcome.recordDecision.mock.calls[0])[0];
    expect(recordArg.workspaceId).toBe(WS);
    expect(recordArg.decisionType).toBe(WHATSAPP_REPLY_DECISION_TYPE);
    expect(recordArg.chosenAction).toBe('engage');
    expect(recordArg.baselineAction).toBe('silence');
    expect(recordArg.expectedWindow).toBe(1);
    expect(recordArg.outcomeKey).toMatch(/^whatsapp:ws-1:\d+:[A-Za-z0-9]+$/);
    expect(recordArg.contextSnapshot).toMatchObject({
      surface: 'whatsapp-lead-processor',
      channel: 'whatsapp',
    });

    // Loop CLOSES: the SAME outcomeKey is closed as a win (adequate reply).
    expect(decisionOutcome.closeOutcome).toHaveBeenCalledTimes(1);
    const closeArg = castMock<
      [{ outcomeKey: string; outcomeName: string; wonVsBaseline: boolean }]
    >(decisionOutcome.closeOutcome.mock.calls[0])[0];
    expect(closeArg.outcomeKey).toBe(recordArg.outcomeKey);
    expect(closeArg.wonVsBaseline).toBe(true);
    expect(closeArg.outcomeName).toBe('whatsapp.reply_adequate');
  });

  it('closes as a LOSS when the reply is too short to be adequate', async () => {
    const decisionOutcome = makeDecisionOutcome();
    recordWhatsAppInboundOutcome(decisionOutcome, makeLogger(), {
      workspaceId: WS,
      reply: SHORT_REPLY,
    });
    await flush();

    expect(decisionOutcome.recordDecision).toHaveBeenCalledTimes(1);
    const closeArg = castMock<[{ wonVsBaseline: boolean; outcomeName: string }]>(
      decisionOutcome.closeOutcome.mock.calls[0],
    )[0];
    expect(closeArg.wonVsBaseline).toBe(false);
    expect(closeArg.outcomeName).toBe('whatsapp.reply_inadequate');
  });

  it('records then closes in order, threading the same outcomeKey', async () => {
    const order: string[] = [];
    let recordedKey = '';
    const decisionOutcome = makeDecisionOutcome({
      recordDecision: jest.fn(async (input: { outcomeKey: string }) => {
        recordedKey = input.outcomeKey;
        order.push('record');
      }),
      closeOutcome: jest.fn(async (input: { outcomeKey: string }) => {
        order.push(`close:${input.outcomeKey === recordedKey ? 'same-key' : 'mismatch'}`);
      }),
    });
    recordWhatsAppInboundOutcome(decisionOutcome, makeLogger(), {
      workspaceId: WS,
      reply: ADEQUATE_REPLY,
    });
    await flush();
    expect(order).toEqual(['record', 'close:same-key']);
  });

  it('no-ops when the service is missing, workspaceId is empty, or the reply is empty', async () => {
    const decisionOutcome = makeDecisionOutcome();
    recordWhatsAppInboundOutcome(undefined, makeLogger(), {
      workspaceId: WS,
      reply: ADEQUATE_REPLY,
    });
    recordWhatsAppInboundOutcome(decisionOutcome, makeLogger(), {
      workspaceId: '',
      reply: ADEQUATE_REPLY,
    });
    recordWhatsAppInboundOutcome(decisionOutcome, makeLogger(), { workspaceId: WS, reply: '' });
    await flush();
    expect(decisionOutcome.recordDecision).not.toHaveBeenCalled();
    expect(decisionOutcome.closeOutcome).not.toHaveBeenCalled();
  });

  it('is fail-open: a recordDecision error is swallowed and logged, never thrown', async () => {
    const logger = makeLogger();
    const decisionOutcome = makeDecisionOutcome({
      recordDecision: jest.fn().mockRejectedValue(new Error('db down')),
    });
    expect(() =>
      recordWhatsAppInboundOutcome(decisionOutcome, logger, {
        workspaceId: WS,
        reply: ADEQUATE_REPLY,
      }),
    ).not.toThrow();
    await flush();
    expect(decisionOutcome.closeOutcome).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'kloel_whatsapp_inbound_learn_skipped',
      expect.objectContaining({ workspaceId: WS }),
    );
  });
});
