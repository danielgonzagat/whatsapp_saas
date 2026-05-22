import { describe, expect, it } from 'vitest';
import { buildQueueJobId } from '../job-id';
import {
  getDelayUntilWorkspaceWindowOpens,
  getWorkspaceLocalHour,
  isWithinWorkspaceWindow,
  resolveWorkspaceTimezone,
} from '../providers/timezone';
import { safeEvaluateBoolean, validateExpression } from '../utils/safe-eval';

describe('orphan worker runtime proof', () => {
  it('builds stable queue ids for checkout and follow-up jobs', () => {
    expect(buildQueueJobId('checkout-social-lead-enrich', 'ws 1', 'lead@example.com')).toBe(
      'checkout-social-lead-enrich__ws_1__lead_example_com',
    );
    expect(buildQueueJobId('scheduled-followup', '', null, undefined)).toBe(
      'scheduled-followup__na__na__na',
    );
  });

  it('resolves workspace time windows from workspace settings', () => {
    const settings = { timezone: 'America/Sao_Paulo' };
    const noonInSaoPaulo = new Date('2026-05-15T15:00:00.000Z');

    expect(resolveWorkspaceTimezone(settings)).toBe('America/Sao_Paulo');
    expect(getWorkspaceLocalHour(settings, noonInSaoPaulo)).toBe(12);
    expect(
      isWithinWorkspaceWindow({
        settings,
        startHour: 8,
        endHour: 20,
        now: noonInSaoPaulo,
      }),
    ).toBe(true);
  });

  it('delays follow-up work until the workspace window opens', () => {
    const delay = getDelayUntilWorkspaceWindowOpens({
      settings: { timezone: 'America/Sao_Paulo' },
      startHour: 8,
      endHour: 20,
      now: new Date('2026-05-15T08:30:00.000Z'),
      stepMinutes: 30,
    });

    expect(delay).toBe(150 * 60_000);
  });

  it('evaluates flow rules without exposing unsafe globals', () => {
    expect(
      safeEvaluateBoolean('leadScore >= 80 and status == "checkout"', {
        leadScore: 91,
        status: 'checkout',
      }),
    ).toBe(true);
    expect(validateExpression('process.env.SECRET').valid).toBe(false);
    expect(safeEvaluateBoolean('process.env.SECRET', {})).toBe(false);
  });
});
