import type {
  PulseCapability,
  PulseRuntimeEvidence,
  PulseExecutionTrace,
  PulseRuntimeProbe,
} from '../../types';
import type { ChaosScenarioKind, ChaosTarget } from '../../types.chaos-engine';
import type {
  ChaosProviderName,
  ChaosOperationalConcern,
  ChaosEvidenceContext,
  ChaosScenarioSeed,
} from './types';
import { unique } from './helpers';
import { computeProviderBlastRadius } from './blast-radius';

export function hasOperationalEvidence(text: string, pattern: RegExp): boolean {
  return pattern.test(text.replace(/[-_/.:]+/g, ' '));
}

export function buildOperationalEvidenceText(
  provider: ChaosProviderName | undefined,
  providerFiles: string[],
  capabilities: PulseCapability[],
): string {
  const blastRadius = provider
    ? new Set(computeProviderBlastRadius(provider, providerFiles, capabilities))
    : new Set<string>();
  const capabilityEvidence = capabilities
    .filter((capability) => !provider || blastRadius.has(capability.id))
    .flatMap((capability) => [
      capability.id,
      capability.name,
      ...capability.filePaths,
      ...capability.routePatterns,
      ...capability.evidenceSources,
      ...capability.validationTargets,
      ...capability.rolesPresent,
    ]);

  return [provider ?? '', ...providerFiles, ...capabilityEvidence].join(' ').toLowerCase();
}

export function deriveOperationalConcerns(
  provider: ChaosProviderName | undefined,
  providerFiles: string[],
  capabilities: PulseCapability[],
): Set<ChaosOperationalConcern> {
  const evidenceText = buildOperationalEvidenceText(provider, providerFiles, capabilities);
  const concerns = new Set<ChaosOperationalConcern>();

  if (
    hasOperationalEvidence(
      evidenceText,
      /\b(payment|checkout|billing|invoice|subscription|wallet|ledger|split|payout|refund|chargeback|settlement|idempotency|idempotent)\b/,
    )
  ) {
    concerns.add('payment_idempotency');
  }

  if (
    hasOperationalEvidence(
      evidenceText,
      /\b(whatsapp|waha|waba|phone\s*number|message|messaging|conversation|inbox|chat|queue|retry)\b/,
    )
  ) {
    concerns.add('whatsapp_queue_retry');
  }

  if (
    hasOperationalEvidence(
      evidenceText,
      /\b(email|mail|smtp|resend|sendgrid|postmark|verification|password\s*reset|welcome|deliverability)\b/,
    )
  ) {
    concerns.add('email_retry_fallback');
  }

  if (
    hasOperationalEvidence(
      evidenceText,
      /\b(ai|llm|model|prompt|completion|embedding|agent|copilot|autopilot|brain|openai|anthropic|cache)\b/,
    )
  ) {
    concerns.add('ai_model_fallback_cache');
  }

  return concerns;
}

export function normalizeEvidenceText(value: unknown): string {
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

export function recordFilePath(record: Record<string, unknown>): string {
  const metadata = record.metadata as Record<string, unknown> | undefined;
  for (const candidate of [record.filePath, record.file, metadata?.filePath, metadata?.file]) {
    if (typeof candidate === 'string') {
      return candidate;
    }
  }
  return '';
}

export function textMentionsDependency(
  text: string,
  dependency: ChaosProviderName,
  files: string[],
): boolean {
  const normalized = text.toLowerCase();
  const dependencyTokens = unique(
    dependency.split(/[^a-zA-Z0-9]+/).filter((token) => {
      const normalizedToken = token.toLowerCase();
      return (
        token.length > 'api'.length &&
        ![
          'api',
          'behavior',
          'client',
          'dependency',
          'env',
          'external',
          'host',
          'http',
          'package',
          'provider',
          'target',
        ].includes(normalizedToken)
      );
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

export function evidenceNumbers(context: ChaosEvidenceContext): number[] {
  const runtimeNumbers = context.runtimeProbes.flatMap((probe) => [
    probe.latencyMs,
    ...Object.values(probe.metrics ?? {}),
  ]);
  const phaseDurations = context.executionPhases.map((phase) => phase.durationMs);
  const numericValues = [...runtimeNumbers, ...phaseDurations].filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0,
  );
  if (numericValues.length > 0) {
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

export function evidenceQuantile(values: number[], numerator: number, denominator: number): number {
  if (values.length === 0) {
    return denominator;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.floor(((sorted.length - 1) * numerator) / Math.max(denominator, 1)),
  );
  return Math.max(1, Math.ceil(sorted[index] ?? denominator));
}

export function deriveEvidenceWeight(context: ChaosEvidenceContext): number {
  return Math.max(
    1,
    context.files.length +
      context.capabilities.length +
      context.runtimeProbes.length +
      context.executionPhases.length +
      context.artifactRecords.length,
  );
}

export function deriveSeedParams(
  context: ChaosEvidenceContext,
  kind: ChaosScenarioKind,
): Record<string, number> {
  const numbers = evidenceNumbers(context);
  const low = evidenceQuantile(numbers, 1, Math.max(numbers.length, 1));
  const middle = evidenceQuantile(
    numbers,
    Math.ceil(numbers.length / 2),
    Math.max(numbers.length, 1),
  );
  const high = evidenceQuantile(
    numbers,
    Math.max(numbers.length - 1, 1),
    Math.max(numbers.length, 1),
  );
  const evidenceWeight = deriveEvidenceWeight(context);
  const baseDuration = Math.max(high, middle * Math.max(evidenceWeight, 1));

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
      const signalCount = context.runtimeProbes.filter((probe) => probe.status !== 'passed').length;
      const observedRatio = Math.ceil(
        (signalCount * 100) / Math.max(context.runtimeProbes.length, 1),
      );
      return { lossPercent: Math.max(1, observedRatio || evidenceWeight) };
    }
    case 'kill_process':
      return { restartDelayMs: Math.max(low, context.executionPhases.length * middle) };
    case 'dns_failure':
      return { failureDurationMs: Math.max(middle, baseDuration) };
    case 'disk_full':
      return { freeBytesThreshold: Math.max(1, context.evidenceText.length * evidenceWeight) };
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
    context.files.length > 0 ||
    context.capabilities.length > 0 ||
    context.artifactRecords.length > 0
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
  if (seeds.size === 0) {
    addSeed(
      context.runtimeProbes.some((probe) => probe.executed && probe.status !== 'passed')
        ? 'connection_drop'
        : 'latency',
    );
  }

  return [...seeds.values()].sort(
    (left, right) =>
      right.evidenceWeight - left.evidenceWeight || left.kind.localeCompare(right.kind),
  );
}
