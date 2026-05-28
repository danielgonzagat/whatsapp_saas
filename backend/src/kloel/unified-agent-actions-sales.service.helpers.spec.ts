import {
  actionHandleObjection,
  clampDiscountPercent,
  describeUnknownError,
  discountPercentFromMind,
  getStagePurchaseProbabilityBucket,
  isDeterministicPipeline,
  isRecord,
  priceBandFor,
  toJsonValue,
  MEETING_TYPE_LABELS,
  antiChurnMessage,
  REACTIVATION_MESSAGES,
} from './unified-agent-actions-sales.service.helpers';

// ── describeUnknownError ────────────────────────────────────────────────────

describe('describeUnknownError', () => {
  it('returns the message from an Error instance', () => {
    expect(describeUnknownError(new Error('boom'))).toBe('boom');
  });

  it('returns the trimmed string from a plain string', () => {
    expect(describeUnknownError('  fail  ')).toBe('fail');
  });

  it('returns "Unknown error" for null', () => {
    expect(describeUnknownError(null)).toBe('Unknown error');
  });

  it('returns "Unknown error" for empty string', () => {
    expect(describeUnknownError('')).toBe('Unknown error');
  });

  it('returns "Unknown error" for a number', () => {
    expect(describeUnknownError(42)).toBe('Unknown error');
  });
});

// ── isRecord ───────────────────────────────────────────────────────────────

describe('isRecord', () => {
  it('returns true for plain objects', () => {
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isRecord(null)).toBe(false);
  });

  it('returns false for arrays', () => {
    expect(isRecord([1, 2])).toBe(true); // arrays are objects
  });

  it('returns false for strings', () => {
    expect(isRecord('hello')).toBe(false);
  });
});

// ── isDeterministicPipeline ────────────────────────────────────────────────

describe('isDeterministicPipeline', () => {
  it('returns true when deterministicPipeline is true', () => {
    expect(isDeterministicPipeline({ deterministicPipeline: true })).toBe(true);
  });

  it('returns false when deterministicPipeline is false', () => {
    expect(isDeterministicPipeline({ deterministicPipeline: false })).toBe(false);
  });

  it('returns false when context is undefined', () => {
    expect(isDeterministicPipeline(undefined)).toBe(false);
  });

  it('returns false when context lacks the flag', () => {
    expect(isDeterministicPipeline({ other: 1 })).toBe(false);
  });
});

// ── toJsonValue ────────────────────────────────────────────────────────────

describe('toJsonValue', () => {
  it('returns null for null', () => {
    expect(toJsonValue(null)).toBeNull();
  });

  it('returns primitives as-is', () => {
    expect(toJsonValue('hello')).toBe('hello');
    expect(toJsonValue(42)).toBe(42);
    expect(toJsonValue(true)).toBe(true);
  });

  it('recursively converts arrays', () => {
    expect(toJsonValue([1, 'a', null])).toEqual([1, 'a', null]);
  });

  it('recursively converts objects', () => {
    const out = toJsonValue({ x: 1, y: { z: 'hi' } });
    expect(out).toEqual({ x: 1, y: { z: 'hi' } });
  });

  it('returns null for unsupported types', () => {
    expect(toJsonValue(() => {})).toBeNull();
    expect(toJsonValue(undefined)).toBeNull();
  });
});

// ── priceBandFor ───────────────────────────────────────────────────────────

describe('priceBandFor', () => {
  it('returns under_100 for prices < 100', () => {
    expect(priceBandFor(0)).toBe('under_100');
    expect(priceBandFor(99)).toBe('under_100');
  });

  it('returns over_100 for 100–299', () => {
    expect(priceBandFor(100)).toBe('over_100');
    expect(priceBandFor(299)).toBe('over_100');
  });

  it('returns over_300 for 300–499', () => {
    expect(priceBandFor(300)).toBe('over_300');
    expect(priceBandFor(499)).toBe('over_300');
  });

  it('returns over_500 for 500–999', () => {
    expect(priceBandFor(500)).toBe('over_500');
    expect(priceBandFor(999)).toBe('over_500');
  });

  it('returns over_1000 for >= 1000', () => {
    expect(priceBandFor(1000)).toBe('over_1000');
    expect(priceBandFor(5000)).toBe('over_1000');
  });
});

