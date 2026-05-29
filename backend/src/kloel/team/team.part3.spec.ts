import {
  formatSuggestionForDisplay,
  buildSuggestionMessage,
  validateSuggestionDismissal,
  isOperatorOverrideAllowed,
  buildSuggestionId,
  TEAM_RESPECT_RULES,
} from './team-respect.protocol';
import type { SuggestionR1Contract } from './team.types';
import type { NextBestAction } from './team.types';

// ─── TEAM-001: Pre-Call Context Builder ─────────────────────────────

describe('TeamRespectProtocol (UTP-TEAM-006)', () => {
  const mockR1Contract: SuggestionR1Contract = {
    riskClass: 'R1',
    delegationMode: 'allowed_alone',
    safeNextStep: 'show suggestion only; do not send',
    rollback: ['dismiss_suggestion', 'snooze_suggestion'],
    leadOutcomeGuardrail: {
      antiPressureLanguage: true,
      respectsSilenceWindow: true,
      requiresContextQualification: false,
    },
  };

  const mockSuggestion: NextBestAction = {
    rank: 1,
    action: 'make_initial_contact',
    rationale: 'lead not yet contacted',
    confidence: 0.82,
    evidenceRefs: [],
    guardrails: ['verify lead uniqueness'],
    r1Contract: mockR1Contract,
  };

  it('formats suggestion for display', () => {
    const display = formatSuggestionForDisplay(mockSuggestion);
    expect(display).toContain('#1');
    expect(display).toContain('make_initial_contact');
  });

  it('builds suggestion message with dismissible flag', () => {
    const msg = buildSuggestionMessage(mockSuggestion);
    expect(msg.dismissible).toBe(true);
    expect(msg.action).toBe('make_initial_contact');
    expect(msg.guardrails.length).toBeGreaterThan(0);
  });

  it('carries observable delegation control from r1Contract', () => {
    const msg = buildSuggestionMessage(mockSuggestion);
    expect(msg.delegation).toBeDefined();
    expect(msg.delegation.riskClass).toBe(mockSuggestion.r1Contract.riskClass);
    expect(msg.delegation.delegationMode).toBe(mockSuggestion.r1Contract.delegationMode);
    expect(msg.delegation.safeNextStep).toBe(mockSuggestion.r1Contract.safeNextStep);
    expect(msg.delegation.rollback).toEqual(mockSuggestion.r1Contract.rollback);
    expect(msg.delegation.leadOutcomeGuardrail).toEqual(
      mockSuggestion.r1Contract.leadOutcomeGuardrail,
    );
  });

  it('exposes riskClass so operators see delegation risk level', () => {
    const r1: SuggestionR1Contract = {
      ...mockR1Contract,
      riskClass: 'R2',
      delegationMode: 'requires_review',
    };
    const suggestion: NextBestAction = {
      ...mockSuggestion,
      r1Contract: r1,
    };
    const msg = buildSuggestionMessage(suggestion);
    expect(msg.delegation.riskClass).toBe('R2');
    expect(msg.delegation.delegationMode).toBe('requires_review');
  });

  it('exposes safeNextStep for every risk class', () => {
    const r2: SuggestionR1Contract = {
      riskClass: 'R2',
      delegationMode: 'human_only',
      safeNextStep: 'ask human to verify delivery',
      rollback: ['dismiss_suggestion', 'manual_review'],
      leadOutcomeGuardrail: {
        antiPressureLanguage: true,
        respectsSilenceWindow: false,
        requiresContextQualification: false,
      },
    };
    const suggestion: NextBestAction = {
      ...mockSuggestion,
      r1Contract: r2,
    };
    const msg = buildSuggestionMessage(suggestion);
    expect(msg.delegation.delegationMode).toBe('human_only');
    expect(msg.delegation.safeNextStep).toContain('verify delivery');
    expect(msg.delegation.rollback).toContain('manual_review');
  });

  it('exposes leadOutcomeGuardrail so operators see anti-pressure and silence rules', () => {
    const guard = buildSuggestionMessage(mockSuggestion).delegation.leadOutcomeGuardrail;
    expect(guard.antiPressureLanguage).toBe(true);
    expect(guard.respectsSilenceWindow).toBe(true);
    expect(guard.requiresContextQualification).toBe(false);
  });

  it('preserves suggestion-not-command framing alongside delegation visibility', () => {
    const r2: SuggestionR1Contract = {
      riskClass: 'R2',
      delegationMode: 'human_only',
      safeNextStep: 'human-only review required',
      rollback: ['dismiss_suggestion', 'manual_review'],
      leadOutcomeGuardrail: {
        antiPressureLanguage: true,
        respectsSilenceWindow: true,
        requiresContextQualification: true,
      },
    };
    const suggestion: NextBestAction = {
      ...mockSuggestion,
      r1Contract: r2,
    };
    const msg = buildSuggestionMessage(suggestion);

    expect(msg.frame).toContain('suggestion (not command)');
    expect(msg.dismissible).toBe(true);
    expect(msg.delegation.delegationMode).toBe('human_only');
    expect(msg.delegation.leadOutcomeGuardrail.antiPressureLanguage).toBe(true);
    expect(msg.guardrails.length).toBeGreaterThan(0);
  });

  it('builds distinct delegation messages for silent qualified vs unqualified contexts', () => {
    const qualified: SuggestionR1Contract = {
      riskClass: 'R1',
      delegationMode: 'allowed_alone',
      safeNextStep: 'surface an honest re-engagement suggestion for owner review; do not send',
      rollback: ['dismiss_suggestion', 'snooze_suggestion'],
      leadOutcomeGuardrail: {
        antiPressureLanguage: true,
        respectsSilenceWindow: true,
        requiresContextQualification: true,
      },
    };
    const unqualified: SuggestionR1Contract = {
      riskClass: 'R1',
      delegationMode: 'allowed_alone',
      safeNextStep: 'review timeline and gather context before every re-engagement suggestion',
      rollback: ['dismiss_suggestion', 'snooze_suggestion'],
      leadOutcomeGuardrail: {
        antiPressureLanguage: true,
        respectsSilenceWindow: true,
        requiresContextQualification: false,
      },
    };

    const msgQ = buildSuggestionMessage({
      ...mockSuggestion,
      r1Contract: qualified,
    });
    const msgU = buildSuggestionMessage({
      ...mockSuggestion,
      r1Contract: unqualified,
    });

    expect(msgQ.delegation.safeNextStep).toContain('do not send');
    expect(msgU.delegation.safeNextStep).toContain('review timeline');
    expect(msgQ.delegation.leadOutcomeGuardrail.requiresContextQualification).toBe(true);
    expect(msgU.delegation.leadOutcomeGuardrail.requiresContextQualification).toBe(false);
    expect(msgQ.dismissible).toBe(true);
    expect(msgU.dismissible).toBe(true);
  });

  it('validates operator dismissal', () => {
    const result = validateSuggestionDismissal(mockSuggestion, {
      suggestionId: 'sugg_001',
      operatorId: 'op_test',
      action: 'dismiss',
      dismissedAt: new Date().toISOString(),
    });
    expect(result.valid).toBe(true);
  });

  it('rejects dismissal without operatorId', () => {
    const result = validateSuggestionDismissal(mockSuggestion, {
      suggestionId: 'sugg_001',
      operatorId: '',
      action: 'dismiss',
      dismissedAt: new Date().toISOString(),
    });
    expect(result.valid).toBe(false);
  });

  it('always allows operator override', () => {
    expect(isOperatorOverrideAllowed()).toBe(true);
  });

  it('builds unique suggestion IDs', () => {
    const id1 = buildSuggestionId('op1', 1, new Date().toISOString());
    const id2 = buildSuggestionId('op1', 2, new Date().toISOString());
    expect(id1).not.toBe(id2);
  });

  it('has respect rules defined', () => {
    expect(TEAM_RESPECT_RULES.size).toBeGreaterThanOrEqual(4);
  });
});

// ─── TEAM-007: Operator Feedback Loop ───────────────────────────────
