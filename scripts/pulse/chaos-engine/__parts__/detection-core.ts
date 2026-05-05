import * as path from 'path';
import { METHODS as HTTP_METHODS } from 'node:http';
import type { ChaosTarget, ChaosScenarioKind } from '../../types.chaos-engine';
import type {
  PulseCapability,
  PulseExecutionMatrix,
  PulseExecutionTrace,
  PulseRuntimeEvidence,
  PulseRuntimeProbe,
} from '../../types';
import { walkFiles } from '../../parsers/utils';
import { readTextFile, readJsonFile, pathExists } from '../../safe-fs';
import { safeJoin } from '../../safe-path';
import {
  discoverAllObservedArtifactFilenames,
  discoverChaosTargetLabels,
  discoverSourceExtensionsFromObservedTypescript,
  discoverExternalReceiverTokensFromEvidence,
  deriveUnitValue,
  deriveZeroValue,
} from '../../dynamic-reality-kernel';

export type ChaosProviderName = string;
export type ChaosOperationalConcern =
  | 'payment_idempotency'
  | 'whatsapp_queue_retry'
  | 'email_retry_fallback'
  | 'ai_model_fallback_cache';

export interface ChaosEvidenceContext {
  dependency: ChaosProviderName;
  target: ChaosTarget;
  files: string[];
  capabilities: PulseCapability[];
  runtimeProbes: PulseRuntimeProbe[];
  executionPhases: PulseExecutionTrace['phases'];
  artifactRecords: Record<string, unknown>[];
  evidenceText: string;
}

export type ChaosScenarioSeed = {
  kind: ChaosScenarioKind;
  params: Record<string, number>;
  evidenceWeight: number;
};

