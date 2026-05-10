import type { ChaosScenarioKind, ChaosTarget } from '../../types.chaos-engine';
import type { PulseCapability } from '../../types.capabilities/03-capability';
import type { PulseRuntimeEvidence } from '../../types.convergence';
import type { PulseExecutionTrace } from '../../types.evidence';
import { ChaosProviderName, ChaosEvidenceContext, ChaosScenarioSeed, unique } from './detection';
import { computeProviderBlastRadius } from './blast-radius';
import { discoverExternalReceiverTokensFromEvidence } from '../../dynamic-reality-kernel/token-evidence';
import { discoverChaosScenarioKindLabels } from '../../dynamic-reality-kernel/type-contract-engines';
import {
  discoverPropertyPassedStatusFromTypeEvidence,
  deriveUnitValue,
  deriveZeroValue,
} from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';

// ── Injection config generation ───────────────────────────────────────────

function normalizeEvidenceText(value: unknown): string {
  if (typeof value === 'string') {
    return value.toLowerCase();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).toLowerCase();
  }
  if (Array.isArray(value)) {
    return value.map(normalizeEvidenceText).join(' ');
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .map(normalizeEvidenceText)
      .join(' ');
  }
  return '';
}

function recordFilePath(record: Record<string, unknown>): string {
  const metadata = record.metadata as Record<string, unknown> | undefined;
  for (const candidate of [record.filePath, record.file, metadata?.filePath, metadata?.file]) {
    if (typeof candidate === 'string') {
      return candidate;
    }
  }
  return '';
}

function textMentionsDependency(
  text: string,
  dependency: ChaosProviderName,
  files: string[],
): boolean {
  const normalized = text.toLowerCase();
  const _receiverTokens = discoverExternalReceiverTokensFromEvidence();
  const _minTokenLen = Array.from(_receiverTokens).reduce(
    (min, t) => Math.min(min, t.length),
    Number.MAX_SAFE_INTEGER,
  );
  const dependencyTokens = unique(
    dependency.split(/[^a-zA-Z0-9]+/).filter((token) => {
      const normalizedToken = token.toLowerCase();
      return token.length > _minTokenLen && !_receiverTokens.includes(normalizedToken);
    }),
  );
  return (
    dependencyTokens.some((token) => normalized.includes(token.toLowerCase())) ||
    files.some((file) => file && normalized.includes(file.toLowerCase()))
  );
}

export function buildChaosEvidenceContext(
  dependency: ChaosProviderName,
  target: ChaosTarget,
  files: string[],
  capabilities: PulseCapability[],
  runtimeEvidence: PulseRuntimeEvidence | null,
  executionTrace: PulseExecutionTrace | null,
  effectRecords: Record<string, unknown>[],
): ChaosEvidenceContext {
  const blastRadius = new Set(computeProviderBlastRadius(dependency, files, capabilities));
  const scopedCapabilities = capabilities.filter((capability) => blastRadius.has(capability.id));
  const runtimeProbes = (runtimeEvidence?.probes ?? []).filter((probe) =>
    textMentionsDependency(normalizeEvidenceText(probe), dependency, files),
  );
  const executionPhases = (executionTrace?.phases ?? []).filter((phase) =>
    textMentionsDependency(normalizeEvidenceText(phase), dependency, files),
  );
  const artifactRecords = effectRecords.filter((record) => {
    const filePath = recordFilePath(record);
    return (
      (filePath && files.includes(filePath)) ||
      textMentionsDependency(normalizeEvidenceText(record), dependency, files)
    );
  });
  const capabilityEvidence = scopedCapabilities.flatMap((capability) => [
    capability.id,
    capability.name,
    ...capability.filePaths,
    ...capability.routePatterns,
    ...capability.evidenceSources,
    ...capability.validationTargets,
    ...capability.rolesPresent,
  ]);

  return {
    dependency,
    target,
    files,
    capabilities: scopedCapabilities,
    runtimeProbes,
    executionPhases,
    artifactRecords,
    evidenceText: [
      dependency,
      target,
      ...files,
      ...capabilityEvidence,
      normalizeEvidenceText(runtimeProbes),
      normalizeEvidenceText(executionPhases),
      normalizeEvidenceText(artifactRecords),
    ]
      .join(' ')
      .toLowerCase(),
  };
}

