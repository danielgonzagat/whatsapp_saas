import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * P2 wiring test: `dispatchAutopilotAction` (the canonical autopilot
 * action-dispatch site that every external caller funnels through via
 * `executeAction` / `sendDirectAutopilotText`) must ALSO emit ONE
 * `cognition.autopilot.action_executed` percept for every terminal outcome —
 * SENT / FAILED / SKIPPED — mirroring the already-wired `runCiaAction` path.
 *
 * The percept emit itself is flag-gated + best-effort inside
 * {@link emitAutopilotActionExecutedPercept} (covered by
 * autopilot-percept-emit.helper.spec.ts); here we assert the dispatch site
 * INVOKES it with the correct outcome mapping and never lets it affect dispatch.
 */

// ── Mocks (paths resolved relative to this test file) ──────────────────────

// Shared spies referenced inside hoisted vi.mock factories must be created via
// vi.hoisted (the factories run before module-scope const initialization).
const { emitPercept, beginAutonomyExecution, dispatchAutonomousReplyPlan } = vi.hoisted(() => ({
  emitPercept: vi.fn().mockResolvedValue(true),
  beginAutonomyExecution: vi.fn(),
  dispatchAutonomousReplyPlan: vi.fn().mockResolvedValue([]),
}));

vi.mock('../processors/autopilot/autopilot-percept-emit.helper', () => ({
  emitAutopilotActionExecutedPercept: (...args: unknown[]) => emitPercept(...args),
}));

vi.mock('../logger', () => ({
  WorkerLogger: class {
    warn = vi.fn();
    error = vi.fn();
    info = vi.fn();
  },
}));

vi.mock('../db', () => ({ prisma: {} }));

vi.mock('../queue', () => ({ autopilotQueue: { add: vi.fn() } }));

vi.mock('../providers/agent-events', () => ({ publishAgentEvent: vi.fn() }));

vi.mock('../metrics', () => ({
  autopilotDecisionCounter: { inc: vi.fn() },
  autopilotGhostCloserCounter: { inc: vi.fn() },
  autopilotPipelineCounter: { inc: vi.fn() },
}));

vi.mock('../providers/channel-dispatcher', () => ({
  logFallback: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock('../processors/autopilot/safeguard', () => ({
  logAutopilotAction: vi.fn(),
  buildWorkspaceConfig: vi.fn(() => ({})),
}));

vi.mock('../processors/autopilot/cycle-audio', () => ({
  sendAudioResponse: vi.fn().mockResolvedValue(false),
}));

vi.mock('../processors/autopilot/execution-audit', () => ({
  persistFallbackMessage: vi.fn(),
}));

vi.mock('../processors/autopilot/cognition', () => ({
  findRecentDuplicateOutbound: vi.fn().mockResolvedValue(null),
  dispatchAutonomousReplyPlan: (...a: unknown[]) => dispatchAutonomousReplyPlan(...a),
  buildAutonomyExecutionKey: vi.fn(() => 'idem-key'),
  beginAutonomyExecution: (...a: unknown[]) => beginAutonomyExecution(...a),
  finishAutonomyExecution: vi.fn(),
}));

vi.mock('../processors/autopilot/shared', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  isRecentLiveConversation: vi.fn(() => false),
  isExplicitProactiveOutreachAllowed: vi.fn(() => false),
}));

import { dispatchAutopilotAction } from '../processors/autopilot/execution-dispatcher';

function baseInput() {
  return {
    workspaceId: 'ws-1',
    action: 'GHOST_CLOSER',
    contactId: 'c-1',
    conversationId: 'conv-1',
    phone: '5511999999999',
    message: 'olá',
    settings: {},
    deliveryMode: 'reactive' as const,
    idempotencyContext: { conversationProofId: 'proof-1' },
  };
}

describe('dispatchAutopilotAction → autopilot percept emit (P2 wiring)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dispatchAutonomousReplyPlan.mockResolvedValue([]);
  });

  it('emits a SENT percept on a successful dispatch', async () => {
    beginAutonomyExecution.mockResolvedValueOnce({ allowed: true, record: { id: 'exec-1' } });

    const result = await dispatchAutopilotAction(baseInput());

    expect(result.status).toBe('executed');
    expect(emitPercept).toHaveBeenCalledTimes(1);
    const params = emitPercept.mock.calls[0][2] as {
      workspaceId: string;
      actionType: string;
      outcome: string;
      contactId: string | null;
      conversationProofId: string | null;
    };
    expect(params).toMatchObject({
      workspaceId: 'ws-1',
      actionType: 'GHOST_CLOSER',
      outcome: 'SENT',
      contactId: 'c-1',
      conversationProofId: 'proof-1',
    });
  });

  it('emits a SKIPPED percept when the execution is a duplicate', async () => {
    beginAutonomyExecution.mockResolvedValueOnce({ allowed: false, reason: 'duplicate' });

    const result = await dispatchAutopilotAction(baseInput());

    expect(result.status).toBe('skipped');
    expect(emitPercept).toHaveBeenCalledTimes(1);
    expect(emitPercept.mock.calls[0][2]).toMatchObject({ outcome: 'SKIPPED' });
  });

  it('emits a FAILED percept and still returns failed when the send throws', async () => {
    beginAutonomyExecution.mockResolvedValueOnce({ allowed: true, record: { id: 'exec-1' } });
    dispatchAutonomousReplyPlan.mockRejectedValueOnce(new Error('send boom'));

    const result = await dispatchAutopilotAction(baseInput());

    expect(result.status).toBe('failed');
    expect(emitPercept).toHaveBeenCalledTimes(1);
    expect(emitPercept.mock.calls[0][2]).toMatchObject({ outcome: 'FAILED' });
  });

  it('never lets a percept-emit throw break the dispatch outcome', async () => {
    beginAutonomyExecution.mockResolvedValueOnce({ allowed: true, record: { id: 'exec-1' } });
    emitPercept.mockRejectedValueOnce(new Error('outbox down'));

    const result = await dispatchAutopilotAction(baseInput());

    expect(result.status).toBe('executed');
    expect(emitPercept).toHaveBeenCalledTimes(1);
  });
});
