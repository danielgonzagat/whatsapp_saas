import {
  isCommerceDecisionLinkEnabled,
  buildCommerceDecisionLinkKey,
  recordCommerceDecisionLink,
  closeCommerceDecisionLink,
  COMMERCE_DECISION_LINK_TYPE,
} from './commerce-decision-link.flag';
import type { DecisionOutcomeService } from './decision-outcome.service';

/**
 * Proves the flag-gated chat→commerce CORRELATION closure. A chat reply for a
 * lead opens a `commerce_decision_link` decision keyed by a DETERMINISTIC
 * lead-stable outcomeKey; a later PAID order for that same lead (carrying the
 * same leadId as `capturedLeadId`) recomputes the identical key and closes the
 * originating chat decision as a WIN. The loop is therefore CLOSED only when the
 * producer key and the closer key match — which the deterministic builder
 * guarantees for the same (workspaceId, leadId).
 *
 * Default OFF → byte-identical (no recordDecision, no closeOutcome).
 *
 * @see backend/src/kloel/commerce-decision-link.flag.ts
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

/** Flush the fire-and-forget promise chains inside the producer/closer. */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

const WS = 'ws-1';
const LEAD = 'lead-42';
const ORIGINAL = process.env.KLOEL_COMMERCE_DECISION_LINK;

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.KLOEL_COMMERCE_DECISION_LINK;
  } else {
    process.env.KLOEL_COMMERCE_DECISION_LINK = ORIGINAL;
  }
  jest.clearAllMocks();
});

describe('isCommerceDecisionLinkEnabled (default-OFF gate)', () => {
  it('is false unless the flag is exactly "true"', () => {
    delete process.env.KLOEL_COMMERCE_DECISION_LINK;
    expect(isCommerceDecisionLinkEnabled()).toBe(false);
    process.env.KLOEL_COMMERCE_DECISION_LINK = '1';
    expect(isCommerceDecisionLinkEnabled()).toBe(false);
    process.env.KLOEL_COMMERCE_DECISION_LINK = 'false';
    expect(isCommerceDecisionLinkEnabled()).toBe(false);
    process.env.KLOEL_COMMERCE_DECISION_LINK = 'TRUE';
    expect(isCommerceDecisionLinkEnabled()).toBe(false);
    process.env.KLOEL_COMMERCE_DECISION_LINK = 'true';
    expect(isCommerceDecisionLinkEnabled()).toBe(true);
  });
});

describe('buildCommerceDecisionLinkKey (deterministic lead-stable join)', () => {
  it('is deterministic and identical for the same (workspaceId, leadId)', () => {
    const a = buildCommerceDecisionLinkKey(WS, LEAD);
    const b = buildCommerceDecisionLinkKey(WS, LEAD);
    expect(a).toBe('commerce-link:ws-1:lead-42');
    expect(a).toBe(b);
  });

  it('differs across leads / workspaces', () => {
    expect(buildCommerceDecisionLinkKey(WS, 'lead-A')).not.toBe(
      buildCommerceDecisionLinkKey(WS, 'lead-B'),
    );
    expect(buildCommerceDecisionLinkKey('ws-A', LEAD)).not.toBe(
      buildCommerceDecisionLinkKey('ws-B', LEAD),
    );
  });

  it('returns null when either id is missing', () => {
    expect(buildCommerceDecisionLinkKey(undefined, LEAD)).toBeNull();
    expect(buildCommerceDecisionLinkKey(WS, null)).toBeNull();
    expect(buildCommerceDecisionLinkKey('', LEAD)).toBeNull();
    expect(buildCommerceDecisionLinkKey(WS, '')).toBeNull();
  });
});

