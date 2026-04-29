/**
 * PULSE Wave 6, Module A — Chaos Engineering Engine.
 *
 * Generates a catalog of chaos scenario definitions for every external
 * dependency, computes blast-radius mappings, and persists the result as
 * {@link ChaosEvidence} at `.pulse/current/PULSE_CHAOS_EVIDENCE.json`.
 *
 * All work is static — no live infrastructure is touched. Every scenario
 * is marked as `not_tested` pending staging execution with Toxiproxy or
 * equivalent network fault injection.
 *
 * ## Provider detection
 *
 * The engine scans `backend/src/` and `worker/src/` for references to
 * specific external providers (Stripe, OpenAI, Meta/WhatsApp, Resend) and
 * infrastructure targets (PostgreSQL, Redis). Each provider gets:
 *
 * - Multi-tier latency injection (50 / 200 / 1000 / 5000 ms)
 * - Connection-drop simulation
 * - Slow-close / partial-response scenarios
 *
 * Every scenario includes a predicted graceful-degradation path:
 * circuit-breaker trip, fallback-to-cache, queue retry, or user-visible
 * degradation.
 */

import * as path from 'path';
import type {
  ChaosEvidence,
  ChaosResult,
  ChaosScenario,
  ChaosScenarioKind,
  ChaosTarget,
} from './types.chaos-engine';
import type { PulseCapability, PulseExecutionMatrix } from './types';
import { walkFiles } from './parsers/utils';
import { readTextFile, readJsonFile, writeTextFile, ensureDir, pathExists } from './safe-fs';
import { safeJoin } from './safe-path';

// ── External provider taxonomy ────────────────────────────────────────────

/**
 * Specific external provider detected in the codebase.
 *
 * These extend the generic {@link ChaosTarget} taxonomy with real-world
 * SaaS and infrastructure providers so that the chaos catalog can name
 * concrete failure modes (e.g. "Stripe API timeout" instead of just
 * "external_http timeout").
 */
export type ChaosProviderName =
  | 'stripe'
  | 'openai'
  | 'meta_whatsapp'
  | 'resend'
  | 'postgres'
  | 'redis'
  | 'generic_http';

/** Maps each provider to the generic target class it exercises. */
const PROVIDER_TO_TARGET: Record<ChaosProviderName, ChaosTarget> = {
  stripe: 'external_http',
  openai: 'external_http',
  meta_whatsapp: 'external_http',
  resend: 'external_http',
  postgres: 'postgres',
  redis: 'redis',
  generic_http: 'external_http',
};

/** Human-readable labels for provider names. */
const PROVIDER_LABELS: Record<ChaosProviderName, string> = {
  stripe: 'Stripe API',
  openai: 'OpenAI API',
  meta_whatsapp: 'Meta / WhatsApp API',
  resend: 'Resend Email API',
  postgres: 'PostgreSQL',
  redis: 'Redis',
  generic_http: 'External HTTP',
};

/** Multi-tier latency values injected for each provider. */
const LATENCY_TIERS_MS = [50, 200, 1000, 5000];

// ── Structural detection patterns ─────────────────────────────────────────

