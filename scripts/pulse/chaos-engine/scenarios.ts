import type {
  ChaosEvidence,
  ChaosResult,
  ChaosScenario,
  ChaosScenarioKind,
  ChaosTarget,
} from '../types.chaos-engine';
import type { PulseCapability } from '../types.capabilities/03-capability';
import {
  ChaosProviderName,
  ChaosOperationalConcern,
  lookupChaosTargetEvidence,
  detectProviders,
  detectCodebaseTargets,
  loadCapabilities,
  loadRuntimeEvidence,
  loadExecutionTrace,
  loadEffectGraphRecords,
  compactBlastRadius,
  compactProviderDependencies,
  unique,
} from './detection';
import {
  computeBlastRadius,
  computeProviderBlastRadius,
  targetForDetectedDependency,
  dependencyLabel,
  deriveOperationalConcerns,
} from './blast-radius';
import {
  generateInjectionConfig,
  buildChaosEvidenceContext,
  deriveChaosScenarioSeeds,
} from './injection';
import { ensureDir, writeTextFile } from '../safe-fs';
import { safeJoin } from '../safe-path';
import { discoverAllObservedArtifactFilenames } from '../dynamic-reality-kernel/token-evidence';
import { discoverChaosResultLabels } from '../dynamic-reality-kernel/type-contract-engines';
import {
  deriveHttpStatusFromObservedCatalog,
  deriveZeroValue,
} from '../dynamic-reality-kernel/catalog-arithmetic';

export function buildChaosCatalog(rootDir: string): ChaosEvidence {
  const targets = detectCodebaseTargets(rootDir);
  const providers = detectProviders(rootDir);
  const capabilities = loadCapabilities(rootDir);
  const scenarios: ChaosScenario[] = [];
  scenarios.push(...generateChaosScenarios(rootDir, targets, capabilities));
  scenarios.push(...generateProviderScenarios(rootDir, providers, capabilities));
  const _chaosResults = discoverChaosResultLabels();
  const _degradedGracefully = [..._chaosResults].find((r) => r === 'degraded_gracefully');
  if (!_degradedGracefully)
    throw new Error('ChaosResult type contract missing degraded_gracefully member');
  const _crashed = [..._chaosResults].find((r) => r === 'crashed');
  if (!_crashed) throw new Error('ChaosResult type contract missing crashed member');
  const _notTested = [..._chaosResults].find((r) => r === 'not_tested');
  if (!_notTested) throw new Error('ChaosResult type contract missing not_tested member');
  const degradedGracefully = scenarios.filter((s) => s.result === _degradedGracefully).length;
  const crashed = scenarios.filter((s) => s.result === _crashed).length;
  const testedScenarios = scenarios.filter((s) => s.result !== _notTested).length;
  const blastRadiusMap: Record<string, string[]> = {};
  for (const scenario of scenarios) blastRadiusMap[scenario.id] = scenario.blastRadius;
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
    safeJoin(outputDir, discoverAllObservedArtifactFilenames().chaosEvidence),
    JSON.stringify(evidence, null, 2),
  );
  return evidence;
}

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
    if (
      target === lookupChaosTargetEvidence('postgres') ||
      target === lookupChaosTargetEvidence('redis')
    )
      continue;
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

function buildScenario(
  target: ChaosTarget,
  kind: ChaosScenarioKind,
  index: number,
  blastRadius: string[],
  params?: Record<string, number>,
): ChaosScenario {
  const config = generateInjectionConfig(kind, target, params !== undefined ? { params } : undefined);
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
    result: getChaosResultNotTested(),
    recoveryTimeMs: null,
    blastRadius,
    errorsObserved: [],
  };
}

