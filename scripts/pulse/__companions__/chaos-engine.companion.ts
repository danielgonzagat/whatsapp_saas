// ── Generic target detection (kept for backward compat) ───────────────────

function detectCodebaseTargets(rootDir: string): Set<ChaosTarget> {
  const found = new Set<ChaosTarget>();
  const backendDirs = [
    safeJoin(rootDir, 'backend', 'src'),
    safeJoin(rootDir, 'worker', 'src'),
    safeJoin(rootDir, 'worker'),
  ];

  const allFiles: string[] = [];
  for (const dir of backendDirs) {
    if (pathExists(dir)) {
      allFiles.push(
        ...walkFiles(dir, ['.ts', '.tsx']).filter(
          (f) => !/\.(spec|test)\.ts$|__tests__|__mocks__|dist\//.test(f),
        ),
      );
    }
  }

  for (const file of allFiles) {
    const content = readSafe(file);
    for (const target of classifyTargetsFromSource(content)) {
      found.add(target);
    }
  }

  return found;
}

export function classifyTargetsFromSource(content: string): Set<ChaosTarget> {
  const targets = new Set<ChaosTarget>();
  if (PRISMA_OPERATION_RE.test(content)) {
    targets.add('postgres');
  }
  if (QUEUE_OR_CACHE_RE.test(content)) {
    targets.add('redis');
  }
  if (hasInternalRouteEvidence(content)) {
    targets.add('internal_api');
  }
  if (EXTERNAL_HTTP_RE.test(content)) {
    targets.add('external_http');
  }
  if (WEBHOOK_RECEIVER_RE.test(content)) {
    targets.add('webhook_receiver');
  }
  return targets;
}

function loadCapabilities(rootDir: string): PulseCapability[] {
  const capabilityPath = safeJoin(rootDir, '.pulse', 'current', 'PULSE_CAPABILITY_STATE.json');
  if (!pathExists(capabilityPath)) {
    return [];
  }
  try {
    const state = readJsonFile<{ capabilities: PulseCapability[] }>(capabilityPath);
    return state.capabilities ?? [];
  } catch {
    return [];
  }
}

function loadMatrixPaths(rootDir: string): PulseExecutionMatrix['paths'] {
  const matrixPath = safeJoin(rootDir, '.pulse', 'current', 'PULSE_EXECUTION_MATRIX.json');
  if (!pathExists(matrixPath)) {
    return [];
  }
  try {
    const matrix = readJsonFile<PulseExecutionMatrix>(matrixPath);
    return matrix.paths ?? [];
  } catch {
    return [];
  }
}

function loadRuntimeEvidence(rootDir: string): PulseRuntimeEvidence | null {
  const runtimePath = safeJoin(rootDir, '.pulse', 'current', 'PULSE_RUNTIME_EVIDENCE.json');
  if (!pathExists(runtimePath)) {
    return null;
  }
  try {
    return readJsonFile<PulseRuntimeEvidence>(runtimePath);
  } catch {
    return null;
  }
}

function loadExecutionTrace(rootDir: string): PulseExecutionTrace | null {
  const tracePath = safeJoin(rootDir, '.pulse', 'current', 'PULSE_EXECUTION_TRACE.json');
  if (!pathExists(tracePath)) {
    return null;
  }
  try {
    return readJsonFile<PulseExecutionTrace>(tracePath);
  } catch {
    return null;
  }
}

function loadEffectGraphRecords(rootDir: string): Record<string, unknown>[] {
  return [
    ...loadArtifactRecords(rootDir, 'PULSE_BEHAVIOR_GRAPH.json'),
    ...loadArtifactRecords(rootDir, 'PULSE_STRUCTURAL_GRAPH.json'),
    ...loadArtifactRecords(rootDir, 'PULSE_EFFECT_GRAPH.json'),
    ...loadArtifactRecords(rootDir, 'PULSE_RUNTIME_FUSION.json'),
  ];
}

// ── Blast-radius computation ──────────────────────────────────────────────

/** Find all capabilities that structurally depend on a target class. */
export function computeBlastRadius(target: ChaosTarget, capabilities: PulseCapability[]): string[] {
  return capabilities
    .filter((cap) => {
      const roles = new Set(cap.rolesPresent ?? []);
      if (target === 'postgres') {
        return roles.has('persistence');
      }
      if (target === 'redis') {
        return roles.has('side_effect') || roles.has('orchestration');
      }
      if (target === 'internal_api') {
        return roles.has('interface') || cap.routePatterns.length > 0;
      }
      if (target === 'external_http' || target === 'webhook_receiver') {
        return roles.has('side_effect') || cap.routePatterns.length > 0;
      }
      return false;
    })
    .map((cap) => cap.id);
}

