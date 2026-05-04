import { pathExists, readTextFile } from '../../safe-fs';
import { safeJoin } from '../../safe-path';
import { normalizeRepoPath, uniqueStrings } from './utils';
import type { ProtectedGovernanceConfig } from './types';

function readProtectedGovernanceConfig(rootDir: string): ProtectedGovernanceConfig {
  const fallback: ProtectedGovernanceConfig = {
    protectedExact: ['AGENTS.md', 'CLAUDE.md', 'CODEX.md', 'package.json', '.codacy.yml'],
    protectedPrefixes: [
      'ops/',
      'scripts/ops/',
      '.github/workflows/',
      'docs/codacy/',
      'docs/design/',
    ],
  };
  const configPath = safeJoin(rootDir, 'ops', 'protected-governance-files.json');
  if (!pathExists(configPath)) return fallback;
  try {
    const parsed = JSON.parse(
      readTextFile(configPath, 'utf8'),
    ) as Partial<ProtectedGovernanceConfig>;
    return {
      protectedExact: Array.isArray(parsed.protectedExact)
        ? parsed.protectedExact.map(String)
        : fallback.protectedExact,
      protectedPrefixes: Array.isArray(parsed.protectedPrefixes)
        ? parsed.protectedPrefixes.map(String)
        : fallback.protectedPrefixes,
    };
  } catch {
    return fallback;
  }
}

function isProtectedFile(filePath: string, config: ProtectedGovernanceConfig): boolean {
  const normalized = normalizeRepoPath(filePath);
  return (
    config.protectedExact.includes(normalized) ||
    config.protectedPrefixes.some((prefix) => normalized.startsWith(normalizeRepoPath(prefix)))
  );
}

function protectedForbiddenFiles(config: ProtectedGovernanceConfig): string[] {
  return uniqueStrings([...config.protectedExact, ...config.protectedPrefixes]);
}

export { readProtectedGovernanceConfig, isProtectedFile, protectedForbiddenFiles };
