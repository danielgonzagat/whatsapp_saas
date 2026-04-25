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

export function auditManifestRegistry(rootDir: string): ManifestAudit {
  const errors: string[] = [];
  const orphanArtifacts: string[] = [];
  const orphanAdapters: string[] = [];

  const manifestPath = path.join(rootDir, 'pulse.manifest.json');
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

  const artifactRegPath = path.join(rootDir, 'scripts/pulse/artifact-registry.ts');
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

  const artifactsPath = path.join(rootDir, 'scripts/pulse/artifacts.ts');
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

  const adaptersDir = path.join(rootDir, 'scripts/pulse/adapters');
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