/**
 * Compute blast radius specific to a named provider.
 *
 * This is broader than the target-level blast radius because it checks
 * for provider-specific file references and capability name patterns.
 */
export function computeProviderBlastRadius(
  provider: ChaosProviderName,
  providerFiles: string[],
  capabilities: PulseCapability[],
): string[] {
  const target = targetForDetectedDependency(provider, providerFiles);
  const baseRadius = computeBlastRadius(target, capabilities);
  const baseIds = new Set(baseRadius);

  // Add capabilities whose file paths overlap with provider detection.
  for (const cap of capabilities) {
    if (baseIds.has(cap.id)) continue;
    const capFiles = new Set(cap.filePaths ?? []);
    const hasOverlap = providerFiles.some((pf) => capFiles.has(pf));
    if (hasOverlap) {
      baseIds.add(cap.id);
    }
  }

  return compactBlastRadius([...baseIds].sort());
}

function targetForDetectedDependency(
  dependency: ChaosProviderName,
  dependencyFiles: string[],
): ChaosTarget {
  if (dependency === dependencyId('target', 'postgres')) {
    return 'postgres';
  }
  if (dependency === dependencyId('target', 'redis')) {
    return 'redis';
  }
  if (dependencyFiles.some((file) => file.includes('webhook'))) {
    return 'webhook_receiver';
  }
  return 'external_http';
}

function dependencyLabel(dependency: ChaosProviderName): string {
  const [, rawName = dependency] = dependency.split(/:(.*)/s);
  const name = rawName.replace(/[-_]+/g, ' ').trim();
  return name ? `external dependency ${name}` : 'external dependency';
}

function hasOperationalEvidence(text: string, pattern: RegExp): boolean {
  return pattern.test(text.replace(/[-_/.:]+/g, ' '));
}

