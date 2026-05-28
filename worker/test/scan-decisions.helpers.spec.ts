import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../providers/unified-agent-integrator', () => ({
  shouldUseUnifiedAgent: vi.fn(),
}));

import { shouldUseUnifiedAgent } from '../providers/unified-agent-integrator';
import {
  AUTONOMOUS_FALLBACK_ACTION,
  AUTONOMOUS_FALLBACK_REASON,
  FALLBACK_INTENT,
  UNIFIED_AGENT_EXECUTED_ACTION,
  UNIFIED_AGENT_TEXT_ACTION,
  buildAlreadyExecutedResult,
  buildExecutionSummary,
  buildIdempotencyContext,
  buildPreviewResult,
  buildSkippedResult,
  formatActionExecutedSummary,
  formatActionSkippedSummary,
  isNoActionDecision,
  isPreviewMode,
  resolveFallbackIntent,
  resolveFallbackReason,
  resolveUsedKb,
  shouldRouteToUnifiedAgent,
} from '../processors/autopilot/scan-decisions.helpers';
import type { AutopilotDecision } from '../processors/autopilot/shared';

const mockedShouldUseUnifiedAgent = vi.mocked(shouldUseUnifiedAgent);

const buildDecision = (overrides: Partial<AutopilotDecision> = {}): AutopilotDecision => ({
  intent: 'BUYING',
  action: 'SEND_PRODUCT_INFO',
  ...overrides,
});

describe('constants', () => {
  it('exposes the canonical fallback action labels', () => {
    expect(FALLBACK_INTENT).toBe('GENERAL_ASSISTANCE');
    expect(AUTONOMOUS_FALLBACK_ACTION).toBe('AUTONOMOUS_FALLBACK');
    expect(AUTONOMOUS_FALLBACK_REASON).toBe('autonomous_fallback');
    expect(UNIFIED_AGENT_TEXT_ACTION).toBe('UNIFIED_AGENT_TEXT');
    expect(UNIFIED_AGENT_EXECUTED_ACTION).toBe('UNIFIED_AGENT_EXECUTED');
  });
});

describe('buildIdempotencyContext', () => {
  it('coerces missing runId to null and keeps every supplied id list', () => {
    const ctx = buildIdempotencyContext({
      source: 'scan_contact_action',
      messageIds: ['m1', null],
      providerMessageIds: ['p1'],
      runId: undefined,
    });
    expect(ctx).toEqual({
      source: 'scan_contact_action',
      runId: null,
      messageIds: ['m1', null],
      providerMessageIds: ['p1'],
    });
  });

  it('omits id lists that were not provided', () => {
    const ctx = buildIdempotencyContext({ source: 'src' });
    expect(ctx).toEqual({ source: 'src', runId: null });
    expect('messageIds' in ctx).toBe(false);
    expect('providerMessageIds' in ctx).toBe(false);
  });

  it('preserves explicit null runId without rewriting it', () => {
    const ctx = buildIdempotencyContext({ source: 'src', runId: null });
    expect(ctx.runId).toBeNull();
  });

  it('passes through a real runId', () => {
    const ctx = buildIdempotencyContext({ source: 'src', runId: 'run_123' });
    expect(ctx.runId).toBe('run_123');
  });
});

describe('shouldRouteToUnifiedAgent', () => {
  beforeEach(() => {
    mockedShouldUseUnifiedAgent.mockReset();
  });

  it('returns true when cognitiveState.nextBestAction is RESPOND', () => {
    const result = shouldRouteToUnifiedAgent({
      cognitiveState: { nextBestAction: 'RESPOND' },
      productMatches: [],
      messageContent: 'hi',
      settings: {},
    });
    expect(result).toBe(true);
    expect(mockedShouldUseUnifiedAgent).not.toHaveBeenCalled();
  });

  it('returns true when there are product matches', () => {
    const result = shouldRouteToUnifiedAgent({
      cognitiveState: { nextBestAction: 'WAIT' },
      productMatches: ['prod_1'],
      messageContent: 'hi',
      settings: {},
    });
    expect(result).toBe(true);
    expect(mockedShouldUseUnifiedAgent).not.toHaveBeenCalled();
  });

  it('falls back to shouldUseUnifiedAgent when cognitive + product signals are absent', () => {
    mockedShouldUseUnifiedAgent.mockReturnValue(true);
    const result = shouldRouteToUnifiedAgent({
      cognitiveState: {},
      productMatches: [],
      messageContent: 'tell me more',
      leadScore: 80,
      settings: { foo: 'bar' },
    });
    expect(result).toBe(true);
    expect(mockedShouldUseUnifiedAgent).toHaveBeenCalledWith({
      messageContent: 'tell me more',
      leadScore: 80,
      settings: { foo: 'bar' },
    });
  });

  it('returns false when no signal triggers', () => {
    mockedShouldUseUnifiedAgent.mockReturnValue(false);
    const result = shouldRouteToUnifiedAgent({
      cognitiveState: null,
      productMatches: [],
      messageContent: '',
      settings: {},
    });
    expect(result).toBe(false);
  });

  it('treats null cognitiveState as empty', () => {
    mockedShouldUseUnifiedAgent.mockReturnValue(false);
    const result = shouldRouteToUnifiedAgent({
      cognitiveState: null,
      productMatches: [],
      messageContent: 'hi',
      settings: {},
    });
    expect(result).toBe(false);
    expect(mockedShouldUseUnifiedAgent).toHaveBeenCalledOnce();
  });
});

