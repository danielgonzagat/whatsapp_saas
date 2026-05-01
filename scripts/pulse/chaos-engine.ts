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
 * external dependency gets a probe set derived from its observed dependency
 * shape, runtime probe metrics, execution trace durations, and side-effect
 * graph evidence instead of a fixed scenario catalog.
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
import type {
  PulseCapability,
  PulseExecutionMatrix,
  PulseExecutionTrace,
  PulseRuntimeEvidence,
  PulseRuntimeProbe,
} from './types';
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

interface ChaosEvidenceContext {
  dependency: ChaosProviderName;
  target: ChaosTarget;
  files: string[];
  capabilities: PulseCapability[];
  runtimeProbes: PulseRuntimeProbe[];
  executionPhases: PulseExecutionTrace['phases'];
  artifactRecords: Record<string, unknown>[];
  evidenceText: string;
}

type ChaosScenarioSeed = {
  kind: ChaosScenarioKind;
  params: Record<string, number>;
  evidenceWeight: number;
};

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
  const dynamicLimit = Math.max(1, Math.ceil(Math.sqrt(Math.max(capabilityIds.length, 1))));
  return unique(capabilityIds)
    .sort((left, right) => left.length - right.length || left.localeCompare(right))
    .slice(0, dynamicLimit);
}

function compactProviderDependencies(
  providers: Map<ChaosProviderName, string[]>,
): Map<ChaosProviderName, string[]> {
  const totalEvidenceFiles = [...providers.values()].reduce(
    (sum, files) => sum + Math.max(files.length, 1),
    0,
  );
  const dynamicLimit = Math.max(
    1,
    Math.ceil(Math.sqrt(Math.max(providers.size, 1) * Math.max(totalEvidenceFiles, 1))),
  );
  return new Map(
    [...providers.entries()]
      .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
      .slice(0, dynamicLimit),
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
export * from './__companions__/chaos-engine.companion';
