/**
 * Machine improvement signal construction for runtime-fusion.
 */
import type {
  RuntimeFusionState,
  RuntimeFusionMachineImprovementSignal,
} from '../../types.runtime-fusion';
import {
  ADAPTER_STALE,
  EVIDENCE_INVALID,
  EVIDENCE_NOT_AVAILABLE,
  EVIDENCE_SIMULATED,
  EVIDENCE_SKIPPED,
  TRUTH_INFERRED,
  TRUTH_OBSERVED,
} from './helpers';

function truthModeFromEvidenceStatus(
  status: RuntimeFusionState['evidence']['externalSignalState']['status'],
): RuntimeFusionMachineImprovementSignal['truthMode'] {
  if (status === TRUTH_OBSERVED) return TRUTH_OBSERVED;
  if (status === TRUTH_INFERRED || status === EVIDENCE_SIMULATED || status === EVIDENCE_SKIPPED)
    return TRUTH_INFERRED;
  return EVIDENCE_NOT_AVAILABLE;
}

export function buildMachineImprovementSignals(
  externalEvidence: RuntimeFusionState['evidence']['externalSignalState'],
  traceEvidence: RuntimeFusionState['evidence']['runtimeTraces'],
): RuntimeFusionMachineImprovementSignal[] {
  const signals: RuntimeFusionMachineImprovementSignal[] = [];

  if (
    externalEvidence.status === EVIDENCE_NOT_AVAILABLE ||
    externalEvidence.status === EVIDENCE_INVALID ||
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

  const adapterGaps = [
    ...externalEvidence.notAvailableAdapters.map((adapterName) => ({
      adapterName,
      status: EVIDENCE_NOT_AVAILABLE as string,
    })),
    ...externalEvidence.staleAdapters.map((adapterName) => ({
      adapterName,
      status: ADAPTER_STALE as string,
    })),
    ...externalEvidence.invalidAdapters.map((adapterName) => ({
      adapterName,
      status: EVIDENCE_INVALID as string,
    })),
  ];

  for (const { adapterName, status } of adapterGaps) {
    signals.push({
      id: `runtime-fusion:adapter:${adapterName}`,
      targetEngine: 'external-sources-orchestrator',
      missingEvidence: 'adapter_status',
      truthMode: EVIDENCE_NOT_AVAILABLE as RuntimeFusionMachineImprovementSignal['truthMode'],
      sourceStatus: status,
      artifactPath: externalEvidence.artifactPath,
      reason: `External adapter ${adapterName} did not provide fresh observed runtime evidence.`,
      recommendedPulseAction:
        'Improve the PULSE adapter status resolver and evidence capture path for this source; do not convert the gap into a product-code task.',
      productEditRequired: false,
    });
  }

  if (
    traceEvidence.status === EVIDENCE_NOT_AVAILABLE ||
    traceEvidence.status === EVIDENCE_INVALID ||
    traceEvidence.status === EVIDENCE_SKIPPED ||
    traceEvidence.status === EVIDENCE_SIMULATED
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