function buildOperationalEvidenceText(
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

function deriveOperationalConcerns(
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

function buildChaosEvidenceContext(
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

function evidenceQuantile(values: number[], numerator: number, denominator: number): number {
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

function deriveEvidenceWeight(context: ChaosEvidenceContext): number {
  return Math.max(
    1,
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

function deriveChaosScenarioSeeds(context: ChaosEvidenceContext): ChaosScenarioSeed[] {
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
  const params = overrides?.params ?? {};
  const observedValues = Object.values(params).filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0,
  );
  const observedBase =
    observedValues.length > 0
      ? Math.max(...observedValues)
      : Math.max(1, target.length * kind.length);
  const durationMs = overrides?.durationMs ?? observedBase * Math.max(1, target.split('_').length);
  const intensity =
    overrides?.intensity ??
    Math.min(1, Math.max(0.1, kind.split('_').join('').length / Math.max(target.length, 1)));

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
          healDelayMs: params.healDelayMs ?? Math.max(1, Math.ceil(observedBase / target.length)),
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

// ── Public API ────────────────────────────────────────────────────────────

/** Build the full chaos evidence catalog and persist it to disk. */
export function buildChaosCatalog(rootDir: string): ChaosEvidence {
  const targets = detectCodebaseTargets(rootDir);
  const providers = detectProviders(rootDir);
  const capabilities = loadCapabilities(rootDir);

  const scenarios: ChaosScenario[] = [];

  // Generic-target scenarios.
  scenarios.push(...generateChaosScenarios(rootDir, targets, capabilities));

  // Provider-specific scenarios.
  scenarios.push(...generateProviderScenarios(rootDir, providers, capabilities));

  const degradedGracefully = scenarios.filter((s) => s.result === 'degraded_gracefully').length;
  const crashed = scenarios.filter((s) => s.result === 'crashed').length;
  const testedScenarios = scenarios.filter((s) => s.result !== 'not_tested').length;

  const blastRadiusMap: Record<string, string[]> = {};
  for (const scenario of scenarios) {
    blastRadiusMap[scenario.id] = scenario.blastRadius;
  }

  // Add provider-level blast radius entries.
  for (const [provider, providerFiles] of providers) {
    const key = `chaos_provider:${provider}`;
    blastRadiusMap[key] = computeProviderBlastRadius(provider, providerFiles, capabilities);
  }

  const evidence: ChaosEvidence = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalScenarios: scenarios.length,
      testedScenarios,
      degradedGracefully,
      crashed,
      blastRadiusMap,
    },
    scenarios,
  };

  const outputDir = safeJoin(rootDir, '.pulse', 'current');
  ensureDir(outputDir, { recursive: true });
  writeTextFile(
    safeJoin(outputDir, 'PULSE_CHAOS_EVIDENCE.json'),
    JSON.stringify(evidence, null, 2),
  );

  return evidence;
}

/** Generate chaos scenario definitions for detected generic targets. */
export function generateChaosScenarios(
  rootDir: string,
  targets?: Set<ChaosTarget>,
  capabilities?: PulseCapability[],
): ChaosScenario[] {
  const detectedTargets = targets ?? detectCodebaseTargets(rootDir);
  const loadedCapabilities = capabilities ?? loadCapabilities(rootDir);
  const runtimeEvidence = loadRuntimeEvidence(rootDir);
  const executionTrace = loadExecutionTrace(rootDir);
  const effectRecords = loadEffectGraphRecords(rootDir);
  const scenarios: ChaosScenario[] = [];
  let index = 0;

  for (const target of detectedTargets) {
    const blastRadius = compactBlastRadius(computeBlastRadius(target, loadedCapabilities));
    const targetCapabilities = loadedCapabilities.filter((capability) =>
      blastRadius.includes(capability.id),
    );
    const targetFiles = unique(targetCapabilities.flatMap((capability) => capability.filePaths));
    const context = buildChaosEvidenceContext(
      `target:${target}`,
      target,
      targetFiles,
      loadedCapabilities,
      runtimeEvidence,
      executionTrace,
      effectRecords,
    );

    for (const seed of deriveChaosScenarioSeeds(context)) {
      scenarios.push(buildScenario(target, seed.kind, index++, blastRadius, seed.params));
    }
  }

  return scenarios;
}

/**
 * Generate chaos scenarios for specific external providers detected
 * in the codebase.
 */
export function generateProviderScenarios(
  rootDir: string,
  providers?: Map<ChaosProviderName, string[]>,
  capabilities?: PulseCapability[],
): ChaosScenario[] {
  const detectedProviders = providers ?? detectProviders(rootDir);
  const loadedCapabilities = capabilities ?? loadCapabilities(rootDir);
  const runtimeEvidence = loadRuntimeEvidence(rootDir);
  const executionTrace = loadExecutionTrace(rootDir);
  const effectRecords = loadEffectGraphRecords(rootDir);
  const scenarios: ChaosScenario[] = [];
  let index = 0;

  for (const [provider, providerFiles] of compactProviderDependencies(detectedProviders)) {
    const target = targetForDetectedDependency(provider, providerFiles);
    if (target === 'postgres' || target === 'redis') {
      continue;
    }
    const blastRadius = computeProviderBlastRadius(provider, providerFiles, loadedCapabilities);
    const operationalConcerns = deriveOperationalConcerns(
      provider,
      providerFiles,
      loadedCapabilities,
    );
    const context = buildChaosEvidenceContext(
      provider,
      target,
      providerFiles,
      loadedCapabilities,
      runtimeEvidence,
      executionTrace,
      effectRecords,
    );

    for (const seed of deriveChaosScenarioSeeds(context)) {
      scenarios.push(
        buildProviderScenario(
          provider,
          target,
          seed.kind,
          index++,
          blastRadius,
          operationalConcerns,
          seed.params,
        ),
      );
    }
  }

  return scenarios;
}

// ── Internal builders ─────────────────────────────────────────────────────

function buildScenario(
  target: ChaosTarget,
  kind: ChaosScenarioKind,
  index: number,
  blastRadius: string[],
  params?: Record<string, number>,
): ChaosScenario {
  const config = generateInjectionConfig(kind, target, {
    params,
  });
  const description = buildDescription(kind, target, config, undefined);
  const expectedBehavior = buildExpectedBehavior(kind, target, config, undefined);

  return {
    id: `chaos:${target}:${kind}:${index}`,
    kind,
    target,
    description,
    injectionConfig: config,
    expectedBehavior,
    affectedCapabilities: blastRadius,
    result: 'not_tested',
    recoveryTimeMs: null,
    blastRadius,
    errorsObserved: [],
  };
}

function buildProviderScenario(
  provider: ChaosProviderName,
  target: ChaosTarget,
  kind: ChaosScenarioKind,
  index: number,
  blastRadius: string[],
  operationalConcerns: Set<ChaosOperationalConcern>,
  params?: Record<string, number>,
): ChaosScenario {
  const config = generateInjectionConfig(kind, target, {
    params,
  });
  const description = buildDescription(kind, target, config, provider);
  const expectedBehavior = buildExpectedBehavior(
    kind,
    target,
    config,
    provider,
    operationalConcerns,
  );

  return {
    id: `chaos:provider:${provider}:${kind}:${index}`,
    kind,
    target,
    description,
    injectionConfig: config,
    expectedBehavior,
    affectedCapabilities: blastRadius,
    result: 'not_tested',
    recoveryTimeMs: null,
    blastRadius,
    errorsObserved: [],
  };
}

function buildDescription(
  kind: ChaosScenarioKind,
  target: ChaosTarget,
  config: ReturnType<typeof generateInjectionConfig>,
  provider?: ChaosProviderName,
): string {
  const label = provider
    ? dependencyLabel(provider)
    : target.replace(/_/g, ' ').replace(/api/gi, 'API').toUpperCase();

  switch (kind) {
    case 'latency':
      return `${label} injected with ${config.params.latencyMs ?? 'unknown'}ms latency for ${config.durationMs}ms`;
    case 'connection_drop':
      return `${label} connection dropped for ${config.durationMs}ms`;
    case 'slow_close':
      return `${label} slow-close with ${config.params.drainTimeMs ?? 'unknown'}ms drain time`;
    case 'partition':
      return `${label} network partition isolated for ${config.params.isolatedMs ?? 'unknown'}ms`;
    case 'packet_loss':
      return `${label} packet loss at ${config.params.lossPercent ?? 'unknown'}% for ${config.durationMs}ms`;
    case 'kill_process':
      return `${label} process killed with ${config.params.restartDelayMs ?? 'unknown'}ms restart delay`;
    case 'dns_failure':
      return `${label} DNS failure for ${config.params.failureDurationMs ?? 'unknown'}ms`;
    case 'disk_full':
      return `${label} disk full simulation (threshold ${config.params.freeBytesThreshold ?? 'unknown'} bytes)`;
    case 'cpu_spike':
      return `${label} CPU spike for ${config.params.spikeDurationMs ?? 'unknown'}ms`;
  }
}

/**
 * Build a detailed expected-behavior prediction for a chaos scenario.
 *
 * Each prediction covers:
 * - Circuit breaker behavior
 * - Fallback / cache strategy
 * - Queue / retry expectations
 * - User-visible degradation
 * - Recovery path
 */
function buildExpectedBehavior(
  kind: ChaosScenarioKind,
  target: ChaosTarget,
  config: ReturnType<typeof generateInjectionConfig>,
  provider?: ChaosProviderName,
  operationalConcerns = new Set<ChaosOperationalConcern>(),
): string {
  const latencyMs = config.params.latencyMs as number | undefined;
  const providerLabel = provider ? dependencyLabel(provider) : target;

  switch (kind) {
    case 'latency': {
      const tier = classifyLatencyTier(latencyMs ?? 0);
      let behavior = circuitBreakerPrediction(tier);
      behavior += '; ' + cacheFallbackPrediction(target, provider, tier, operationalConcerns);
      behavior += '; ' + queueRetryPrediction(target, provider, operationalConcerns);
      behavior += '; ' + userImpactPrediction(provider, tier, operationalConcerns);
      return behavior;
    }

    case 'connection_drop': {
      let behavior = `Circuit breaker MUST open within 3 failed probes to ${providerLabel}.`;
      behavior += ' Connection pool MUST drain. Health check MUST return degraded.';
      behavior += ' All in-flight requests MUST fail with 503 Service Unavailable.';
      behavior += ' Critical-path operations (payments/auth) MUST fail closed (deny).';
      behavior += ' Non-critical operations MUST use stale cache if available.';
      behavior += ' ' + operationalRecoveryPrediction(operationalConcerns);
      behavior +=
        ' Recovery: breaker half-opens after 30s, full-open resets after 2 consecutive successes.';
      return behavior;
    }

    case 'slow_close': {
      let behavior = `Persistent connections to ${providerLabel} drain slowly — partial responses may arrive.`;
      if (target === 'postgres') {
        behavior +=
          ' Prisma connection pool MUST detect partial results and return error or timeout.';
        behavior += ' Transactions in-flight MUST be rolled back.';
      }
      if (target === 'redis') {
        behavior += ' Redis client MUST timeout on incomplete responses.';
        behavior += ' Rate-limiting fallback MUST allow operations (fail-open for non-critical).';
      }
      behavior += ' Node connection pool MUST be drained and re-established.';
      return behavior;
    }

    case 'partition': {
      let behavior = `Redis cluster partition: isolated nodes cannot communicate.`;
      behavior += ' Stale data MUST be served from local fallback.';
      behavior += ' Writes MUST be queued for reconciliation.';
      behavior +=
        ' Partition MUST heal within timeout window (${config.params.healDelayMs ?? 10000}ms).';
      behavior += ' After heal, queue MUST replay, consistency MUST be restored.';
      return behavior;
    }

    case 'packet_loss': {
      let behavior = `${providerLabel} experiencing ${config.params.lossPercent ?? 30}% packet loss.`;
      behavior += ' HTTP retries (with exponential backoff) MUST succeed within the retry budget.';
      behavior += ' Idempotency keys MUST prevent duplicate side effects from retries.';
      behavior += ' ' + operationalRecoveryPrediction(operationalConcerns);
      behavior += ' Circuit breaker MAY open if error rate exceeds threshold despite retries.';
      return behavior;
    }

    case 'dns_failure': {
      let behavior = `DNS resolution for ${providerLabel} fails — endpoint unreachable.`;
      behavior += ' Connection MUST fail immediately (no long TCP timeouts).';
      behavior += ' Any cached DNS entries MUST NOT be used (avoid split-brain).';
      behavior += ' Health check MUST return critical for affected capabilities.';
      behavior += ' ' + operationalRecoveryPrediction(operationalConcerns);
      behavior += ' Recovery: DNS resolution MUST succeed after failure window closes.';
      return behavior;
    }

    default:
      return (
        `System MUST degrade gracefully when ${target.replace(/_/g, ' ')} ` +
        `experiences ${kind.replace(/_/g, ' ')}. ` +
        'Circuit breaker SHOULD protect upstream callers. ' +
        'Fallback responses or cached data SHOULD be served where available.'
      );
  }
}

// ── Prediction helpers ────────────────────────────────────────────────────

type LatencyTier = 'low' | 'medium' | 'high' | 'extreme';

function classifyLatencyTier(ms: number): LatencyTier {
  if (ms <= 100) return 'low';
  if (ms <= 500) return 'medium';
  if (ms <= 2000) return 'high';
  return 'extreme';
}

function circuitBreakerPrediction(tier: LatencyTier): string {
  if (tier === 'low') {
    return `Circuit breaker MUST NOT trip — ${tier} latency (≤100ms) is within normal variance`;
  }
  if (tier === 'medium') {
    return `Circuit breaker MAY trip if sustained over ${tier}-tier threshold — watch for cumulative timeout`;
  }
  return `Circuit breaker MUST trip — ${tier} latency exceeds maximum acceptable threshold`;
}

function cacheFallbackPrediction(
  target: ChaosTarget,
  provider: ChaosProviderName | undefined,
  tier: LatencyTier,
  operationalConcerns: Set<ChaosOperationalConcern>,
): string {
  if (target === 'postgres') {
    return tier === 'low' || tier === 'medium'
      ? 'No cache fallback needed — DB latency within bounds'
      : 'Cache fallback SHOULD activate — serve stale reads from Redis or in-memory cache';
  }
  if (target === 'redis') {
    return 'Redis unavailable — rate-limits MUST fail-open, session store MUST degrade to DB lookup';
  }
  if (operationalConcerns.has('payment_idempotency')) {
    return 'Payment operations MUST preserve idempotency keys and reuse cached session, price, or ledger reference data when retrying';
  }
  if (operationalConcerns.has('ai_model_fallback_cache')) {
    return 'AI calls SHOULD return cached completions for identical prompts, then fall back to a configured lower-cost model or an honest degraded response';
  }
  if (operationalConcerns.has('whatsapp_queue_retry')) {
    return 'WhatsApp delivery MUST be queued for retry so messages are delayed but not lost';
  }
  if (operationalConcerns.has('email_retry_fallback')) {
    return 'Email delivery MUST be queued with provider retry and SMTP or secondary-provider fallback when configured';
  }
  if (provider) {
    return 'External calls SHOULD use cached reference data or a graceful unavailable state when configured';
  }
  return 'Fallback to stale cache if available — serve degraded response to user';
}

function queueRetryPrediction(
  target: ChaosTarget,
  provider: ChaosProviderName | undefined,
  operationalConcerns: Set<ChaosOperationalConcern>,
): string {
  if (target === 'redis') {
    return 'BullMQ jobs MUST retry with exponential backoff — queue processing delayed but preserved';
  }
  if (operationalConcerns.has('whatsapp_queue_retry')) {
    return 'Outbound WhatsApp messages MUST be enqueued and retried with bounded exponential backoff';
  }
  if (operationalConcerns.has('email_retry_fallback')) {
    return 'Email send jobs MUST retry with bounded exponential backoff before invoking the configured fallback channel';
  }
  if (operationalConcerns.has('payment_idempotency')) {
    return 'Payment webhooks and provider retries MUST remain idempotent against replay and duplicate callbacks';
  }
  if (operationalConcerns.has('ai_model_fallback_cache')) {
    return 'AI jobs MUST retry only inside the model budget and MUST read-through cache before switching fallback models';
  }
  if (provider) {
    return 'Outbound side effects MUST use bounded retries with idempotency protection when retryable';
  }
  return 'Retry with exponential backoff — idempotency keys prevent duplicate processing';
}

function userImpactPrediction(
  provider: ChaosProviderName | undefined,
  tier: LatencyTier,
  operationalConcerns: Set<ChaosOperationalConcern>,
): string {
  if (operationalConcerns.has('payment_idempotency')) {
    return 'Payment flows degrade honestly with retry prompts while duplicate charges, duplicate ledger entries, and duplicate payouts remain blocked';
  }
  if (operationalConcerns.has('whatsapp_queue_retry')) {
    return 'WhatsApp messaging degrades to delayed delivery, with real-time chat marked unavailable instead of dropping outbound messages';
  }
  if (operationalConcerns.has('email_retry_fallback')) {
    return 'Email delivery is delayed, and verification, password reset, onboarding, and campaign flows surface a pending or unavailable state';
  }
  if (operationalConcerns.has('ai_model_fallback_cache')) {
    return 'AI features degrade to cached output, fallback model output, or an honest unavailable response without fabricated answers';
  }
  if (tier === 'low' || tier === 'medium') {
    return 'User impact minimal — slight delay in response, no visible errors';
  }
  if (provider) {
    return 'Dependent user flows degraded — users see retry prompts, delayed completion, or honest unavailable state';
  }
  return 'User-visible degradation — timeouts, retry prompts, or partial feature unavailability';
}

function operationalRecoveryPrediction(operationalConcerns: Set<ChaosOperationalConcern>): string {
  const predictions: string[] = [];
  if (operationalConcerns.has('payment_idempotency')) {
    predictions.push(
      'Payment recovery MUST reconcile provider state without duplicating charges, ledger entries, splits, or payouts.',
    );
  }
  if (operationalConcerns.has('whatsapp_queue_retry')) {
    predictions.push(
      'WhatsApp recovery MUST drain queued messages through the normal retry worker.',
    );
  }
  if (operationalConcerns.has('email_retry_fallback')) {
    predictions.push(
      'Email recovery MUST drain pending sends and preserve fallback audit evidence.',
    );
  }
  if (operationalConcerns.has('ai_model_fallback_cache')) {
    predictions.push(
      'AI recovery MUST invalidate stale model-failure state while preserving cache consistency.',
    );
  }
  return predictions.join(' ');
}

// ── Dependency detection ──────────────────────────────────────────────────

/** Scan source and artifacts for external dependencies used in the codebase. */
export function detectProviders(rootDir: string): Map<ChaosProviderName, string[]> {
  const providerFiles = new Map<ChaosProviderName, string[]>();
  const backendDirs = [
    safeJoin(rootDir, 'backend', 'src'),
    safeJoin(rootDir, 'worker', 'src'),
    safeJoin(rootDir, 'worker'),
  ];

  const allFiles: string[] = [];
  for (const dir of backendDirs) {
    if (pathExists(dir)) {
      allFiles.push(
        ...walkFiles(dir, ['.ts', '.tsx']).filter(
          (f) => !/\.(spec|test)\.ts$|__tests__|__mocks__|dist\//.test(f),
        ),
      );
    }
  }

  for (const file of allFiles) {
    const content = readSafe(file);
    addDependenciesFromSource(providerFiles, rootDir, file, content);
  }

  addDependenciesFromPulseArtifacts(providerFiles, rootDir);

  return providerFiles;
}
