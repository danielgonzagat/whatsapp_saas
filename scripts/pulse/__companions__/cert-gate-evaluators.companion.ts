export function evaluateChangeRiskGate(
  externalSignalState?: PulseExternalSignalState,
): PulseGateResult {
  if (!externalSignalState) {
    return { status: 'pass', reason: 'No external change-risk state was attached for this run.' };
  }

  const correlatedSignals = externalSignalState.signals
    .filter((signal) => signal.recentChangeRefs.length > 0)
    .filter((signal) => signal.impactScore >= 0.7);

  if (correlatedSignals.length > 0) {
    return gateFail(
      `Recent changes correlate with active high-impact signals: ${summarizeExternalSignalIds(correlatedSignals).join(', ')}.`,
      'product_failure',
    );
  }

  return {
    status: 'pass',
    reason: 'No high-impact external signal is currently correlated with recent change evidence.',
    evidenceMode: externalSignalState.summary.totalSignals > 0 ? 'observed' : 'inferred',
    confidence: externalSignalState.summary.totalSignals > 0 ? 'high' : 'medium',
  };
}

export { evaluateBrowserGate } from './cert-gate-browser';