function evidenceNumbers(context: ChaosEvidenceContext): number[] {
  const runtimeNumbers = context.runtimeProbes.flatMap((probe) => [
    probe.latencyMs,
    ...Object.values(probe.metrics ?? {}),
  ]);
  const phaseDurations = context.executionPhases.map((phase) => phase.durationMs);
  const numericValues = [...runtimeNumbers, ...phaseDurations].filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0,
  );
  if (numericValues.length > deriveZeroValue()) {
    return numericValues.sort((left, right) => left - right);
  }
  return unique([
    context.dependency,
    ...context.files,
    ...context.capabilities.map((cap) => cap.id),
  ])
    .map((value) => value.length)
    .filter((value) => value > 0)
    .sort((left, right) => left - right);
}

function evidenceQuantile(values: number[], numerator: number, denominator: number): number {
  if (values.length === deriveZeroValue()) {
    return denominator;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - deriveUnitValue(),
    Math.floor(
      ((sorted.length - deriveUnitValue()) * numerator) / Math.max(denominator, deriveUnitValue()),
    ),
  );
  return Math.max(deriveUnitValue(), Math.ceil(sorted[index] ?? denominator));
}

function deriveEvidenceWeight(context: ChaosEvidenceContext): number {
  return Math.max(
    deriveUnitValue(),
    context.files.length +
      context.capabilities.length +
      context.runtimeProbes.length +
      context.executionPhases.length +
      context.artifactRecords.length,
  );
}

function deriveSeedParams(
  context: ChaosEvidenceContext,
  kind: ChaosScenarioKind,
): Record<string, number> {
  if (!discoverChaosScenarioKindLabels().has(kind)) {
    throw new Error(`deriveSeedParams: unknown ChaosScenarioKind ${kind}`);
  }
  const numbers = evidenceNumbers(context);
  const low = evidenceQuantile(
    numbers,
    deriveUnitValue(),
    Math.max(numbers.length, deriveUnitValue()),
  );
  const middle = evidenceQuantile(
    numbers,
    Math.ceil(numbers.length / 2),
    Math.max(numbers.length, deriveUnitValue()),
  );
  const high = evidenceQuantile(
    numbers,
    Math.max(numbers.length - deriveUnitValue(), deriveUnitValue()),
    Math.max(numbers.length, deriveUnitValue()),
  );
  const evidenceWeight = deriveEvidenceWeight(context);
  const baseDuration = Math.max(high, middle * Math.max(evidenceWeight, deriveUnitValue()));

  switch (kind) {
    case 'latency':
      return { latencyMs: Math.max(low, middle) };
    case 'connection_drop':
      return { reconnectWindowMs: Math.max(middle, context.files.join('').length) };
    case 'slow_close':
      return { drainTimeMs: Math.max(middle, baseDuration) };
    case 'partition':
      return {
        isolatedMs: Math.max(high, baseDuration),
        healDelayMs: Math.max(low, middle),
      };
    case 'packet_loss': {
      const passedStatuses = discoverPropertyPassedStatusFromTypeEvidence();
      const signalCount = context.runtimeProbes.filter(
        (probe) => !passedStatuses.has(probe.status),
      ).length;
      const observedRatio = Math.ceil(
        (signalCount * 100) / Math.max(context.runtimeProbes.length, deriveUnitValue()),
      );
      return { lossPercent: Math.max(deriveUnitValue(), observedRatio || evidenceWeight) };
    }
    case 'kill_process':
      return { restartDelayMs: Math.max(low, context.executionPhases.length * middle) };
    case 'dns_failure':
      return { failureDurationMs: Math.max(middle, baseDuration) };
    case 'disk_full':
      return {
        freeBytesThreshold: Math.max(
          deriveUnitValue(),
          context.evidenceText.length * evidenceWeight,
        ),
      };
    case 'cpu_spike':
      return { spikeDurationMs: Math.max(middle, baseDuration) };
  }
}