let __chaosResultNotTestedCache: ChaosResult | undefined;
function getChaosResultNotTested(): ChaosResult {
  if (__chaosResultNotTestedCache) return __chaosResultNotTestedCache;
  const labels = discoverChaosResultLabels();
  for (const label of labels)
    if (label === 'not_tested') return (__chaosResultNotTestedCache = label);
  throw new Error('ChaosResult type contract missing not_tested member');
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
  const config = generateInjectionConfig(kind, target, params !== undefined ? { params } : undefined);
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
    result: getChaosResultNotTested(),
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
      const tier = classifyLatencyTier(latencyMs ?? deriveZeroValue());
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
      if (target === lookupChaosTargetEvidence('postgres')) {
        behavior +=
          ' Prisma connection pool MUST detect partial results and return error or timeout.';
        behavior += ' Transactions in-flight MUST be rolled back.';
      }
      if (target === lookupChaosTargetEvidence('redis')) {
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

type LatencyTier = 'low' | 'medium' | 'high' | 'extreme';

function classifyLatencyTier(ms: number): LatencyTier {
  const lowThreshold = deriveHttpStatusFromObservedCatalog('Continue');
  const mediumThreshold = lowThreshold + deriveHttpStatusFromObservedCatalog('Bad Request');
  const highThreshold =
    mediumThreshold +
    deriveHttpStatusFromObservedCatalog('Internal Server Error') +
    deriveHttpStatusFromObservedCatalog('OK');
  if (ms <= lowThreshold) return 'low';
  if (ms <= mediumThreshold) return 'medium';
  if (ms <= highThreshold) return 'high';
  return 'extreme';
}

function circuitBreakerPrediction(tier: LatencyTier): string {
  if (tier === 'low')
    return `Circuit breaker MUST NOT trip — ${tier} latency (≤100ms) is within normal variance`;
  if (tier === 'medium')
    return `Circuit breaker MAY trip if sustained over ${tier}-tier threshold — watch for cumulative timeout`;
  return `Circuit breaker MUST trip — ${tier} latency exceeds maximum acceptable threshold`;
}

function cacheFallbackPrediction(
  target: ChaosTarget,
  provider: ChaosProviderName | undefined,
  tier: LatencyTier,
  operationalConcerns: Set<ChaosOperationalConcern>,
): string {
  if (target === lookupChaosTargetEvidence('postgres')) {
    return tier === 'low' || tier === 'medium'
      ? 'No cache fallback needed — DB latency within bounds'
      : 'Cache fallback SHOULD activate — serve stale reads from Redis or in-memory cache';
  }
  if (target === lookupChaosTargetEvidence('redis'))
    return 'Redis unavailable — rate-limits MUST fail-open, session store MUST degrade to DB lookup';
  if (operationalConcerns.has('payment_idempotency'))
    return 'Payment operations MUST preserve idempotency keys and reuse cached session, price, or ledger reference data when retrying';
  if (operationalConcerns.has('ai_model_fallback_cache'))
    return 'AI calls SHOULD return cached completions for identical prompts, then fall back to a configured lower-cost model or an honest degraded response';
  if (operationalConcerns.has('whatsapp_queue_retry'))
    return 'WhatsApp delivery MUST be queued for retry so messages are delayed but not lost';
  if (operationalConcerns.has('email_retry_fallback'))
    return 'Email delivery MUST be queued with provider retry and SMTP or secondary-provider fallback when configured';
  if (provider)
    return 'External calls SHOULD use cached reference data or a graceful unavailable state when configured';
  return 'Fallback to stale cache if available — serve degraded response to user';
}

function queueRetryPrediction(
  target: ChaosTarget,
  provider: ChaosProviderName | undefined,
  operationalConcerns: Set<ChaosOperationalConcern>,
): string {
  if (target === lookupChaosTargetEvidence('redis'))
    return 'BullMQ jobs MUST retry with exponential backoff — queue processing delayed but preserved';
  if (operationalConcerns.has('whatsapp_queue_retry'))
    return 'Outbound WhatsApp messages MUST be enqueued and retried with bounded exponential backoff';
  if (operationalConcerns.has('email_retry_fallback'))
    return 'Email send jobs MUST retry with bounded exponential backoff before invoking the configured fallback channel';
  if (operationalConcerns.has('payment_idempotency'))
    return 'Payment webhooks and provider retries MUST remain idempotent against replay and duplicate callbacks';
  if (operationalConcerns.has('ai_model_fallback_cache'))
    return 'AI jobs MUST retry only inside the model budget and MUST read-through cache before switching fallback models';
  if (provider)
    return 'Outbound side effects MUST use bounded retries with idempotency protection when retryable';
  return 'Retry with exponential backoff — idempotency keys prevent duplicate processing';
}

function userImpactPrediction(
  provider: ChaosProviderName | undefined,
  tier: LatencyTier,
  operationalConcerns: Set<ChaosOperationalConcern>,
): string {
  if (operationalConcerns.has('payment_idempotency'))
    return 'Payment flows degrade honestly with retry prompts while duplicate charges, duplicate ledger entries, and duplicate payouts remain blocked';
  if (operationalConcerns.has('whatsapp_queue_retry'))
    return 'WhatsApp messaging degrades to delayed delivery, with real-time chat marked unavailable instead of dropping outbound messages';
  if (operationalConcerns.has('email_retry_fallback'))
    return 'Email delivery is delayed, and verification, password reset, onboarding, and campaign flows surface a pending or unavailable state';
  if (operationalConcerns.has('ai_model_fallback_cache'))
    return 'AI features degrade to cached output, fallback model output, or an honest unavailable response without fabricated answers';
  if (tier === 'low' || tier === 'medium')
    return 'User impact minimal — slight delay in response, no visible errors';
  if (provider)
    return 'Dependent user flows degraded — users see retry prompts, delayed completion, or honest unavailable state';
  return 'User-visible degradation — timeouts, retry prompts, or partial feature unavailability';
}

function operationalRecoveryPrediction(operationalConcerns: Set<ChaosOperationalConcern>): string {
  const predictions: string[] = [];
  if (operationalConcerns.has('payment_idempotency'))
    predictions.push(
      'Payment recovery MUST reconcile provider state without duplicating charges, ledger entries, splits, or payouts.',
    );
  if (operationalConcerns.has('whatsapp_queue_retry'))
    predictions.push(
      'WhatsApp recovery MUST drain queued messages through the normal retry worker.',
    );
  if (operationalConcerns.has('email_retry_fallback'))
    predictions.push(
      'Email recovery MUST drain pending sends and preserve fallback audit evidence.',
    );
  if (operationalConcerns.has('ai_model_fallback_cache'))
    predictions.push(
      'AI recovery MUST invalidate stale model-failure state while preserving cache consistency.',
    );
  return predictions.join(' ');
}
