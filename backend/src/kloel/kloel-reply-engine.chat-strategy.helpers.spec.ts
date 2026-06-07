import {
  selectChatStrategyArm,
  recordChatStrategyOutcome,
  isChatStrategyLearnEnabled,
  CHAT_STRATEGY_DECISION_TYPE,
} from './kloel-reply-engine.chat-strategy.helpers';
import type { MindBanditService } from './mind/policy/mind-bandit.service';

/**
 * Proves the flag-gated CLOSURE of the `chat_strategy` bandit loop: the arm the
 * mind signals selected (read-only `selectArm`) is carried to the reply outcome
 * and learns from the reply reward via `recordOutcome`. Default OFF →
 * byte-identical (no select, no record) → bandit stats unchanged.
 *
 * @see backend/src/kloel/kloel-reply-engine.chat-strategy.helpers.ts
 */
function makeLogger() {
  return { warn: jest.fn(), log: jest.fn() };
}

type MindBanditMock = {
  selectArm: jest.Mock;
  recordOutcome: jest.Mock;
};

function makeBandit(overrides: Partial<MindBanditMock> = {}): MindBanditService & MindBanditMock {
  return {
    selectArm: jest.fn(),
    recordOutcome: jest.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as MindBanditService & MindBanditMock;
}

const WS = 'ws-1';
const ORIGINAL = process.env.KLOEL_CHAT_STRATEGY_LEARN;

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.KLOEL_CHAT_STRATEGY_LEARN;
  } else {
    process.env.KLOEL_CHAT_STRATEGY_LEARN = ORIGINAL;
  }
  jest.clearAllMocks();
});

describe('isChatStrategyLearnEnabled (default-OFF gate)', () => {
  it('is false unless the flag is exactly "true"', () => {
    delete process.env.KLOEL_CHAT_STRATEGY_LEARN;
    expect(isChatStrategyLearnEnabled()).toBe(false);
    process.env.KLOEL_CHAT_STRATEGY_LEARN = '1';
    expect(isChatStrategyLearnEnabled()).toBe(false);
    process.env.KLOEL_CHAT_STRATEGY_LEARN = 'false';
    expect(isChatStrategyLearnEnabled()).toBe(false);
    process.env.KLOEL_CHAT_STRATEGY_LEARN = 'true';
    expect(isChatStrategyLearnEnabled()).toBe(true);
  });
});

