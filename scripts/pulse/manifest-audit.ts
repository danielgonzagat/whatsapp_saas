import * as path from 'path';
import * as ts from 'typescript';
import { isDirectory, pathExists, readDir, readTextFile } from './safe-fs';
import { assertWithinRoot, safeJoin } from './lib/safe-path';
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

function extractCanonicalArtifactPaths(registryContent: string): Set<string> {
  const registeredPaths = new Set<string>();
  const sourceFile = ts.createSourceFile(
    'artifact-registry.ts',
    registryContent,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node) && node.name.getText(sourceFile) === 'relativePath') {
      const initializer = node.initializer;
      if (ts.isStringLiteral(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer)) {
        registeredPaths.add(initializer.text);
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'optionalEvidence'
    ) {
      const artifactPathArgument = node.arguments[1];
      if (
        artifactPathArgument &&
        (ts.isStringLiteral(artifactPathArgument) ||
          ts.isNoSubstitutionTemplateLiteral(artifactPathArgument))
      ) {
        registeredPaths.add(artifactPathArgument.text);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return registeredPaths;
}

function extractStringLiterals(content: string): Set<string> {
  const literals = new Set<string>();
  const sourceFile = ts.createSourceFile(
    'pulse-source.ts',
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      literals.add(node.text);
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return literals;
}

function collectPulseSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readDir(dir, { withFileTypes: true })) {
    const fullPath = safeJoin(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '__tests__') {
        continue;
      }
      files.push(...collectPulseSourceFiles(fullPath));
      continue;
    }
    if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

export function auditManifestRegistry(rootDir: string): ManifestAudit {
  const errors: string[] = [];
  const orphanArtifacts: string[] = [];
  const orphanAdapters: string[] = [];

  const repoRoot = path.resolve(process.cwd());
  // Validate user-supplied rootDir lives inside the repo root before deriving
  // any further paths from it. All subsequent fs calls go through safe-fs,
  // which re-validates each path against its allowed-roots boundary.
  const safeRootDir = assertWithinRoot(rootDir, repoRoot);

  const manifestPath = safeJoin(safeRootDir, 'pulse.manifest.json');
  if (!pathExists(manifestPath)) {
    return {
      status: 'FAILED',
      errors: ['pulse.manifest.json not found'],
      orphans: { artifacts: [], adapters: [] },
    };
  }

  let manifest: PulseManifest;
  try {
    manifest = JSON.parse(readTextFile(manifestPath, 'utf8')) as PulseManifest;
  } catch (e) {
    return {
      status: 'FAILED',
      errors: [`Failed to parse manifest: ${String(e)}`],
      orphans: { artifacts: [], adapters: [] },
    };
  }

  const artifactRegPath = safeJoin(safeRootDir, 'scripts/pulse/artifact-registry.ts');
  if (!pathExists(artifactRegPath)) {
    errors.push('artifact-registry.ts not found');
    return { status: 'FAILED', errors, orphans: { artifacts: [], adapters: [] } };
  }

  const registryContent = readTextFile(artifactRegPath, 'utf8');
  const registeredPaths = extractCanonicalArtifactPaths(registryContent);
  if (registeredPaths.size === 0) {
    errors.push('Could not parse canonical artifacts from artifact-registry.ts');
    return { status: 'FAILED', errors, orphans: { artifacts: [], adapters: [] } };
  }

  const artifactsPath = safeJoin(safeRootDir, 'scripts/pulse/artifacts.ts');
  const artifactsContent = readTextFile(artifactsPath, 'utf8');
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

  const pulseDir = safeJoin(safeRootDir, 'scripts/pulse');
  const referencedArtifactNames = new Set<string>();
  for (const file of collectPulseSourceFiles(pulseDir)) {
    for (const literal of extractStringLiterals(readTextFile(file, 'utf8'))) {
      if (/^PULSE_[A-Z0-9_]+\.(json|jsonl|md)$/.test(literal)) {
        referencedArtifactNames.add(literal);
      }
    }
  }

  registeredPaths.forEach((regPath) => {
    if (!writeCalls.has(regPath) && !referencedArtifactNames.has(regPath)) {
      orphanArtifacts.push(`Registered artifact "${regPath}" has no writer or source reference`);
    }
  });

  const adaptersDir = safeJoin(safeRootDir, 'scripts/pulse/adapters');
  if (!pathExists(adaptersDir) || !isDirectory(adaptersDir)) {
    errors.push('scripts/pulse/adapters directory not found');
    return {
      status: 'FAILED',
      errors,
      orphans: { artifacts: orphanArtifacts, adapters: orphanAdapters },
    };
  }

  const adapterFiles = readDir(adaptersDir).filter((f) => f.endsWith('.ts'));
  const orchestratorPath = safeJoin(adaptersDir, 'external-sources-orchestrator.ts');
  const orchestratorImports = readTextFile(orchestratorPath, 'utf8');
  const expectedAdapters = new Set<string>(['external-sources-orchestrator.ts']);
  const adapterImportRegex = /from\s+['"]\.\/([^'"]+-adapter)['"]/g;
  for (const match of orchestratorImports.matchAll(adapterImportRegex)) {
    expectedAdapters.add(`${match[1]}.ts`);
  }

  expectedAdapters.forEach((expected) => {
    if (!adapterFiles.includes(expected)) {
      orphanAdapters.push(`Expected adapter ${expected} not found`);
    }
  });

  adapterFiles.forEach((file) => {
    if (!expectedAdapters.has(file)) {
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
