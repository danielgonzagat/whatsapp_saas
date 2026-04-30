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
 * ## Dependency detection
 *
 * The engine scans source and PULSE artifacts for external dependencies
 * discovered from imports, environment references, URL hosts, HTTP clients,
 * package usage, runtime signals, and side-effect graph evidence. Each
 * external dependency gets:
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

// ── External dependency taxonomy ──────────────────────────────────────────

/**
 * External dependency detected in the codebase.
 *
 * The value is a stable, sanitized identifier derived from observed code or
 * artifact evidence. It is intentionally open-ended so PULSE does not carry a
 * catalog of product names.
 */
export type ChaosProviderName = string;
type ChaosOperationalConcern =
  | 'payment_idempotency'
  | 'whatsapp_queue_retry'
  | 'email_retry_fallback'
  | 'ai_model_fallback_cache';

/** Multi-tier latency values injected for each detected dependency. */
const LATENCY_TIERS_MS = [50, 200, 1000, 5000];
const MAX_BLAST_RADIUS_ENTRIES = 32;
const MAX_PROVIDER_DEPENDENCIES = 96;

// ── Structural detection patterns ─────────────────────────────────────────

const PRISMA_OPERATION_RE =
  /\b(?:this\.)?prisma\.\w+\.(?:create|findMany|findUnique|findFirst|update|delete|upsert|count|aggregate|groupBy)\s*\(/;
const QUEUE_OR_CACHE_RE =
  /\b(?:Queue|Worker|QueueEvents|createClient)\b|\.add\s*\(|\.process\s*\(|\.get\s*\(|\.set\s*\(/;
const EXTERNAL_HTTP_RE =
  /\b(?:fetch|axios|httpService)\.(?:get|post|put|patch|delete|request)\s*\(|\bfetch\s*\(|\b[A-Za-z_$][\w$]*(?:Client|Provider|Gateway|Api|SDK|Sdk|Http)\.(?:get|post|put|patch|delete|request)\s*\(/;
const WEBHOOK_RECEIVER_RE =
  /@(Post|All)\s*\([^)]*(callback|webhook|hook|event)[^)]*\)|signature|rawBody|x-[a-z-]*signature/i;

const IMPORT_SPECIFIER_RE =
  /\b(?:import\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?|export\s+[^'"]+\s+from\s+|require\s*\(|import\s*\()\s*['"]([^'"]+)['"]/g;
const ENV_REFERENCE_RE =
  /\bprocess\.env\.([A-Z][A-Z0-9_]{2,})\b|\b(?:configService|config)\.get(?:OrThrow)?\(\s*['"]([A-Z][A-Z0-9_]{2,})['"]\s*\)/g;
const URL_HOST_RE = /https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?::\d+)?/gi;
const HTTP_CLIENT_IDENTIFIER_RE =
  /\b([A-Za-z_$][\w$]*(?:Client|Provider|Gateway|Api|SDK|Sdk|Http|Transport))\.(?:get|post|put|patch|delete|request|send|create|update)\s*\(/g;
const EXTERNAL_PACKAGE_HINT_RE =
  /(?:api|auth|cache|client|cloud|gateway|http|mail|mq|payment|provider|queue|sdk|sms|storage|transport)$/i;

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

function normalizeEvidencePath(rootDir: string, filePath: string): string {
  const absolutePath = path.isAbsolute(filePath) ? filePath : safeJoin(rootDir, filePath);
  return path.relative(rootDir, absolutePath).split(path.sep).join('/');
}

function slugDependency(value: string): string | null {
  const slug = value
    .trim()
    .replace(/^@/, '')
    .replace(/[^a-zA-Z0-9._/-]+/g, '-')
    .replace(/[./]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return slug.length > 0 ? slug : null;
}

function getNamedImportsFromModule(content: string, moduleName: string): string[] {
  const imports: string[] = [];
  const importRe = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
  for (const match of content.matchAll(importRe)) {
    if (match[2] !== moduleName) {
      continue;
    }
    for (const rawName of match[1].split(',')) {
      const localName = rawName
        .split(/\s+as\s+/i)
        .pop()
        ?.trim();
      if (localName) {
        imports.push(localName);
      }
    }
  }
  return unique(imports);
}

function hasDecoratorUse(content: string, decoratorName: string): boolean {
  return content.includes(`@${decoratorName}(`);
}

function hasInternalRouteEvidence(content: string): boolean {
  return getNamedImportsFromModule(content, '@nestjs/common').some(
    (importedName) =>
      importedName.toLowerCase().includes('controller') && hasDecoratorUse(content, importedName),
  );
}

function dependencyId(source: string, value: string): ChaosProviderName | null {
  const slug = slugDependency(value);
  return slug ? `${source}:${slug}` : null;
}

function packageRoot(specifier: string): string | null {
  if (
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    specifier.startsWith('node:') ||
    specifier.startsWith('#')
  ) {
    return null;
  }
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0] || null;
}

function envDependencyName(name: string): string | null {
  const upperName = name.toUpperCase();
  if (!/(?:^|_)(?:URL|URI|HOST|ENDPOINT|BASE_URL|API_KEY|SECRET|TOKEN)(?:_|$)/.test(upperName)) {
    return null;
  }
  const tokens = name
    .toLowerCase()
    .split('_')
    .filter((token) => token && !['api', 'key', 'secret', 'token', 'url', 'uri'].includes(token));
  return tokens.length > 0 ? tokens.join('-') : null;
}

function addDetectedDependency(
  dependencies: Map<ChaosProviderName, string[]>,
  dependency: ChaosProviderName | null,
  filePath: string,
): void {
  if (!dependency) {
    return;
  }
  const files = dependencies.get(dependency) ?? [];
  files.push(filePath);
  dependencies.set(dependency, unique(files).sort());
}

function compactBlastRadius(capabilityIds: string[]): string[] {
  return unique(capabilityIds)
    .sort((left, right) => left.length - right.length || left.localeCompare(right))
    .slice(0, MAX_BLAST_RADIUS_ENTRIES);
}

function compactProviderDependencies(
  providers: Map<ChaosProviderName, string[]>,
): Map<ChaosProviderName, string[]> {
  return new Map(
    [...providers.entries()]
      .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
      .slice(0, MAX_PROVIDER_DEPENDENCIES),
  );
}

function addDependenciesFromSource(
  dependencies: Map<ChaosProviderName, string[]>,
  rootDir: string,
  file: string,
  content: string,
): void {
  const relativeFile = normalizeEvidencePath(rootDir, file);
  if (PRISMA_OPERATION_RE.test(content)) {
    addDetectedDependency(dependencies, dependencyId('target', 'postgres'), relativeFile);
  }
  if (QUEUE_OR_CACHE_RE.test(content)) {
    addDetectedDependency(dependencies, dependencyId('target', 'redis'), relativeFile);
  }

  for (const match of content.matchAll(URL_HOST_RE)) {
    addDetectedDependency(dependencies, dependencyId('host', match[1] ?? ''), relativeFile);
  }

  for (const match of content.matchAll(ENV_REFERENCE_RE)) {
    const envName = match[1] ?? match[2] ?? '';
    addDetectedDependency(
      dependencies,
      dependencyId('env', envDependencyName(envName) ?? ''),
      relativeFile,
    );
  }

  for (const match of content.matchAll(HTTP_CLIENT_IDENTIFIER_RE)) {
    addDetectedDependency(dependencies, dependencyId('client', match[1] ?? ''), relativeFile);
  }

  const hasExternalCallShape = EXTERNAL_HTTP_RE.test(content);
  for (const match of content.matchAll(IMPORT_SPECIFIER_RE)) {
    const importedPackage = packageRoot(match[1] ?? '');
    if (!importedPackage) {
      continue;
    }
    const importedSlug = slugDependency(importedPackage) ?? '';
    if (hasExternalCallShape || EXTERNAL_PACKAGE_HINT_RE.test(importedSlug)) {
      addDetectedDependency(dependencies, dependencyId('package', importedPackage), relativeFile);
    }
  }
}

function addDependenciesFromArtifactFiles(
  dependencies: Map<ChaosProviderName, string[]>,
  rootDir: string,
  files: string[],
): void {
  for (const file of unique(files)) {
    const absolutePath = path.isAbsolute(file) ? file : safeJoin(rootDir, file);
    if (!pathExists(absolutePath)) {
      continue;
    }
    addDependenciesFromSource(dependencies, rootDir, absolutePath, readSafe(absolutePath));
  }
}

function loadArtifactRecords(rootDir: string, artifactName: string): Record<string, unknown>[] {
  const artifactPath = safeJoin(rootDir, '.pulse', 'current', artifactName);
  if (!pathExists(artifactPath)) {
    return [];
  }
  try {
    const payload = readJsonFile<Record<string, unknown>>(artifactPath);
    const records: Record<string, unknown>[] = [];
    for (const key of ['nodes', 'signals', 'capabilities']) {
      const value = payload[key];
      if (Array.isArray(value)) {
        records.push(
          ...value.filter(
            (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
          ),
        );
      }
    }
    return records;
  } catch {
    return [];
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function addDependenciesFromPulseArtifacts(
  dependencies: Map<ChaosProviderName, string[]>,
  rootDir: string,
): void {
  const behaviorNodes = loadArtifactRecords(rootDir, 'PULSE_BEHAVIOR_GRAPH.json');
  for (const node of behaviorNodes) {
    const filePath = typeof node.filePath === 'string' ? node.filePath : '';
    const externalCalls = Array.isArray(node.externalCalls) ? node.externalCalls : [];
    for (const call of externalCalls) {
      if (!call || typeof call !== 'object') {
        continue;
      }
      const provider = (call as Record<string, unknown>).provider;
      if (typeof provider === 'string') {
        addDetectedDependency(dependencies, dependencyId('behavior', provider), filePath);
      }
    }
  }

  const structuralNodes = loadArtifactRecords(rootDir, 'PULSE_STRUCTURAL_GRAPH.json');
  const sideEffectFiles = structuralNodes
    .filter((node) => node.kind === 'side_effect_signal')
    .flatMap((node) => {
      const metadata = node.metadata as Record<string, unknown> | undefined;
      return typeof metadata?.filePath === 'string' ? [metadata.filePath] : [];
    });
  addDependenciesFromArtifactFiles(dependencies, rootDir, sideEffectFiles);

  const productCapabilities = loadArtifactRecords(rootDir, 'PULSE_PRODUCT_GRAPH.json');
  for (const capability of productCapabilities) {
    for (const provider of stringArray(capability.providersInvolved)) {
      addDetectedDependency(dependencies, dependencyId('product-graph', provider), '');
    }
  }

  const signalFiles = [
    ...loadArtifactRecords(rootDir, 'PULSE_EXTERNAL_SIGNAL_STATE.json'),
    ...loadArtifactRecords(rootDir, 'PULSE_RUNTIME_FUSION.json'),
  ].flatMap((signal) => [
    ...stringArray(signal.relatedFiles),
    ...stringArray(signal.affectedFilePaths),
  ]);
  addDependenciesFromArtifactFiles(dependencies, rootDir, signalFiles);
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
    const blastRadius = compactBlastRadius(computeBlastRadius(target, loadedCapabilities));

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

    // Multi-tier latency per provider.
    for (const latencyMs of LATENCY_TIERS_MS) {
      scenarios.push(
        buildProviderScenario(
          provider,
          target,
          'latency',
          index++,
          blastRadius,
          operationalConcerns,
          {
            latencyMs,
          },
        ),
      );
    }

    // Connection drop.
    scenarios.push(
      buildProviderScenario(
        provider,
        target,
        'connection_drop',
        index++,
        blastRadius,
        operationalConcerns,
      ),
    );

    // Slow close / partial response.
    scenarios.push(
      buildProviderScenario(
        provider,
        target,
        'slow_close',
        index++,
        blastRadius,
        operationalConcerns,
      ),
    );

    // Packet loss.
    scenarios.push(
      buildProviderScenario(
        provider,
        target,
        'packet_loss',
        index++,
        blastRadius,
        operationalConcerns,
      ),
    );

    // DNS failure (simulates provider endpoint unreachable).
    scenarios.push(
      buildProviderScenario(
        provider,
        target,
        'dns_failure',
        index++,
        blastRadius,
        operationalConcerns,
      ),
    );
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
  operationalConcerns: Set<ChaosOperationalConcern>,
  overrides?: { latencyMs?: number },
): ChaosScenario {
  const config = generateInjectionConfig(kind, target, {
    params: overrides?.latencyMs ? { latencyMs: overrides.latencyMs } : undefined,
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
  if (tier === 'low' || tier === 'medium') {
    return 'User impact minimal — slight delay in response, no visible errors';
  }
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