export function deriveChaosScenarioSeeds(context: ChaosEvidenceContext): ChaosScenarioSeed[] {
  const seeds = new Map<ChaosScenarioKind, ChaosScenarioSeed>();
  const addSeed = (kind: ChaosScenarioKind): void => {
    const evidenceWeight = deriveEvidenceWeight(context);
    seeds.set(kind, {
      kind,
      params: deriveSeedParams(context, kind),
      evidenceWeight,
    });
  };

  if (
    context.runtimeProbes.some((probe) => typeof probe.latencyMs === 'number') ||
    context.files.length > deriveZeroValue() ||
    context.capabilities.length > deriveZeroValue() ||
    context.artifactRecords.length > deriveZeroValue()
  ) {
    addSeed('latency');
  }
  if (
    /\b(fetch|http|client|provider|gateway|api|sdk|host|endpoint|url|webhook)\b/.test(
      context.evidenceText,
    )
  ) {
    addSeed('connection_drop');
    addSeed('dns_failure');
  }
  if (
    /\b(timeout|partial|stream|socket|connection|pool|drain|close)\b/.test(context.evidenceText)
  ) {
    addSeed('slow_close');
  }
  if (
    /\b(retry|queue|worker|redis|cache|cluster|replica|consistency)\b/.test(context.evidenceText)
  ) {
    addSeed('partition');
    addSeed('packet_loss');
  }
  if (/\b(cpu|process|worker|job|daemon|boot|start|restart)\b/.test(context.evidenceText)) {
    addSeed('kill_process');
    addSeed('cpu_spike');
  }
  if (
    /\b(disk|storage|upload|file|artifact|cache|persist|database|postgres|prisma)\b/.test(
      context.evidenceText,
    )
  ) {
    addSeed('disk_full');
  }
  if (seeds.size === deriveZeroValue()) {
    addSeed(
      (() => {
        const passed = discoverPropertyPassedStatusFromTypeEvidence();
        return context.runtimeProbes.some((probe) => probe.executed && !passed.has(probe.status));
      })()
        ? 'connection_drop'
        : 'latency',
    );
  }

  return [...seeds.values()].sort(
    (left, right) =>
      right.evidenceWeight - left.evidenceWeight || left.kind.localeCompare(right.kind),
  );
}

/** Generate the injection config for a kind/target combination. */
export function generateInjectionConfig(
  kind: ChaosScenarioKind,
  target: ChaosTarget,
  overrides?: Partial<{
    durationMs: number;
    intensity: number;
    params: Record<string, number>;
  }>,
): {
  durationMs: number;
  intensity: number;
  params: Record<string, number>;
} {
  if (!discoverChaosScenarioKindLabels().has(kind)) {
    throw new Error(`generateInjectionConfig: unknown ChaosScenarioKind ${kind}`);
  }
  const params = overrides?.params ?? {};
  const observedValues = Object.values(params).filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0,
  );
  const observedBase =
    observedValues.length > deriveZeroValue()
      ? Math.max(...observedValues)
      : Math.max(deriveUnitValue(), target.length * kind.length);
  const durationMs =
    overrides?.durationMs ?? observedBase * Math.max(deriveUnitValue(), target.split('_').length);
  const intensity =
    overrides?.intensity ??
    Math.min(
      deriveUnitValue(),
      Math.max(0.1, kind.split('_').join('').length / Math.max(target.length, deriveUnitValue())),
    );

  switch (kind) {
    case 'latency':
      return {
        durationMs,
        intensity,
        params: {
          latencyMs: params.latencyMs ?? observedBase,
        },
      };
    case 'connection_drop':
      return {
        durationMs,
        intensity,
        params: {
          reconnectWindowMs: params.reconnectWindowMs ?? observedBase,
        },
      };
    case 'slow_close':
      return {
        durationMs,
        intensity,
        params: {
          drainTimeMs: params.drainTimeMs ?? observedBase,
        },
      };
    case 'partition':
      return {
        durationMs,
        intensity,
        params: {
          isolatedMs: params.isolatedMs ?? observedBase,
          healDelayMs:
            params.healDelayMs ??
            Math.max(deriveUnitValue(), Math.ceil(observedBase / target.length)),
        },
      };
    case 'packet_loss':
      return {
        durationMs,
        intensity,
        params: { lossPercent: params.lossPercent ?? observedBase },
      };
    case 'kill_process':
      return {
        durationMs,
        intensity,
        params: {
          restartDelayMs: params.restartDelayMs ?? observedBase,
        },
      };
    case 'dns_failure':
      return {
        durationMs,
        intensity,
        params: {
          failureDurationMs: params.failureDurationMs ?? observedBase,
        },
      };
    case 'disk_full':
      return {
        durationMs,
        intensity,
        params: {
          freeBytesThreshold: params.freeBytesThreshold ?? observedBase,
        },
      };
    case 'cpu_spike':
      return {
        durationMs,
        intensity,
        params: {
          spikeDurationMs: params.spikeDurationMs ?? observedBase,
        },
      };
  }
}