describe('flag OFF (byte-identical to today)', () => {
  it('recordCommerceDecisionLink never records when the flag is unset', () => {
    delete process.env.KLOEL_COMMERCE_DECISION_LINK;
    const decisionOutcome = makeDecisionOutcome();
    recordCommerceDecisionLink(decisionOutcome, makeLogger(), { workspaceId: WS, leadId: LEAD });
    expect(decisionOutcome.recordDecision).not.toHaveBeenCalled();
  });

  it('recordCommerceDecisionLink never records when the flag is "false"', () => {
    process.env.KLOEL_COMMERCE_DECISION_LINK = 'false';
    const decisionOutcome = makeDecisionOutcome();
    recordCommerceDecisionLink(decisionOutcome, makeLogger(), { workspaceId: WS, leadId: LEAD });
    expect(decisionOutcome.recordDecision).not.toHaveBeenCalled();
  });

  it('closeCommerceDecisionLink never closes when the flag is OFF', () => {
    delete process.env.KLOEL_COMMERCE_DECISION_LINK;
    const decisionOutcome = makeDecisionOutcome();
    closeCommerceDecisionLink(decisionOutcome, makeLogger(), {
      workspaceId: WS,
      capturedLeadId: LEAD,
    });
    expect(decisionOutcome.closeOutcome).not.toHaveBeenCalled();
  });
});

describe('flag ON — producer opens a commerce_decision_link decision', () => {
  beforeEach(() => {
    process.env.KLOEL_COMMERCE_DECISION_LINK = 'true';
  });

  it('records the decision keyed by the deterministic lead-stable outcomeKey', async () => {
    const decisionOutcome = makeDecisionOutcome();
    recordCommerceDecisionLink(decisionOutcome, makeLogger(), {
      workspaceId: WS,
      leadId: LEAD,
      surface: 'whatsapp-lead-processor',
    });
    await flush();

    expect(decisionOutcome.recordDecision).toHaveBeenCalledTimes(1);
    const recordArg = decisionOutcome.recordDecision.mock.calls[0][0] as {
      workspaceId: string;
      decisionType: string;
      chosenAction: string;
      baselineAction: string;
      outcomeKey: string;
      expectedWindow: number;
      contextSnapshot: Record<string, unknown>;
    };
    expect(recordArg.workspaceId).toBe(WS);
    expect(recordArg.decisionType).toBe(COMMERCE_DECISION_LINK_TYPE);
    expect(recordArg.chosenAction).toBe('engage');
    expect(recordArg.baselineAction).toBe('silence');
    expect(recordArg.expectedWindow).toBe(1);
    expect(recordArg.outcomeKey).toBe('commerce-link:ws-1:lead-42');
    expect(recordArg.contextSnapshot).toMatchObject({
      surface: 'whatsapp-lead-processor',
      channel: 'whatsapp',
      leadId: LEAD,
    });
    // Producer leaves the row OPEN — it must NOT close it itself.
    expect(decisionOutcome.closeOutcome).not.toHaveBeenCalled();
  });

  it('no-ops when the service is missing or the workspace/lead id is empty', () => {
    const decisionOutcome = makeDecisionOutcome();
    recordCommerceDecisionLink(undefined, makeLogger(), { workspaceId: WS, leadId: LEAD });
    recordCommerceDecisionLink(decisionOutcome, makeLogger(), { workspaceId: '', leadId: LEAD });
    recordCommerceDecisionLink(decisionOutcome, makeLogger(), { workspaceId: WS, leadId: '' });
    expect(decisionOutcome.recordDecision).not.toHaveBeenCalled();
  });

  it('is fail-open: a recordDecision error is swallowed and logged, never thrown', async () => {
    const logger = makeLogger();
    const decisionOutcome = makeDecisionOutcome({
      recordDecision: jest.fn().mockRejectedValue(new Error('db down')),
    });
    expect(() =>
      recordCommerceDecisionLink(decisionOutcome, logger, { workspaceId: WS, leadId: LEAD }),
    ).not.toThrow();
    await flush();
    expect(logger.warn).toHaveBeenCalledWith(
      'kloel_commerce_decision_link_record_skipped',
      expect.objectContaining({ workspaceId: WS, leadId: LEAD }),
    );
  });
});

