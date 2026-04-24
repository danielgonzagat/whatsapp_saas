/**
 * Browser gate evaluator for PULSE certification.
 * Companion to cert-gate-evaluators.ts.
 */
import type {
  PulseCertificationTarget,
  PulseEnvironment,
  PulseExecutionEvidence,
  PulseGateResult,
} from './types';
import { gateFail } from './cert-gate-evaluators';
import { chooseStructuredFailureClass } from './cert-helpers';

export function evaluateBrowserGate(
  env: PulseEnvironment,
  evidence: PulseExecutionEvidence,
  target: PulseCertificationTarget,
): PulseGateResult {
  if (env !== 'total') {
    return { status: 'pass', reason: 'Browser certification is not required in this environment.' };
  }

  if (target.profile === 'core-critical') {
    const browserCriticalScenarios = [
      ...evidence.customer.results,
      ...evidence.operator.results,
      ...evidence.admin.results,
      ...evidence.soak.results,
    ].filter(
      (result) => result.critical && result.requested && result.metrics?.requiresBrowser === true,
    );

    if (browserCriticalScenarios.length === 0) {
      return gateFail(
        'No browser-required critical scenarios were executed for the core-critical profile.',
        'missing_evidence',
      );
    }

    const blocking = browserCriticalScenarios.filter(
      (result) =>
        result.status === 'failed' ||
        result.status === 'missing_evidence' ||
        result.status === 'checker_gap' ||
        result.status === 'skipped',
    );

    if (blocking.length > 0) {
      const failureClass = chooseStructuredFailureClass(blocking);
      const affectedIds = blocking.map((result) => result.scenarioId).join(', ');
      return gateFail(
        failureClass === 'product_failure'
          ? `Browser-required critical scenarios are failing: ${affectedIds}.`
          : `Browser-required critical scenarios are missing evidence: ${affectedIds}.`,
        failureClass,
      );
    }

    return {
      status: 'pass',
      reason: `Browser-required critical scenarios passed: ${browserCriticalScenarios.map((result) => result.scenarioId).join(', ')}.`,
    };
  }

  if (!evidence.browser.attempted || !evidence.browser.executed) {
    return gateFail(
      evidence.browser.summary ||
        'Browser certification was required but did not produce evidence.',
      'missing_evidence',
    );
  }

  if ((evidence.browser.blockingInteractions || 0) > 0) {
    return gateFail(
      `${evidence.browser.blockingInteractions} blocking browser interaction(s) failed during total-mode certification.`,
      'product_failure',
    );
  }

  if ((evidence.browser.totalTested || 0) === 0) {
    return gateFail(
      'Browser run completed without testing interactive elements.',
      'missing_evidence',
    );
  }

  return {
    status: 'pass',
    reason: evidence.browser.summary || 'Browser certification passed.',
  };
}
