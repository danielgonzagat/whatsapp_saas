import { proposeRecoveryTactic } from './error-damage-recovery.tactics';
import type { DetectedError, ErrorCategory } from './recovery.types';

function detectedError(
  category: ErrorCategory,
  severity: DetectedError['severity'],
): DetectedError {
  return {
    errorId: `err_${category}_${severity}`,
    category,
    workspaceId: 'wks_recovery_safety',
    detectedAt: '2026-05-14T12:00:00.000Z',
    evidenceEventIds: ['evt_recovery_safety'],
    description: `${category} ${severity}`,
    severity,
    fingerprint: {
      kind: category,
      workspaceId: 'wks_recovery_safety',
      eventPatternHash: '12345678',
      firstSeenAt: '2026-05-14T11:00:00.000Z',
      repeatCount: 1,
      lastSeenAt: '2026-05-14T11:00:00.000Z',
    },
  };
}

describe('recovery safety contract', () => {
  it('keeps silence recovery as R1 allowed alone', () => {
    const tactic = proposeRecoveryTactic(
      detectedError('inappropriate_timing', 'low'),
    );

    expect(tactic.action).toBe('silence');
    expect(tactic.safetyContract.riskClass).toBe('R1');
    expect(tactic.safetyContract.delegationMode).toBe('allowed_alone');
    expect(tactic.safetyContract.safeNextStep).toContain('without contacting');
  });

  it('requires review for personal follow-up after missed opportunity', () => {
    const tactic = proposeRecoveryTactic(
      detectedError('missed_opportunity', 'high'),
    );

    expect(tactic.action).toBe('follow_up_personal');
    expect(tactic.safetyContract.riskClass).toBe('R2');
    expect(tactic.safetyContract.delegationMode).toBe('requires_review');
    expect(tactic.safetyContract.leadOutcomeGuardrail).toContain(
      'avoid conversion pressure',
    );
  });

  it('requires explicit owner approval before commercial concessions', () => {
    const tactic = proposeRecoveryTactic(detectedError('decline', 'medium'));

    expect(tactic.action).toBe('small_concession');
    expect(tactic.safetyContract.riskClass).toBe('R2');
    expect(tactic.safetyContract.delegationMode).toBe('requires_review');
    expect(tactic.safetyContract.safeNextStep).toContain('owner approval');
    expect(tactic.safetyContract.rollback).toContain('do_not_offer_concession');
  });
});