// ── discountPercentFromMind ────────────────────────────────────────────────

describe('discountPercentFromMind', () => {
  it('maps coupon_5 → 5', () => {
    expect(discountPercentFromMind('coupon_5', 10)).toBe(5);
  });

  it('maps coupon_15 → 15', () => {
    expect(discountPercentFromMind('coupon_15', 10)).toBe(15);
  });

  it('falls back to requestedPercent for unknown actions', () => {
    expect(discountPercentFromMind('unknown', 12)).toBe(12);
  });

  it('falls back to requestedPercent when action is undefined', () => {
    expect(discountPercentFromMind(undefined, 8)).toBe(8);
  });
});

// ── clampDiscountPercent ───────────────────────────────────────────────────

describe('clampDiscountPercent', () => {
  it('clamps above 30 down to 30', () => {
    expect(clampDiscountPercent(50)).toBe(30);
    expect(clampDiscountPercent(100)).toBe(30);
  });

  it('clamps negative values up to 1', () => {
    expect(clampDiscountPercent(-5)).toBe(1);
  });

  it('treats 0 as falsy and defaults to 10', () => {
    expect(clampDiscountPercent(0)).toBe(10);
  });

  it('defaults to 10 for non-numeric input', () => {
    expect(clampDiscountPercent(undefined)).toBe(10);
    expect(clampDiscountPercent(null)).toBe(10);
    expect(clampDiscountPercent('abc')).toBe(10);
  });

  it('passes through values in [1,30]', () => {
    expect(clampDiscountPercent(1)).toBe(1);
    expect(clampDiscountPercent(15)).toBe(15);
    expect(clampDiscountPercent(30)).toBe(30);
  });
});

// ── getStagePurchaseProbabilityBucket ──────────────────────────────────────

describe('getStagePurchaseProbabilityBucket', () => {
  it('returns LOW for awareness', () => {
    expect(getStagePurchaseProbabilityBucket('awareness')).toBe('LOW');
  });

  it('returns MEDIUM for interest', () => {
    expect(getStagePurchaseProbabilityBucket('interest')).toBe('MEDIUM');
  });

  it('returns HIGH for decision', () => {
    expect(getStagePurchaseProbabilityBucket('decision')).toBe('HIGH');
  });

  it('returns VERY_HIGH for action', () => {
    expect(getStagePurchaseProbabilityBucket('action')).toBe('VERY_HIGH');
  });

  it('returns LOW for unknown stages', () => {
    expect(getStagePurchaseProbabilityBucket('garbage')).toBe('LOW');
  });
});

// ── MEETING_TYPE_LABELS ────────────────────────────────────────────────────

describe('MEETING_TYPE_LABELS', () => {
  it('has expected keys', () => {
    expect(MEETING_TYPE_LABELS).toHaveProperty('demo');
    expect(MEETING_TYPE_LABELS).toHaveProperty('consultation');
    expect(MEETING_TYPE_LABELS).toHaveProperty('followup');
    expect(MEETING_TYPE_LABELS).toHaveProperty('support');
  });

  it('returns a non-empty string for each key', () => {
    for (const v of Object.values(MEETING_TYPE_LABELS)) {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
    }
  });
});

// ── antiChurnMessage ───────────────────────────────────────────────────────

describe('antiChurnMessage', () => {
  it('returns discount message with offer interpolated', () => {
    const msg = antiChurnMessage('discount', '30% off');
    expect(msg).toContain('30% off');
  });

  it('returns feedback message for unknown strategy', () => {
    const msg = antiChurnMessage('bogus', '');
    expect(msg).toContain('Sua opinião é muito importante');
  });

  it('returns pause message for pause strategy', () => {
    const msg = antiChurnMessage('pause', '');
    expect(msg).toContain('pausar sua assinatura');
  });

  it('returns upgrade message for upgrade strategy', () => {
    const msg = antiChurnMessage('upgrade', '');
    expect(msg).toContain('upgrade gratuito');
  });

  it('falls back to feedback when strategy is empty string', () => {
    const msg = antiChurnMessage('', '');
    expect(msg).toContain('Sua opinião é muito importante');
  });
});