describe('selectChatStrategyArm', () => {
  it('flag OFF → returns null and never calls selectArm (byte-identical to today)', async () => {
    delete process.env.KLOEL_CHAT_STRATEGY_LEARN;
    const bandit = makeBandit({
      selectArm: jest.fn().mockResolvedValue({ arm: 'scarcity', confidence: 0.7, rationale: 'x' }),
    });
    const out = await selectChatStrategyArm(bandit, { workspaceId: WS, logger: makeLogger() });
    expect(out).toBeNull();
    expect(bandit.selectArm).not.toHaveBeenCalled();
  });

  it('returns null when the service is missing or workspaceId is empty (flag ON)', async () => {
    process.env.KLOEL_CHAT_STRATEGY_LEARN = 'true';
    expect(
      await selectChatStrategyArm(undefined, { workspaceId: WS, logger: makeLogger() }),
    ).toBeNull();
    const bandit = makeBandit();
    expect(
      await selectChatStrategyArm(bandit, { workspaceId: '', logger: makeLogger() }),
    ).toBeNull();
    expect(
      await selectChatStrategyArm(bandit, { workspaceId: undefined, logger: makeLogger() }),
    ).toBeNull();
    expect(bandit.selectArm).not.toHaveBeenCalled();
  });

  it('flag ON → carries the selected arm via the chat_strategy decision type', async () => {
    process.env.KLOEL_CHAT_STRATEGY_LEARN = 'true';
    const bandit = makeBandit({
      selectArm: jest
        .fn()
        .mockResolvedValue({ arm: 'social_proof', confidence: 0.72, rationale: 'r' }),
    });
    const out = await selectChatStrategyArm(bandit, { workspaceId: WS, logger: makeLogger() });
    expect(out).toEqual({ arm: 'social_proof' });
    expect(bandit.selectArm).toHaveBeenCalledWith(WS, CHAT_STRATEGY_DECISION_TYPE);
  });

  it('returns null when selectArm finds no arm', async () => {
    process.env.KLOEL_CHAT_STRATEGY_LEARN = 'true';
    const bandit = makeBandit({ selectArm: jest.fn().mockResolvedValue(null) });
    expect(
      await selectChatStrategyArm(bandit, { workspaceId: WS, logger: makeLogger() }),
    ).toBeNull();
  });

  it('is fail-open: a bandit error returns null and never throws', async () => {
    process.env.KLOEL_CHAT_STRATEGY_LEARN = 'true';
    const bandit = makeBandit({ selectArm: jest.fn().mockRejectedValue(new Error('db down')) });
    const logger = makeLogger();
    await expect(selectChatStrategyArm(bandit, { workspaceId: WS, logger })).resolves.toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('recordChatStrategyOutcome', () => {
  it('records outcome 1 for a win and 0 for a loss on the chat_strategy type', async () => {
    const bandit = makeBandit();
    await recordChatStrategyOutcome(bandit, {
      workspaceId: WS,
      arm: 'social_proof',
      won: true,
      logger: makeLogger(),
    });
    expect(bandit.recordOutcome).toHaveBeenCalledWith({
      arm: 'social_proof',
      decisionType: CHAT_STRATEGY_DECISION_TYPE,
      outcome: 1,
      workspaceId: WS,
    });
    await recordChatStrategyOutcome(bandit, {
      workspaceId: WS,
      arm: 'scarcity',
      won: false,
      logger: makeLogger(),
    });
    expect(bandit.recordOutcome).toHaveBeenLastCalledWith({
      arm: 'scarcity',
      decisionType: CHAT_STRATEGY_DECISION_TYPE,
      outcome: 0,
      workspaceId: WS,
    });
  });

  it('skips when service/workspaceId/arm is missing, and is fail-open on error', async () => {
    const logger = makeLogger();
    await recordChatStrategyOutcome(undefined, {
      workspaceId: WS,
      arm: 'social_proof',
      won: true,
      logger,
    });
    const bandit = makeBandit();
    await recordChatStrategyOutcome(bandit, {
      workspaceId: '',
      arm: 'social_proof',
      won: true,
      logger,
    });
    await recordChatStrategyOutcome(bandit, { workspaceId: WS, arm: '', won: true, logger });
    expect(bandit.recordOutcome).not.toHaveBeenCalled();

    const failing = makeBandit({
      recordOutcome: jest.fn().mockRejectedValue(new Error('db down')),
    });
    await expect(
      recordChatStrategyOutcome(failing, {
        workspaceId: WS,
        arm: 'social_proof',
        won: true,
        logger,
      }),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('loop closes: the selected arm LEARNS from the reward when ON', () => {
  /**
   * A stateful in-memory bandit that models the Beta(alpha,beta) update the real
   * service performs, so we can PROVE the selected arm's stats actually move
   * after a recorded outcome — i.e. the decide→learn loop is closed, not just
   * that recordOutcome was invoked.
   */
  function makeStatefulBandit() {
    const stats: Record<string, { alpha: number; beta: number; wins: number; pulls: number }> = {
      social_proof: { alpha: 1, beta: 1, wins: 0, pulls: 5 },
      scarcity: { alpha: 1, beta: 1, wins: 0, pulls: 5 },
    };
    return {
      stats,
      selectArm: jest.fn(async (_ws: string, _type: string) => ({
        arm: 'social_proof',
        confidence: stats.social_proof.alpha / (stats.social_proof.alpha + stats.social_proof.beta),
        rationale: 'r',
      })),
      recordOutcome: jest.fn(async (input: { arm: string; outcome: 0 | 1 }) => {
        const s = stats[input.arm];
        s.alpha += input.outcome;
        s.beta += 1 - input.outcome;
        s.wins += input.outcome;
      }),
    } as unknown as MindBanditService & {
      stats: typeof stats;
      selectArm: jest.Mock;
      recordOutcome: jest.Mock;
    };
  }

  it('flag ON: select carries the arm and a win bumps that arm alpha/wins', async () => {
    process.env.KLOEL_CHAT_STRATEGY_LEARN = 'true';
    const bandit = makeStatefulBandit();
    const before = { ...bandit.stats.social_proof };

    const selected = await selectChatStrategyArm(bandit, { workspaceId: WS, logger: makeLogger() });
    expect(selected).toEqual({ arm: 'social_proof' });

    await recordChatStrategyOutcome(bandit, {
      workspaceId: WS,
      arm: selected.arm,
      won: true,
      logger: makeLogger(),
    });

    expect(bandit.stats.social_proof.alpha).toBe(before.alpha + 1);
    expect(bandit.stats.social_proof.wins).toBe(before.wins + 1);
    expect(bandit.stats.social_proof.beta).toBe(before.beta);
    // The other arm is untouched — only the SELECTED arm learned.
    expect(bandit.stats.scarcity).toEqual({ alpha: 1, beta: 1, wins: 0, pulls: 5 });
  });

  it('flag OFF: no select, no record → both arms stats are byte-identical (no learning)', async () => {
    delete process.env.KLOEL_CHAT_STRATEGY_LEARN;
    const bandit = makeStatefulBandit();
    const snapshot = JSON.stringify(bandit.stats);

    const selected = await selectChatStrategyArm(bandit, { workspaceId: WS, logger: makeLogger() });
    expect(selected).toBeNull();
    expect(bandit.selectArm).not.toHaveBeenCalled();
    expect(bandit.recordOutcome).not.toHaveBeenCalled();
    expect(JSON.stringify(bandit.stats)).toBe(snapshot);
  });
});
