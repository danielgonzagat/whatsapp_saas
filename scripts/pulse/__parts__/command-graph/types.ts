import * as path from 'node:path';
import { safeJoin } from '../../lib/safe-path';

export type PulseCommandPurpose =
  | 'install'
  | 'build'
  | 'test'
  | 'dev'
  | 'pulse'
  | 'typecheck'
  | 'lint'
  | 'deploy'
  | 'other';

export type PulseCommandSourceKind =
  | 'package-json'
  | 'lockfile'
  | 'tsconfig'
  | 'dockerfile'
  | 'github-workflow';

export interface PulseDiscoveredCommand {
  id: string;
  purpose: PulseCommandPurpose;
  command: string;
  sourcePath: string;
  sourceKind: PulseCommandSourceKind;
  packagePath?: string;
  scriptName?: string;
  confidence: 'high' | 'medium' | 'low';
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

export const IGNORED_DIRS = new Set([
  '.git',
  '.next',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
]);

export const PACKAGE_DIR_ALLOWLIST = new Set([
  '.',
  'backend',
  'frontend',
  'frontend-admin',
  'worker',
  'e2e',
]);

export function normalizeRepoPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

export function toRelativePath(rootDir: string, filePath: string): string {
  const relative = path.relative(rootDir, filePath);
  return normalizeRepoPath(relative || '.');
}

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean).map(normalizeRepoPath))].sort();
}
