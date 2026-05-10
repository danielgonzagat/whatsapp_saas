import {
  splitIdentifierTokensFromObservedName,
  hasObservedToken,
} from '../../dynamic-reality-kernel/__parts__/token-evidence';

const OBSERVED_COMMAND_PURPOSE_TOKEN_CATALOG = [
  'install',
  'build',
  'test',
  'dev',
  'pulse',
  'typecheck',
  'lint',
  'deploy',
  'other',
] as const;

const OBSERVED_SOURCE_KIND_TOKEN_CATALOG = [
  'package-json',
  'lockfile',
  'tsconfig',
  'dockerfile',
  'github-workflow',
] as const;

const OBSERVED_CONFIDENCE_TOKEN_CATALOG = ['high', 'medium', 'low'] as const;

const OBSERVED_DOCKER_KIND_TOKEN_CATALOG = [
  'docker-arg-required',
  'docker-arg-default',
  'docker-env',
] as const;

const OBSERVED_TEMPLATE_KIND_TOKEN_CATALOG = ['github-template'] as const;

const OBSERVED_ENV_CONTEXT_TOKEN_CATALOG = [
  'process.env',
  'shell',
  'workflow-env',
  ...OBSERVED_DOCKER_KIND_TOKEN_CATALOG,
  ...OBSERVED_TEMPLATE_KIND_TOKEN_CATALOG,
] as const;

const OBSERVED_SOURCE_FILE_PATTERN_CATALOG = [
  { sourceKind: 'github-workflow' as const, pattern: /^\.github\/workflows\/.+[.]ya?ml$/ },
  { sourceKind: 'dockerfile' as const, pattern: /Dockerfile/ },
  { sourceKind: 'tsconfig' as const, pattern: /tsconfig(?:[.][\w-]+)?[.]json$/ },
];

const OBSERVED_PACKAGE_LOCK_TOKEN_CATALOG = ['package-lock.json'] as const;

export function discoverCommandPurposeCatalog(): string[] {
  return [...OBSERVED_COMMAND_PURPOSE_TOKEN_CATALOG];
}

export function discoverSourceKindCatalog(): string[] {
  return [...OBSERVED_SOURCE_KIND_TOKEN_CATALOG];
}

export function discoverConfidenceCatalog(): string[] {
  return [...OBSERVED_CONFIDENCE_TOKEN_CATALOG];
}

export function discoverSourceFilePatternCatalog() {
  return OBSERVED_SOURCE_FILE_PATTERN_CATALOG.map((entry) => ({
    ...entry,
    pattern: entry.pattern.source,
  }));
}

export function discoverPackageLockTokenCatalog(): string[] {
  return [...OBSERVED_PACKAGE_LOCK_TOKEN_CATALOG];
}

export function discoverEnvContextCatalog(): string[] {
  return [...OBSERVED_ENV_CONTEXT_TOKEN_CATALOG];
}

export function isObservedCommandPurpose(value: string): boolean {
  return OBSERVED_COMMAND_PURPOSE_TOKEN_CATALOG.includes(value as PulseCommandPurpose);
}

export function isObservedSourceKind(value: string): boolean {
  return OBSERVED_SOURCE_KIND_TOKEN_CATALOG.includes(value as PulseCommandSourceKind);
}

export function isObservedConfidence(value: string): boolean {
  return OBSERVED_CONFIDENCE_TOKEN_CATALOG.includes(value as PulseConfidence);
}

export type PulseCommandPurpose = (typeof OBSERVED_COMMAND_PURPOSE_TOKEN_CATALOG)[number];

export type PulseCommandSourceKind = (typeof OBSERVED_SOURCE_KIND_TOKEN_CATALOG)[number];

export type PulseConfidence = (typeof OBSERVED_CONFIDENCE_TOKEN_CATALOG)[number];

export interface PulseDiscoveredCommand {
  id: string;
  purpose: PulseCommandPurpose;
  command: string;
  sourcePath: string;
  sourceKind: PulseCommandSourceKind;
  packagePath?: string;
  scriptName?: string;
  confidence: PulseConfidence;
  signals: string[];
}

export interface PulseDiscoveredEnvironmentVariable {
  name: string;
  sourcePath: string;
  sourceKind: PulseCommandSourceKind;
  contexts: string[];
  required: boolean;
  secretLike: boolean;
}

export interface PulseCommandGraph {
  generatedAt: string;
  commands: PulseDiscoveredCommand[];
  environmentVariables: PulseDiscoveredEnvironmentVariable[];
  scannedSources: string[];
}

export interface PackageJson {
  scripts?: Record<string, unknown>;
}

export interface CandidateSource {
  relativePath: string;
  sourceKind: PulseCommandSourceKind;
}
