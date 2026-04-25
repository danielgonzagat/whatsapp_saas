import * as fs from 'fs';
import * as path from 'path';
import type { PulseManifest } from './types.manifest';
import type { PulseManifestScenarioSpec } from './types.health';

interface ManifestAudit {
  status: 'OK' | 'FAILED';
  errors: string[];
  orphans: {
    artifacts: string[];
    adapters: string[];
  };
}

/**
 * Resolves `p` to an absolute path and asserts it lives inside `repoRoot`.
 *
 * This guards against path-traversal attacks where a caller-influenced
 * `rootDir` (or a relative segment derived from it) escapes the repository
 * via `..` or absolute path injection. Every fs operation in this module
 * routes through this helper so Codacy/Semgrep can prove the resolved path
 * is anchored to a known root before being read from or enumerated.
 *
 * @param p Path to validate (may be absolute or relative).
 * @param repoRoot Trusted repository root (must already be absolute/normalized).
 * @returns The resolved absolute path, guaranteed to be inside `repoRoot`.
 * @throws Error if the resolved path escapes `repoRoot`.
 */
function assertPathInsideRepoRoot(p: string, repoRoot: string): string {
  const resolved = path.resolve(p);
  const normalizedRoot = path.resolve(repoRoot);
  if (resolved !== normalizedRoot && !resolved.startsWith(normalizedRoot + path.sep)) {
    throw new Error(
      `Path traversal detected: "${p}" resolves outside repo root "${normalizedRoot}"`,
    );
  }
  return resolved;
}

export function auditManifestRegistry(rootDir: string): ManifestAudit {
  const errors: string[] = [];
  const orphanArtifacts: string[] = [];
  const orphanAdapters: string[] = [];

  const repoRoot = path.resolve(process.cwd());
  const safeRootDir = assertPathInsideRepoRoot(rootDir, repoRoot);

  const manifestPath = assertPathInsideRepoRoot(
    path.join(safeRootDir, 'pulse.manifest.json'),
    repoRoot,
  );
  if (!fs.existsSync(manifestPath)) {
    return {
      status: 'FAILED',
      errors: ['pulse.manifest.json not found'],
      orphans: { artifacts: [], adapters: [] },
    };
  }

  let manifest: PulseManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PulseManifest;
  } catch (e) {
    return {
      status: 'FAILED',
      errors: [`Failed to parse manifest: ${String(e)}`],
      orphans: { artifacts: [], adapters: [] },
    };
  }

  const artifactRegPath = assertPathInsideRepoRoot(
    path.join(safeRootDir, 'scripts/pulse/artifact-registry.ts'),
    repoRoot,
  );
  if (!fs.existsSync(artifactRegPath)) {
    errors.push('artifact-registry.ts not found');
    return { status: 'FAILED', errors, orphans: { artifacts: [], adapters: [] } };
  }

  const registryContent = fs.readFileSync(artifactRegPath, 'utf8');
  const registryArtifactMatch = registryContent.match(
    /const CANONICAL_ARTIFACTS[^=]*=\s*\[([\s\S]*?)\]/,
  );
  if (!registryArtifactMatch) {
    errors.push('Could not parse CANONICAL_ARTIFACTS from artifact-registry.ts');
    return { status: 'FAILED', errors, orphans: { artifacts: [], adapters: [] } };
  }

  const registeredPaths = new Set<string>();
  const lines = registryArtifactMatch[1].split('\n');
  lines.forEach((line) => {
    const pathMatch = line.match(/relativePath:\s*['"]([^'"]+)['"]/);
    if (pathMatch) registeredPaths.add(pathMatch[1]);
  });

  const artifactsPath = assertPathInsideRepoRoot(
    path.join(safeRootDir, 'scripts/pulse/artifacts.ts'),
    repoRoot,
  );
  const artifactsContent = fs.readFileSync(artifactsPath, 'utf8');
  const writeCalls = new Set<string>();
  const regex = /writeArtifact\s*\(\s*['"]([^'"]+)['"]/g;
  for (const regMatch of artifactsContent.matchAll(regex)) {
    writeCalls.add(regMatch[1]);
  }

  writeCalls.forEach((call) => {
    if (!registeredPaths.has(call)) {
      orphanArtifacts.push(`writeArtifact("${call}", ...) has no entry in CANONICAL_ARTIFACTS`);
    }
  });

  registeredPaths.forEach((regPath) => {
    if (!writeCalls.has(regPath)) {
      orphanArtifacts.push(`Registered artifact "${regPath}" has no writeArtifact call`);
    }
  });

  const adaptersDir = assertPathInsideRepoRoot(
    path.join(safeRootDir, 'scripts/pulse/adapters'),
    repoRoot,
  );
  if (!fs.existsSync(adaptersDir)) {
    errors.push('scripts/pulse/adapters directory not found');
    return {
      status: 'FAILED',
      errors,
      orphans: { artifacts: orphanArtifacts, adapters: orphanAdapters },
    };
  }

  const adapterFiles = fs.readdirSync(adaptersDir).filter((f) => f.endsWith('.ts'));
  const expectedAdapters = [
    'codecov-adapter.ts',
    'datadog-adapter.ts',
    'dependabot-adapter.ts',
    'github-actions-adapter.ts',
    'github-adapter.ts',
    'sentry-adapter.ts',
    'external-sources-orchestrator.ts',
    'prometheus-adapter.ts',
  ];

  expectedAdapters.forEach((expected) => {
    if (!adapterFiles.includes(expected)) {
      orphanAdapters.push(`Expected adapter ${expected} not found`);
    }
  });

  adapterFiles.forEach((file) => {
    if (!expectedAdapters.includes(file)) {
      orphanAdapters.push(`Unexpected adapter ${file} found`);
    }
  });

  const scenarios = manifest.scenarioSpecs || [];
  if (scenarios.length === 0) {
    errors.push('No scenarioSpecs found in manifest');
  }

  scenarios.forEach((scenario: PulseManifestScenarioSpec) => {
    if (!scenario.id) {
      errors.push('Scenario missing id field');
    }
    if (!scenario.moduleKeys || !Array.isArray(scenario.moduleKeys)) {
      errors.push(`Scenario ${scenario.id} has invalid moduleKeys`);
    }
  });

  const status =
    errors.length === 0 && orphanArtifacts.length === 0 && orphanAdapters.length === 0
      ? 'OK'
      : 'FAILED';

  return {
    status,
    errors,
    orphans: { artifacts: orphanArtifacts, adapters: orphanAdapters },
  };
}