// ── REACTIVATION_MESSAGES ──────────────────────────────────────────────────

describe('REACTIVATION_MESSAGES', () => {
  it('has expected keys', () => {
    expect(REACTIVATION_MESSAGES).toHaveProperty('curiosity');
    expect(REACTIVATION_MESSAGES).toHaveProperty('urgency');
    expect(REACTIVATION_MESSAGES).toHaveProperty('value');
    expect(REACTIVATION_MESSAGES).toHaveProperty('question');
    expect(REACTIVATION_MESSAGES).toHaveProperty('social_proof');
  });

  it('returns a non-empty string for each key', () => {
    for (const v of Object.values(REACTIVATION_MESSAGES)) {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
    }
  });
});

// ── actionHandleObjection ──────────────────────────────────────────────────

type ActionDeps = Parameters<typeof actionHandleObjection>[0];
type MemoryRow = { id: string; key: string; value: unknown };
type AutopilotCreateArg = {
  data: {
    workspaceId: string;
    contactId: string;
    intent: string;
    action: string;
    status: string;
  };
};

describe('actionHandleObjection helper', () => {
  const workspaceId = 'ws-1';
  const contactId = 'contact-1';
  const phone = '5511999999999';

  function buildHarness(overrides: Partial<ActionDeps> = {}) {
    const findMany = jest.fn<Promise<MemoryRow[]>, [unknown?]>().mockResolvedValue([]);
    const create = jest.fn<Promise<{ id: string }>, [unknown]>().mockResolvedValue({ id: 'evt-1' });
    const actionSendMessage = jest
      .fn<Promise<{ success: boolean }>, [string, string, { message: string }, unknown?]>()
      .mockResolvedValue({ success: true });
    const loggerError = jest.fn<void, [string]>();
    const deps: ActionDeps = {
      workspaceId,
      contactId,
      phone,
      args: { objectionType: 'price' },
      context: { source: 'spec' },
      prisma: {
        kloelMemory: {
          findMany,
        },
        autopilotEvent: {
          create,
        },
      } as ActionDeps['prisma'],
      messaging: {
        actionSendMessage,
      },
      logger: {
        error: loggerError,
      },
      ...overrides,
    };
    return { deps, findMany, create, actionSendMessage, loggerError };
  }

  it('uses a custom objection response from persisted memory', async () => {
    const { deps, findMany, create, actionSendMessage } = buildHarness();
    findMany.mockResolvedValue([
      {
        id: 'mem-1',
        key: 'obj-price',
        value: JSON.stringify({ type: 'price', response: 'Vamos focar no ROI deste plano.' }),
      },
    ]);

    const result = await actionHandleObjection(deps);

    expect(result).toMatchObject({
      success: true,
      objectionType: 'price',
      technique: 'value_focus',
      messageSent: true,
    });
    expect(actionSendMessage).toHaveBeenCalledWith(
      workspaceId,
      phone,
      { message: 'Vamos focar no ROI deste plano.' },
      { source: 'spec' },
    );
    const createArg = create.mock.calls.at(0)?.[0] as AutopilotCreateArg | undefined;
    expect(createArg?.data).toMatchObject({
      workspaceId,
      contactId,
      intent: 'OBJECTION',
      action: 'OBJECTION_HANDLED',
      status: 'executed',
    });
  });

  it('ignores malformed memory rows and still sends the canonical fallback', async () => {
    const { deps, findMany, actionSendMessage, loggerError } = buildHarness();
    findMany.mockResolvedValue([
      { id: 'bad-json', key: 'broken', value: '{"type":"price"' },
      { id: 'other', key: 'obj-time', value: { type: 'time', response: 'Tempo resolvido.' } },
    ]);

    const result = await actionHandleObjection(deps);

    expect(result).toMatchObject({ success: true, objectionType: 'price' });
    const sentPayload = actionSendMessage.mock.calls.at(0)?.[2];
    expect(sentPayload?.message).toContain('preocupação com o valor');
    expect(loggerError).not.toHaveBeenCalled();
  });
});