describe('isPreviewMode', () => {
  it('returns true when smokeTestId is present and mode is dry-run', () => {
    expect(isPreviewMode('smoke_1', 'dry-run')).toBe(true);
  });

  it('returns false when smokeMode is live, even with a smokeTestId', () => {
    expect(isPreviewMode('smoke_1', 'live')).toBe(false);
  });

  it('returns false when smokeTestId is missing', () => {
    expect(isPreviewMode(undefined, 'dry-run')).toBe(false);
  });

  it('returns false for an empty smokeTestId', () => {
    expect(isPreviewMode('', 'dry-run')).toBe(false);
  });
});

describe('result builders', () => {
  it('buildPreviewResult always returns a skipped result without lock retention', () => {
    expect(buildPreviewResult('Preview summary')).toEqual({
      status: 'skipped',
      summary: 'Preview summary',
      keepReplyLock: false,
    });
  });

  it('buildSkippedResult mirrors buildPreviewResult shape', () => {
    expect(buildSkippedResult('Blocked by human gate')).toEqual({
      status: 'skipped',
      summary: 'Blocked by human gate',
      keepReplyLock: false,
    });
  });

  it('buildAlreadyExecutedResult returns sent with the lock retained', () => {
    expect(buildAlreadyExecutedResult('done')).toEqual({
      status: 'sent',
      summary: 'done',
      keepReplyLock: true,
    });
  });
});

describe('buildExecutionSummary', () => {
  it('returns sent + lock kept when the executor returns executed', () => {
    expect(
      buildExecutionSummary({
        executionResult: 'executed',
        executedSummary: 'ok',
        skippedSummary: 'nope',
      }),
    ).toEqual({ status: 'sent', summary: 'ok', keepReplyLock: true });
  });

  it('returns skipped + lock released for any non-executed value', () => {
    expect(
      buildExecutionSummary({
        executionResult: 'skipped',
        executedSummary: 'ok',
        skippedSummary: 'nope',
      }),
    ).toEqual({ status: 'skipped', summary: 'nope', keepReplyLock: false });
  });

  it('treats unknown executor responses as skipped', () => {
    expect(
      buildExecutionSummary({
        executionResult: 'mystery',
        executedSummary: 'ok',
        skippedSummary: 'nope',
      }),
    ).toEqual({ status: 'skipped', summary: 'nope', keepReplyLock: false });
  });
});

describe('decision resolvers', () => {
  it('resolveFallbackIntent prefers the decision intent when present', () => {
    expect(resolveFallbackIntent(buildDecision({ intent: 'OBJECTION' }))).toBe('OBJECTION');
  });

  it('resolveFallbackIntent falls back to GENERAL_ASSISTANCE when intent is empty', () => {
    expect(resolveFallbackIntent(buildDecision({ intent: '' }))).toBe(FALLBACK_INTENT);
  });

  it('resolveFallbackReason prefers decision.reason when present', () => {
    expect(resolveFallbackReason(buildDecision({ reason: 'custom_reason' }))).toBe('custom_reason');
  });

  it('resolveFallbackReason falls back to the autonomous_fallback constant when missing', () => {
    expect(resolveFallbackReason(buildDecision())).toBe(AUTONOMOUS_FALLBACK_REASON);
  });

  it('resolveUsedKb is true when decision.usedKb is true', () => {
    expect(resolveUsedKb(buildDecision({ usedKb: true }), [])).toBe(true);
  });

  it('resolveUsedKb is true when product matches exist even if decision.usedKb is false', () => {
    expect(resolveUsedKb(buildDecision({ usedKb: false }), ['prod_1'])).toBe(true);
  });

  it('resolveUsedKb is false when neither signal is present', () => {
    expect(resolveUsedKb(buildDecision({ usedKb: false }), [])).toBe(false);
  });

  it('isNoActionDecision flags blank or NONE actions', () => {
    expect(isNoActionDecision(buildDecision({ action: '' }))).toBe(true);
    expect(isNoActionDecision(buildDecision({ action: 'NONE' }))).toBe(true);
  });

  it('isNoActionDecision is false for any other action', () => {
    expect(isNoActionDecision(buildDecision({ action: 'SEND_PAYMENT_LINK' }))).toBe(false);
  });
});

describe('summary formatters', () => {
  it('formatActionExecutedSummary embeds the action name', () => {
    expect(formatActionExecutedSummary('SEND_PRODUCT_INFO')).toBe(
      'Ação SEND_PRODUCT_INFO executada com sucesso.',
    );
  });

  it('formatActionSkippedSummary embeds the action name', () => {
    expect(formatActionSkippedSummary('APPLY_DISCOUNT')).toBe(
      'Ação APPLY_DISCOUNT pulada por política operacional.',
    );
  });
});