const _receiverTokens = discoverExternalReceiverTokensFromEvidence();
const _receiverPattern = _receiverTokens.join('|');
const _httpVerbs = unique(HTTP_METHODS.map((m) => m.toLowerCase()));
const _httpVerbsPattern = _httpVerbs.join('|');
const PRISMA_OPERATION_RE =
  /\b(?:this\.)?prisma\.\w+\.(?:create|findMany|findUnique|findFirst|update|delete|upsert|count|aggregate|groupBy)\s*\(/;
const QUEUE_OR_CACHE_RE =
  /\b(?:Queue|Worker|QueueEvents|createClient)\b|\.add\s*\(|\.process\s*\(|\.get\s*\(|\.set\s*\(/;
const EXTERNAL_HTTP_RE =
  /\b(?:fetch|axios|httpService)\.(?:${_httpVerbsPattern})\s*\(|\bfetch\s*\(|\b[A-Za-z_$][\w$]*(?:Client|Provider|Gateway|Api|SDK|Sdk|Http)\.(?:${_httpVerbsPattern})\s*\(/;
const WEBHOOK_RECEIVER_RE = new RegExp(
  `@(Post|All)\\s*\\([^)]*(${_receiverPattern.replace(/\\$/g, '\\\\$')}|hook|signature)[^)]*\\)|signature|rawBody|x-[a-z-]*signature`,
  'i',
);
const IMPORT_SPECIFIER_RE =
  /\b(?:import\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?|export\s+[^'"]+\s+from\s+|require\s*\(|import\s*\()\s*['"]([^'"]+)['"]/g;
const ENV_REFERENCE_RE =
  /\bprocess\.env\.([A-Z][A-Z0-9_]{2,})\b|\b(?:configService|config)\.get(?:OrThrow)?\(\s*['"]([A-Z][A-Z0-9_]{2,})['"]\s*\)/g;
const URL_HOST_RE = /https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?::\d+)?/gi;
const HTTP_CLIENT_IDENTIFIER_RE =
  /\b([A-Za-z_$][\w$]*(?:Client|Provider|Gateway|Api|SDK|Sdk|Http|Transport))\.(?:get|post|put|patch|delete|request|send|create|update)\s*\(/g;
const EXTERNAL_PACKAGE_HINT_RE =
  /(?:api|auth|cache|client|cloud|gateway|http|mail|mq|payment|provider|queue|sdk|sms|storage|transport)$/i;

export function lookupChaosTargetEvidence(label: string): ChaosTarget {
  const labels = discoverChaosTargetLabels();
  for (const l of labels) if (l === label) return l as ChaosTarget;
  throw new Error(`ChaosTarget type contract missing member: ${label}`);
}

function readSafe(filePath: string): string {
  try {
    return readTextFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

export function unique(values: string[]): string[] {
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
  return slug.length > deriveZeroValue() ? slug : null;
}

function getNamedImportsFromModule(content: string, moduleName: string): string[] {
  const imports: string[] = [];
  const importRe = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
  for (const match of content.matchAll(importRe)) {
    if (match[2] !== moduleName) continue;
    for (const rawName of match[1].split(',')) {
      const localName = rawName
        .split(/\s+as\s+/i)
        .pop()
        ?.trim();
      if (localName) imports.push(localName);
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

export function dependencyId(source: string, value: string): ChaosProviderName | null {
  const slug = slugDependency(value);
  return slug ? `${source}:${slug}` : null;
}

function packageRoot(specifier: string): string | null {
  if (
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    specifier.startsWith('node:') ||
    specifier.startsWith('#')
  )
    return null;
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0] || null;
}

function envDependencyName(name: string): string | null {
  const upperName = name.toUpperCase();
  if (!/(?:^|_)(?:URL|URI|HOST|ENDPOINT|BASE_URL|API_KEY|SECRET|TOKEN)(?:_|$)/.test(upperName))
    return null;
  const tokens = name
    .toLowerCase()
    .split('_')
    .filter((token) => token && !['api', 'key', 'secret', 'token', 'url', 'uri'].includes(token));
  return tokens.length > deriveZeroValue() ? tokens.join('-') : null;
}

function addDetectedDependency(
  dependencies: Map<ChaosProviderName, string[]>,
  dependency: ChaosProviderName | null,
  filePath: string,
): void {
  if (!dependency) return;
  const files = dependencies.get(dependency) ?? [];
  files.push(filePath);
  dependencies.set(dependency, unique(files).sort());
}

export function compactBlastRadius(capabilityIds: string[]): string[] {
  const u = deriveUnitValue();
  const dynamicLimit = Math.max(u, Math.ceil(Math.sqrt(Math.max(capabilityIds.length, u))));
  return unique(capabilityIds)
    .sort((left, right) => left.length - right.length || left.localeCompare(right))
    .slice(deriveZeroValue(), dynamicLimit);
}

export function compactProviderDependencies(
  providers: Map<ChaosProviderName, string[]>,
): Map<ChaosProviderName, string[]> {
  const u = deriveUnitValue();
  const totalEvidenceFiles = [...providers.values()].reduce(
    (sum, files) => sum + Math.max(files.length, u),
    deriveZeroValue(),
  );
  const dynamicLimit = Math.max(
    u,
    Math.ceil(Math.sqrt(Math.max(providers.size, u) * Math.max(totalEvidenceFiles, u))),
  );
  return new Map(
    [...providers.entries()]
      .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
      .slice(deriveZeroValue(), dynamicLimit),
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
    if (!importedPackage) continue;
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
    if (!pathExists(absolutePath)) continue;
    addDependenciesFromSource(dependencies, rootDir, absolutePath, readSafe(absolutePath));
  }
}

export function loadArtifactRecords(
  rootDir: string,
  artifactName: string,
): Record<string, unknown>[] {
  const artifactPath = safeJoin(rootDir, '.pulse', 'current', artifactName);
  if (!pathExists(artifactPath)) return [];
  try {
    const payload = readJsonFile<Record<string, unknown>>(artifactPath);
    const records: Record<string, unknown>[] = [];
    for (const key of Object.keys(payload)) {
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
  const artifacts = discoverAllObservedArtifactFilenames();
  const behaviorNodes = loadArtifactRecords(rootDir, artifacts.behaviorGraph);
  for (const node of behaviorNodes) {
    const filePath = typeof node.filePath === 'string' ? node.filePath : '';
    const externalCalls = Array.isArray(node.externalCalls) ? node.externalCalls : [];
    for (const call of externalCalls) {
      if (!call || typeof call !== 'object') continue;
      const provider = (call as Record<string, unknown>).provider;
      if (typeof provider === 'string') {
        addDetectedDependency(dependencies, dependencyId('behavior', provider), filePath);
      }
    }
  }
  const structuralNodes = loadArtifactRecords(rootDir, artifacts.structuralGraph);
  const sideEffectFiles = structuralNodes
    .filter((node) => node.kind === 'side_effect_signal')
    .flatMap((node) => {
      const metadata = node.metadata as Record<string, unknown> | undefined;
      return typeof metadata?.filePath === 'string' ? [metadata.filePath] : [];
    });
  addDependenciesFromArtifactFiles(dependencies, rootDir, sideEffectFiles);
  const productCapabilities = loadArtifactRecords(rootDir, artifacts.productGraph);
  for (const capability of productCapabilities) {
    for (const provider of stringArray(capability.providersInvolved)) {
      addDetectedDependency(dependencies, dependencyId('product-graph', provider), '');
    }
  }
  const signalFiles = [
    ...loadArtifactRecords(rootDir, artifacts.externalSignalState),
    ...loadArtifactRecords(rootDir, artifacts.runtimeFusion),
  ].flatMap((signal) => [
    ...stringArray(signal.relatedFiles),
    ...stringArray(signal.affectedFilePaths),
  ]);
  addDependenciesFromArtifactFiles(dependencies, rootDir, signalFiles);
}

export function detectProviders(rootDir: string): Map<ChaosProviderName, string[]> {
  const providerFiles = new Map<ChaosProviderName, string[]>();
  const allFiles: string[] = walkFiles(rootDir, [
    ...discoverSourceExtensionsFromObservedTypescript(),
  ]).filter((f) => !/\.(spec|test)\.ts$|__tests__|__mocks__|dist\//.test(f));
  for (const file of allFiles) {
    const content = readSafe(file);
    addDependenciesFromSource(providerFiles, rootDir, file, content);
  }
  addDependenciesFromPulseArtifacts(providerFiles, rootDir);
  return providerFiles;
}

export function detectCodebaseTargets(rootDir: string): Set<ChaosTarget> {
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
        ...walkFiles(dir, [...discoverSourceExtensionsFromObservedTypescript()]).filter(
          (f) => !/\.(spec|test)\.ts$|__tests__|__mocks__|dist\//.test(f),
        ),
      );
    }
  }
  for (const file of allFiles) {
    const content = readSafe(file);
    for (const target of classifyTargetsFromSource(content)) found.add(target);
  }
  return found;
}

export function classifyTargetsFromSource(content: string): Set<ChaosTarget> {
  const targets = new Set<ChaosTarget>();
  const postgresLabel = lookupChaosTargetEvidence('postgres');
  const redisLabel = lookupChaosTargetEvidence('redis');
  const internalApiLabel = lookupChaosTargetEvidence('internal_api');
  const externalHttpLabel = lookupChaosTargetEvidence('external_http');
  const webhookReceiverLabel = lookupChaosTargetEvidence('webhook_receiver');
  if (PRISMA_OPERATION_RE.test(content)) targets.add(postgresLabel);
  if (QUEUE_OR_CACHE_RE.test(content)) targets.add(redisLabel);
  if (hasInternalRouteEvidence(content)) targets.add(internalApiLabel);
  if (EXTERNAL_HTTP_RE.test(content)) targets.add(externalHttpLabel);
  if (WEBHOOK_RECEIVER_RE.test(content)) targets.add(webhookReceiverLabel);
  return targets;
}
