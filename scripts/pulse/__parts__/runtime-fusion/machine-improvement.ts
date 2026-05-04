// ─── Machine Improvement Signals ─────────────────────────────────────────────

import type {
  RuntimeFusionState,
  RuntimeFusionEvidenceStatus,
  RuntimeFusionMachineImprovementSignal,
} from '../../types.runtime-fusion';

export function truthModeFromEvidenceStatus(
  status: RuntimeFusionEvidenceStatus,
): RuntimeFusionMachineImprovementSignal['truthMode'] {
  if (status === 'observed') return 'observed';
  if (status === 'inferred' || status === 'simulated' || status === 'skipped') return 'inferred';
  return 'not_available';
}

export function buildMachineImprovementSignals(
  externalEvidence: RuntimeFusionState['evidence']['externalSignalState'],
  traceEvidence: RuntimeFusionState['evidence']['runtimeTraces'],
): RuntimeFusionMachineImprovementSignal[] {
  let signals: RuntimeFusionMachineImprovementSignal[] = [];

  if (
    externalEvidence.status === 'not_available' ||
    externalEvidence.status === 'invalid' ||
    externalEvidence.notAvailableAdapters.length > 0 ||
    externalEvidence.staleAdapters.length > 0 ||
    externalEvidence.invalidAdapters.length > 0
  ) {
    signals.push({
      id: 'runtime-fusion:external-signal-evidence',
      targetEngine: 'external-sources-orchestrator',
      missingEvidence: 'external_signal',
      truthMode: truthModeFromEvidenceStatus(externalEvidence.status),
      sourceStatus: externalEvidence.status,
      artifactPath: externalEvidence.artifactPath,
      reason: externalEvidence.reason,
      recommendedPulseAction:
        'Improve PULSE external adapter execution and freshness reporting so missing runtime signals become observed or explicitly not_available.',
      productEditRequired: false,
    });
  }

  let adapterGaps = [
    ...externalEvidence.notAvailableAdapters.map((adapterName) => ({
      adapterName,
      status: 'not_available',
    })),
    ...externalEvidence.staleAdapters.map((adapterName) => ({ adapterName, status: 'stale' })),
    ...externalEvidence.invalidAdapters.map((adapterName) => ({ adapterName, status: 'invalid' })),
  ];

  for (let { adapterName, status } of adapterGaps) {
    signals.push({
      id: `runtime-fusion:adapter:${adapterName}`,
      targetEngine: 'external-sources-orchestrator',
      missingEvidence: 'adapter_status',
      truthMode: 'not_available',
      sourceStatus: status,
      artifactPath: externalEvidence.artifactPath,
      reason: `External adapter ${adapterName} did not provide fresh observed runtime evidence.`,
      recommendedPulseAction:
        'Improve the PULSE adapter status resolver and evidence capture path for this source; do not convert the gap into a product-code task.',
      productEditRequired: false,
    });
  }

  if (
    traceEvidence.status === 'not_available' ||
    traceEvidence.status === 'invalid' ||
    traceEvidence.status === 'skipped' ||
    traceEvidence.status === 'simulated'
  ) {
    signals.push({
      id: 'runtime-fusion:runtime-traces',
      targetEngine: 'otel-runtime',
      missingEvidence: 'runtime_trace',
      truthMode: truthModeFromEvidenceStatus(traceEvidence.status),
      sourceStatus: traceEvidence.status,
      artifactPath: traceEvidence.artifactPath,
      reason: traceEvidence.reason,
      recommendedPulseAction:
        'Improve PULSE runtime trace collection or preserved observed-trace loading before treating runtime proof as complete.',
      productEditRequired: false,
    });
  }

  return signals;
}
