import type { PulseExternalSignalSource, PulseExternalSignalState } from '../../types.capabilities';
import type { PulseExternalAdapterProofBasis } from '../../types.capabilities';
import type { BuildExternalSignalStateInput } from '../../signal-mapper';
import {
  attachRecentChangeRefs,
  isRuntimeSignal,
  isChangeSignal,
  isDependencySignal,
} from '../../signal-mapper';
import {
  deriveUnitValue,
  deriveZeroValue,
} from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import { discoverExternalAdapterProofBasisLabels } from '../../__kernel_additions__/discoverExternalAdapterProofBasisLabels';
import { discoverExternalSignalSourceLabels } from '../../__kernel_additions__/discoverExternalSignalSourceLabels';
import { discoverConvergenceExecutionModeLabels } from '../../__kernel_additions__/discoverConvergenceExecutionModeLabels';
import { discoverTruthModeLabels } from '../../dynamic-reality-kernel/__parts__/type-contract-engines';
import {
  isAdapterRequired,
  normalizeExternalSignalProfile,
} from '../../adapters/external-sources-orchestrator/__parts__/core';
import { PULSE_EXTERNAL_SNAPSHOT_FILES } from './snapshot-config';
import type { UnclassifiedExternalAdapter } from './adapter-builders';
import {
  buildSnapshotAdapter,
  buildLiveAdapter,
  selectExternalAdapter,
  buildCodacyAdapter,
  classifyExternalAdapter,
} from './adapter-builders';

type ExternalSignalTruthMode = PulseExternalSignalState['truthMode'];

function observedExternalSignalTruthMode(): ExternalSignalTruthMode {
  return [...discoverTruthModeLabels()][deriveZeroValue()] as ExternalSignalTruthMode;
}

/** Build normalized external-signal state from snapshot-first adapters. */
export function buildExternalSignalState(
  input: BuildExternalSignalStateInput,
): PulseExternalSignalState {
  const externalSources = Object.keys(PULSE_EXTERNAL_SNAPSHOT_FILES) as Array<
    Exclude<PulseExternalSignalSource, 'codacy'>
  >;
  // Derive the active profile/scope from the live external state when available.
  // Canonical final profiles make profile-dependent adapters required; Prometheus
  // remains optional for pulse-core-final and required for full-product.
  const liveProfileState = input.liveExternalState as
    | { profile?: string; certificationScope?: string }
    | null
    | undefined;
  const profile = normalizeExternalSignalProfile(
    liveProfileState?.certificationScope || liveProfileState?.profile,
  );
  const initialAdapters: UnclassifiedExternalAdapter[] = [
    buildCodacyAdapter(input),
    ...externalSources.map((source) =>
      selectExternalAdapter(
        buildSnapshotAdapter(input, source),
        buildLiveAdapter(input, source),
        profile,
      ),
    ),
  ];

  const signals = attachRecentChangeRefs(initialAdapters.flatMap((adapter) => adapter.signals));
  const adapters = initialAdapters.map((adapter) =>
    classifyExternalAdapter(
      {
        ...adapter,
        signals: signals.filter((signal) => signal.source === adapter.source),
      },
      profile,
    ),
  );

  // Categorize adapters using FASE 4 five-status semantics + requiredness.
  // - `optional_not_configured` is never blocking.
  // - `not_available` / `invalid` count as missing only when the adapter is required
  //   under the active profile (or always-required).
  const staleAdaptersList = adapters
    .filter((adapter) => adapter.status === 'stale' && isAdapterRequired(adapter.source, profile))
    .map((adapter) => adapter.source);
  const invalidAdaptersList = adapters
    .filter((adapter) => adapter.status === 'invalid' && isAdapterRequired(adapter.source, profile))
    .map((adapter) => adapter.source);
  const notAvailableRequiredList = adapters
    .filter(
      (adapter) => adapter.status === 'not_available' && isAdapterRequired(adapter.source, profile),
    )
    .map((adapter) => adapter.source);
  const missingAdaptersList = [...notAvailableRequiredList, ...invalidAdaptersList];
  const optionalSkippedList = adapters
    .filter((adapter) => adapter.status === 'optional_not_configured')
    .map((adapter) => adapter.source);
  const optionalNotAvailableList = adapters
    .filter((adapter) => adapter.status === 'not_available' && !adapter.required)
    .map((adapter) => adapter.source);
  const blockingAdaptersList = adapters
    .filter((adapter) => adapter.blocking)
    .map((adapter) => adapter.source);
  const proofBasisCounts = adapters.reduce(
    (counts, adapter) => {
      const key = adapter.proofBasis;
      counts[key] = (counts[key] ?? deriveZeroValue()) + deriveUnitValue();
      return counts;
    },
    Object.fromEntries(
      [...discoverExternalAdapterProofBasisLabels()].map((label) => [label, 0]),
    ) as Record<string, number>,
  ) as Record<PulseExternalAdapterProofBasis, number>;

  const summary = {
    totalSignals: signals.length,
    runtimeSignals: signals.filter(isRuntimeSignal).length,
    changeSignals: signals.filter(isChangeSignal).length,
    dependencySignals: signals.filter(isDependencySignal).length,
    highImpactSignals: signals.filter(
      (signal) =>
        signal.impactScore >=
        (deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue()) /
          (deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue() +
            deriveUnitValue()),
    ).length,
    mappedSignals: signals.filter(
      (signal) =>
        signal.capabilityIds.length > deriveZeroValue() ||
        signal.flowIds.length > deriveZeroValue(),
    ).length,
    humanRequiredSignals: signals.filter(
      (signal) =>
        discoverConvergenceExecutionModeLabels().has(signal.executionMode) &&
        signal.executionMode === 'human_required',
    ).length,
    governedValidationSignals: signals.filter(
      (signal) =>
        discoverConvergenceExecutionModeLabels().has(signal.governanceDisposition) &&
        signal.governanceDisposition === 'governed_validation',
    ).length,
    staleAdapters: staleAdaptersList.length,
    missingAdapters: missingAdaptersList.length,
    invalidAdapters: invalidAdaptersList.length,
    optionalSkippedAdapters: optionalSkippedList.length,
    requiredAdapters: adapters.filter((adapter) => adapter.required).length,
    optionalAdapters: adapters.filter((adapter) => !adapter.required).length,
    observedAdapters: adapters.filter((adapter) => adapter.observed).length,
    blockingAdapters: blockingAdaptersList.length,
    missingAdaptersList,
    staleAdaptersList,
    invalidAdaptersList,
    optionalSkippedList,
    optionalNotAvailableList,
    blockingAdaptersList,
    proofBasisCounts,
    bySource: Object.fromEntries(
      [...discoverExternalSignalSourceLabels()].map((sourceLabel) => [
        sourceLabel,
        signals.filter((signal) => signal.source === sourceLabel).length,
      ]),
    ) as Record<PulseExternalSignalSource, number>,
  };

  return {
    generatedAt: new Date().toISOString(),
    truthMode: observedExternalSignalTruthMode(),
    summary,
    adapters,
    signals,
  };
}