const PRISMA_OPERATION_RE =
  /\b(?:this\.)?prisma\.\w+\.(?:create|findMany|findUnique|findFirst|update|delete|upsert|count|aggregate|groupBy)\s*\(/;
const QUEUE_OR_CACHE_RE =
  /\b(?:Queue|Worker|QueueEvents|createClient)\b|\.add\s*\(|\.process\s*\(|\.get\s*\(|\.set\s*\(/;
const EXTERNAL_HTTP_RE =
  /\b(?:fetch|axios|httpService)\.(?:get|post|put|patch|delete|request)\s*\(|\bfetch\s*\(|\b[A-Za-z_$][\w$]*(?:Client|Provider|Gateway|Api|SDK|Sdk|Http)\.(?:get|post|put|patch|delete|request|send|create|update)\s*\(/;
const INTERNAL_ROUTE_RE = /@Controller\s*\(|@(Get|Post|Put|Patch|Delete|All)\s*\(/;
const WEBHOOK_RECEIVER_RE =
  /@(Post|All)\s*\([^)]*(callback|webhook|hook|event)[^)]*\)|signature|rawBody|x-[a-z-]*signature/i;

/** Provider-specific detection regexes. */
const PROVIDER_PATTERNS: Record<ChaosProviderName, RegExp> = {
  stripe:
    /\b(?:StripeRuntime|StripeClient|StripeApi|stripe\.(?:customers|subscriptions|checkout|invoices|paymentIntents|webhooks|billingPortal))\b|from\s+['"].*stripe/i,
  openai:
    /\b(?:new\s+OpenAI|openai\.(?:chat|responses|images|beta)|OPENAI_API_KEY|chatCompletion|ChatCompletion)\b|from\s+['"]openai/i,
  meta_whatsapp:
    /\b(?:MetaWhatsApp|WhatsAppBusiness|whatsappApiSession|meta\s*Connection|waba\s*Id|phoneNumberId|businessId|whatsapp\.send|whatsapp\.message)\b|from\s+['"].*meta.*whatsapp/i,
  resend:
    /\b(?:RESEND_API_KEY|api\.resend\.com|resend\.(?:emails|send)|sendViaResend|EmailService.*resend)\b/i,
  postgres: PRISMA_OPERATION_RE,
  redis:
    /\b(?:InjectRedis|@InjectRedis|createRedisClient|getRedisUrl|ioredis|Redis)\b|from\s+['"]ioredis/i,
  generic_http: EXTERNAL_HTTP_RE,
};

// ── Default injection configurations ──────────────────────────────────────

const DEFAULT_LATENCY_MS: Record<string, number> = {
  postgres: 500,
  redis: 200,
  external_http: 1500,
  webhook_receiver: 2000,
  internal_api: 300,
};

const DEFAULT_TIMEOUT_MS: Record<string, number> = {
  postgres: 30000,
  redis: 10000,
  external_http: 30000,
  webhook_receiver: 60000,
  internal_api: 10000,
};

const DEFAULT_EVENT_HORIZON_MS: Record<string, number> = {
  postgres: 120000,
  redis: 30000,
  external_http: 60000,
  webhook_receiver: 300000,
  internal_api: 20000,
};

// ── Helpers ───────────────────────────────────────────────────────────────

function readSafe(filePath: string): string {
  try {
    return readTextFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

// ── Provider detection ────────────────────────────────────────────────────

/** Scan source files for specific external providers used in the codebase. */
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
    for (const [provider, regex] of Object.entries(PROVIDER_PATTERNS)) {
      if (regex.test(content)) {
        const files = providerFiles.get(provider as ChaosProviderName) ?? [];
        files.push(file);
        providerFiles.set(provider as ChaosProviderName, files);
      }
    }
  }

  return providerFiles;
}

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
  if (INTERNAL_ROUTE_RE.test(content)) {
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
  const target = PROVIDER_TO_TARGET[provider];
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
    // Heuristic: capability ID or name contains provider name.
    const nameLower = cap.name?.toLowerCase() ?? '';
    if (
      nameLower.includes(provider.replace('_', '')) ||
      nameLower.includes(provider.replace('_whatsapp', ''))
    ) {
      baseIds.add(cap.id);
    }
  }

  return [...baseIds].sort();
}

// ── Injection config generation ───────────────────────────────────────────

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
  const params: Record<string, number> = {};

  switch (kind) {
    case 'latency':
      return {
        durationMs: overrides?.durationMs ?? DEFAULT_EVENT_HORIZON_MS[target] ?? 30000,
        intensity: overrides?.intensity ?? 0.7,
        params: {
          latencyMs: overrides?.params?.latencyMs ?? DEFAULT_LATENCY_MS[target] ?? 500,
        },
      };
    case 'connection_drop':
      return {
        durationMs: overrides?.durationMs ?? DEFAULT_TIMEOUT_MS[target] ?? 15000,
        intensity: overrides?.intensity ?? 0.9,
        params: {
          reconnectWindowMs: overrides?.params?.reconnectWindowMs ?? 10000,
        },
      };
    case 'slow_close':
      return {
        durationMs: overrides?.durationMs ?? DEFAULT_TIMEOUT_MS[target] ?? 30000,
        intensity: overrides?.intensity ?? 0.5,
        params: {
          drainTimeMs: overrides?.params?.drainTimeMs ?? 15000,
        },
      };
    case 'partition':
      return {
        durationMs: overrides?.durationMs ?? DEFAULT_EVENT_HORIZON_MS[target] ?? 60000,
        intensity: overrides?.intensity ?? 0.8,
        params: {
          isolatedMs: overrides?.params?.isolatedMs ?? 30000,
          healDelayMs: overrides?.params?.healDelayMs ?? 10000,
        },
      };
    case 'packet_loss':
      return {
        durationMs: overrides?.durationMs ?? DEFAULT_EVENT_HORIZON_MS[target] ?? 30000,
        intensity: overrides?.intensity ?? 0.6,
        params: { lossPercent: overrides?.params?.lossPercent ?? 30 },
      };
    case 'kill_process':
      return {
        durationMs: overrides?.durationMs ?? DEFAULT_EVENT_HORIZON_MS[target] ?? 30000,
        intensity: overrides?.intensity ?? 1.0,
        params: {
          restartDelayMs: overrides?.params?.restartDelayMs ?? 5000,
        },
      };
    case 'dns_failure':
      return {
        durationMs: overrides?.durationMs ?? DEFAULT_EVENT_HORIZON_MS[target] ?? 60000,
        intensity: overrides?.intensity ?? 0.8,
        params: {
          failureDurationMs: overrides?.params?.failureDurationMs ?? 15000,
        },
      };
    case 'disk_full':
      return {
        durationMs: overrides?.durationMs ?? DEFAULT_EVENT_HORIZON_MS[target] ?? 60000,
        intensity: overrides?.intensity ?? 0.7,
        params: {
          freeBytesThreshold: overrides?.params?.freeBytesThreshold ?? 104857600,
        },
      };
    case 'cpu_spike':
      return {
        durationMs: overrides?.durationMs ?? DEFAULT_EVENT_HORIZON_MS[target] ?? 30000,
        intensity: overrides?.intensity ?? 0.85,
        params: {
          spikeDurationMs: overrides?.params?.spikeDurationMs ?? 10000,
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
  const scenarios: ChaosScenario[] = [];
  let index = 0;

  for (const target of detectedTargets) {
    const blastRadius = computeBlastRadius(target, loadedCapabilities);

    // Multi-tier latency injection.
    for (const latencyMs of LATENCY_TIERS_MS) {
      scenarios.push(buildScenario(target, 'latency', index++, blastRadius, { latencyMs }));
    }

    // Connection drop for databases and networks.
    if (target === 'postgres' || target === 'redis') {
      scenarios.push(buildScenario(target, 'connection_drop', index++, blastRadius));
    }

    // Connection drop for HTTP-based targets.
    if (target === 'external_http' || target === 'webhook_receiver') {
      scenarios.push(buildScenario(target, 'connection_drop', index++, blastRadius));
    }

    // Slow close for persistent connections.
    if (target === 'postgres' || target === 'redis') {
      scenarios.push(buildScenario(target, 'slow_close', index++, blastRadius));
    }

    // Packet loss for network-dependent targets.
    if (target === 'external_http' || target === 'webhook_receiver') {
      scenarios.push(buildScenario(target, 'packet_loss', index++, blastRadius));
    }

    // Partition for clustered dependencies.
    if (target === 'redis') {
      scenarios.push(buildScenario(target, 'partition', index++, blastRadius));
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
  const scenarios: ChaosScenario[] = [];
  let index = 0;

  for (const [provider, providerFiles] of detectedProviders) {
    // Skip generic_http — its scenarios are covered by the target-level
    // generation above.
    if (provider === 'generic_http') continue;
    // Skip postgres and redis — they are covered by target-level generation.
    if (provider === 'postgres' || provider === 'redis') continue;

    const target = PROVIDER_TO_TARGET[provider];
    const blastRadius = computeProviderBlastRadius(provider, providerFiles, loadedCapabilities);

    // Multi-tier latency per provider.
    for (const latencyMs of LATENCY_TIERS_MS) {
      scenarios.push(
        buildProviderScenario(provider, target, 'latency', index++, blastRadius, { latencyMs }),
      );
    }

    // Connection drop.
    scenarios.push(
      buildProviderScenario(provider, target, 'connection_drop', index++, blastRadius),
    );

    // Slow close / partial response.
    scenarios.push(buildProviderScenario(provider, target, 'slow_close', index++, blastRadius));

    // Packet loss.
    scenarios.push(buildProviderScenario(provider, target, 'packet_loss', index++, blastRadius));

    // DNS failure (simulates provider endpoint unreachable).
    scenarios.push(buildProviderScenario(provider, target, 'dns_failure', index++, blastRadius));
  }

  return scenarios;
}

// ── Internal builders ─────────────────────────────────────────────────────

function buildScenario(
  target: ChaosTarget,
  kind: ChaosScenarioKind,
  index: number,
  blastRadius: string[],
  overrides?: { latencyMs?: number },
): ChaosScenario {
  const config = generateInjectionConfig(kind, target, {
    params: overrides?.latencyMs ? { latencyMs: overrides.latencyMs } : undefined,
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
  overrides?: { latencyMs?: number },
): ChaosScenario {
  const config = generateInjectionConfig(kind, target, {
    params: overrides?.latencyMs ? { latencyMs: overrides.latencyMs } : undefined,
  });
  const description = buildDescription(kind, target, config, provider);
  const expectedBehavior = buildExpectedBehavior(kind, target, config, provider);

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
    ? PROVIDER_LABELS[provider]
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
): string {
  const latencyMs = config.params.latencyMs as number | undefined;
  const providerLabel = provider ? PROVIDER_LABELS[provider] : target;

  switch (kind) {
    case 'latency': {
      const tier = classifyLatencyTier(latencyMs ?? 0);
      let behavior = circuitBreakerPrediction(target, provider, tier);
      behavior += '; ' + cacheFallbackPrediction(target, provider, tier);
      behavior += '; ' + queueRetryPrediction(target, provider, tier);
      behavior += '; ' + userImpactPrediction(target, provider, tier);
      return behavior;
    }

    case 'connection_drop': {
      let behavior = `Circuit breaker MUST open within 3 failed probes to ${providerLabel}.`;
      behavior += ' Connection pool MUST drain. Health check MUST return degraded.';
      behavior += ' All in-flight requests MUST fail with 503 Service Unavailable.';
      behavior += ' Critical-path operations (payments/auth) MUST fail closed (deny).';
      behavior += ' Non-critical operations MUST use stale cache if available.';
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
      behavior += ' Circuit breaker MAY open if error rate exceeds threshold despite retries.';
      return behavior;
    }

    case 'dns_failure': {
      let behavior = `DNS resolution for ${providerLabel} fails — endpoint unreachable.`;
      behavior += ' Connection MUST fail immediately (no long TCP timeouts).';
      behavior += ' Any cached DNS entries MUST NOT be used (avoid split-brain).';
      behavior += ' Health check MUST return critical for affected capabilities.';
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

function circuitBreakerPrediction(
  target: ChaosTarget,
  provider: ChaosProviderName | undefined,
  tier: LatencyTier,
): string {
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
): string {
  if (target === 'postgres') {
    return tier === 'low' || tier === 'medium'
      ? 'No cache fallback needed — DB latency within bounds'
      : 'Cache fallback SHOULD activate — serve stale reads from Redis or in-memory cache';
  }
  if (target === 'redis') {
    return 'Redis unavailable — rate-limits MUST fail-open, session store MUST degrade to DB lookup';
  }
  if (provider === 'stripe') {
    return 'Stripe calls SHOULD be backed by idempotency keys — retry with cached session/price data if available';
  }
  if (provider === 'openai') {
    return 'OpenAI calls SHOULD return cached completions for identical prompts — fallback to simpler model or graceful error message';
  }
  if (provider === 'meta_whatsapp') {
    return 'WhatsApp messages MUST be queued for retry — user notifications delayed but not lost';
  }
  if (provider === 'resend') {
    return 'Email delivery MUST be queued — Resend API retry with exponential backoff, SMTP fallback if configured';
  }
  return 'Fallback to stale cache if available — serve degraded response to user';
}

function queueRetryPrediction(
  target: ChaosTarget,
  provider: ChaosProviderName | undefined,
  tier: LatencyTier,
): string {
  if (target === 'redis') {
    return 'BullMQ jobs MUST retry with exponential backoff — queue processing delayed but preserved';
  }
  if (provider === 'meta_whatsapp') {
    return 'Outbound WhatsApp messages MUST be enqueued — delivery retried up to 5x with exponential backoff';
  }
  if (provider === 'resend') {
    return 'Email send jobs MUST be retried — SMTP fallback after 3 Resend failures';
  }
  if (provider === 'stripe') {
    return 'Stripe webhooks MUST be replayed by Stripe — local operations idempotent against replay';
  }
  return 'Retry with exponential backoff — idempotency keys prevent duplicate processing';
}

function userImpactPrediction(
  target: ChaosTarget,
  provider: ChaosProviderName | undefined,
  tier: LatencyTier,
): string {
  if (tier === 'low' || tier === 'medium') {
    return 'User impact minimal — slight delay in response, no visible errors';
  }
  if (provider === 'stripe') {
    return 'Payment flows degraded — checkout may timeout, users see retry prompt. Billing portal inaccessible.';
  }
  if (provider === 'openai') {
    return 'AI features degraded — KLOEL agent, campaigns, autopilot respond with fallback messages or delayed responses';
  }
  if (provider === 'meta_whatsapp') {
    return 'WhatsApp messaging degraded — messages queued for later delivery, real-time chat affected';
  }
  if (provider === 'resend') {
    return 'Email delivery delayed — verification emails, password resets, marketing emails queued';
  }
  return 'User-visible degradation — timeouts, retry prompts, or partial feature unavailability';
}
