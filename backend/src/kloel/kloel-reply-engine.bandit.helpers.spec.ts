import {
  chooseReplyStyleArm,
  recordReplyStyleOutcome,
  replyStyleDirective,
  isAdequateReplyForBandit,
  REPLY_STYLE_ARMS,
  REPLY_STYLE_DECISION_TYPE,
} from './kloel-reply-engine.bandit.helpers';
import type { MindBanditService } from './mind/policy/mind-bandit.service';

/**
 * Proves the flag-gated reply-style MindBandit routing: a real chat decision
 * (reply verbosity) routed through the canonical bandit, with a real varying
 * reward (length adequacy). Default OFF → byte-identical hardcoded behavior.
 *
 * @see backend/src/kloel/kloel-reply-engine.bandit.helpers.ts
 */
function makeLogger() {
  return { warn: jest.fn(), log: jest.fn() };
}

function makeBandit(overrides: Partial<MindBanditService> = {}): MindBanditService {
  return {
    choose: jest.fn(),
    register: jest.fn().mockResolvedValue({}),
    recordOutcome: jest.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as MindBanditService;
}

const WS = 'ws-1';
const ORIGINAL = process.env.KLOEL_REPLY_STYLE_BANDIT_ENABLED;

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.KLOEL_REPLY_STYLE_BANDIT_ENABLED;
  } else {
    process.env.KLOEL_REPLY_STYLE_BANDIT_ENABLED = ORIGINAL;
  }
  jest.clearAllMocks();
});

describe('replyStyleDirective', () => {
  it('maps concise/detailed to non-empty directives and balanced to empty (baseline)', () => {
    expect(replyStyleDirective('concise')).toContain('curta');
    expect(replyStyleDirective('detailed')).toContain('detalhada');
    expect(replyStyleDirective('balanced')).toBe('');
    expect(replyStyleDirective('unknown-arm')).toBe('');
  });
});

describe('isAdequateReplyForBandit (reward signal)', () => {
  it('is false for empty/degenerate-short replies and true for adequate ones', () => {
    expect(isAdequateReplyForBandit('')).toBe(false);
    expect(isAdequateReplyForBandit('Olá!')).toBe(false);
    expect(isAdequateReplyForBandit('   ok   ')).toBe(false);
    expect(isAdequateReplyForBandit('Claro! Posso te ajudar com o seu pedido agora.')).toBe(true);
  });
});

describe('chooseReplyStyleArm', () => {
  it('returns null when the flag is OFF (no bandit call → hardcoded behavior)', async () => {
    delete process.env.KLOEL_REPLY_STYLE_BANDIT_ENABLED;
    const bandit = makeBandit();
    const out = await chooseReplyStyleArm(bandit, { workspaceId: WS, logger: makeLogger() });
    expect(out).toBeNull();
    expect(bandit.choose).not.toHaveBeenCalled();
  });

  it('returns null when the service is missing or workspaceId is empty', async () => {
    process.env.KLOEL_REPLY_STYLE_BANDIT_ENABLED = 'true';
    expect(
      await chooseReplyStyleArm(undefined, { workspaceId: WS, logger: makeLogger() }),
    ).toBeNull();
    const bandit = makeBandit();
    expect(await chooseReplyStyleArm(bandit, { workspaceId: '', logger: makeLogger() })).toBeNull();
    expect(
      await chooseReplyStyleArm(bandit, { workspaceId: undefined, logger: makeLogger() }),
    ).toBeNull();
  });

  it('returns the chosen arm + its directive when the flag is ON', async () => {
    process.env.KLOEL_REPLY_STYLE_BANDIT_ENABLED = 'true';
    const bandit = makeBandit({
      choose: jest.fn().mockResolvedValue({
        arm: 'concise',
        decisionType: REPLY_STYLE_DECISION_TYPE,
        workspaceId: WS,
      }),
    });
    const out = await chooseReplyStyleArm(bandit, { workspaceId: WS, logger: makeLogger() });
    expect(out).toEqual({ arm: 'concise', directive: replyStyleDirective('concise') });
    expect(bandit.register).not.toHaveBeenCalled();
  });

  it('self-seeds the arm set when choose finds none, then chooses again', async () => {
    process.env.KLOEL_REPLY_STYLE_BANDIT_ENABLED = 'true';
    const choose = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
      arm: 'balanced',
      decisionType: REPLY_STYLE_DECISION_TYPE,
      workspaceId: WS,
    });
    const bandit = makeBandit({ choose });
    const out = await chooseReplyStyleArm(bandit, { workspaceId: WS, logger: makeLogger() });
    expect(bandit.register).toHaveBeenCalledWith({
      arms: [...REPLY_STYLE_ARMS],
      decisionType: REPLY_STYLE_DECISION_TYPE,
      workspaceId: WS,
    });
    expect(out).toEqual({ arm: 'balanced', directive: '' });
  });

  it('is fail-open: a bandit error returns null and never throws', async () => {
    process.env.KLOEL_REPLY_STYLE_BANDIT_ENABLED = 'true';
    const bandit = makeBandit({ choose: jest.fn().mockRejectedValue(new Error('db down')) });
    const logger = makeLogger();
    await expect(chooseReplyStyleArm(bandit, { workspaceId: WS, logger })).resolves.toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('recordReplyStyleOutcome', () => {
  it('records outcome 1 for a win and 0 for a loss', async () => {
    const bandit = makeBandit();
    await recordReplyStyleOutcome(bandit, {
      workspaceId: WS,
      arm: 'concise',
      won: true,
      logger: makeLogger(),
    });
    expect(bandit.recordOutcome).toHaveBeenCalledWith({
      arm: 'concise',
      decisionType: REPLY_STYLE_DECISION_TYPE,
      outcome: 1,
      workspaceId: WS,
    });
    await recordReplyStyleOutcome(bandit, {
      workspaceId: WS,
      arm: 'detailed',
      won: false,
      logger: makeLogger(),
    });
    expect(bandit.recordOutcome).toHaveBeenLastCalledWith({
      arm: 'detailed',
      decisionType: REPLY_STYLE_DECISION_TYPE,
      outcome: 0,
      workspaceId: WS,
    });
  });

  it('skips when service/workspaceId/arm is missing, and is fail-open on error', async () => {
    const logger = makeLogger();
    await recordReplyStyleOutcome(undefined, {
      workspaceId: WS,
      arm: 'concise',
      won: true,
      logger,
    });
    const bandit = makeBandit();
    await recordReplyStyleOutcome(bandit, { workspaceId: '', arm: 'concise', won: true, logger });
    await recordReplyStyleOutcome(bandit, { workspaceId: WS, arm: '', won: true, logger });
    expect(bandit.recordOutcome).not.toHaveBeenCalled();

    const failing = makeBandit({
      recordOutcome: jest.fn().mockRejectedValue(new Error('db down')),
    });
    await expect(
      recordReplyStyleOutcome(failing, { workspaceId: WS, arm: 'concise', won: true, logger }),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});