describe('flag ON — closer resolves the originating chat decision as a WIN', () => {
  beforeEach(() => {
    process.env.KLOEL_COMMERCE_DECISION_LINK = 'true';
  });

  it('closes the decision keyed by the SAME deterministic key as the producer', async () => {
    const decisionOutcome = makeDecisionOutcome();
    closeCommerceDecisionLink(decisionOutcome, makeLogger(), {
      workspaceId: WS,
      capturedLeadId: LEAD,
    });
    await flush();

    expect(decisionOutcome.closeOutcome).toHaveBeenCalledTimes(1);
    const closeArg = decisionOutcome.closeOutcome.mock.calls[0][0] as {
      outcomeKey: string;
      outcomeName: string;
      wonVsBaseline: boolean;
    };
    expect(closeArg.outcomeKey).toBe('commerce-link:ws-1:lead-42');
    expect(closeArg.outcomeName).toBe('commerce.payment.approved');
    expect(closeArg.wonVsBaseline).toBe(true);
  });

  it('no-ops when capturedLeadId is null/undefined (anonymous checkout)', () => {
    const decisionOutcome = makeDecisionOutcome();
    closeCommerceDecisionLink(decisionOutcome, makeLogger(), {
      workspaceId: WS,
      capturedLeadId: null,
    });
    closeCommerceDecisionLink(decisionOutcome, makeLogger(), {
      workspaceId: WS,
      capturedLeadId: undefined,
    });
    expect(decisionOutcome.closeOutcome).not.toHaveBeenCalled();
  });

  it('is fail-open: a closeOutcome error is swallowed and logged, never thrown', async () => {
    const logger = makeLogger();
    const decisionOutcome = makeDecisionOutcome({
      closeOutcome: jest.fn().mockRejectedValue(new Error('db down')),
    });
    expect(() =>
      closeCommerceDecisionLink(decisionOutcome, logger, {
        workspaceId: WS,
        capturedLeadId: LEAD,
      }),
    ).not.toThrow();
    await flush();
    expect(logger.warn).toHaveBeenCalledWith(
      'kloel_commerce_decision_link_close_skipped',
      expect.objectContaining({ workspaceId: WS }),
    );
  });
});

describe('end-to-end loop closure (producer key === closer key)', () => {
  beforeEach(() => {
    process.env.KLOEL_COMMERCE_DECISION_LINK = 'true';
  });

  it('a sale for the chatted lead closes the very decision the chat opened', async () => {
    let openedKey = '';
    const recordDecision = jest.fn(async (input: { outcomeKey: string }) => {
      openedKey = input.outcomeKey;
    });
    const closeOutcome = jest.fn().mockResolvedValue(undefined);
    const decisionOutcome = makeDecisionOutcome({ recordDecision, closeOutcome });

    // 1) Chat time: the lead is engaged, opening a commerce_decision_link decision.
    recordCommerceDecisionLink(decisionOutcome, makeLogger(), { workspaceId: WS, leadId: LEAD });
    await flush();
    expect(openedKey).toBe('commerce-link:ws-1:lead-42');

    // 2) Sale time: the paid order carries the same leadId as capturedLeadId.
    closeCommerceDecisionLink(decisionOutcome, makeLogger(), {
      workspaceId: WS,
      capturedLeadId: LEAD,
    });
    await flush();

    // The loop CLOSES: the close targets the EXACT key the producer opened.
    const closeArg = closeOutcome.mock.calls[0][0] as {
      outcomeKey: string;
      wonVsBaseline: boolean;
    };
    expect(closeArg.outcomeKey).toBe(openedKey);
    expect(closeArg.wonVsBaseline).toBe(true);
  });

  it('a sale for a DIFFERENT lead does NOT close this lead’s decision (key mismatch)', async () => {
    let openedKey = '';
    const recordDecision = jest.fn(async (input: { outcomeKey: string }) => {
      openedKey = input.outcomeKey;
    });
    const closeOutcome = jest.fn().mockResolvedValue(undefined);
    const decisionOutcome = makeDecisionOutcome({ recordDecision, closeOutcome });

    recordCommerceDecisionLink(decisionOutcome, makeLogger(), { workspaceId: WS, leadId: LEAD });
    await flush();

    closeCommerceDecisionLink(decisionOutcome, makeLogger(), {
      workspaceId: WS,
      capturedLeadId: 'a-totally-different-lead',
    });
    await flush();

    const closeArg = closeOutcome.mock.calls[0][0] as { outcomeKey: string };
    expect(closeArg.outcomeKey).not.toBe(openedKey);
  });
});
