import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { safeJoin } from '../../safe-path';
import {
  type ArtifactReferenceIndex,
  type RegisteredArtifactWriter,
  type ArtifactDiscoveryContext,
  type PulseArtifactTruthMode,
  type PulseArtifactDefinition,
  type PulseArtifactRegistry,
  type PulseArtifactFreshnessPolicy,
  discoverArtifactReferences,
  discoverRegisteredWriters,
  resolveDiscoveredArtifactPath,
  wordsFrom,
} from './discovery';

function resolveExpression(
  expression: ts.Expression | null,
  writer: RegisteredArtifactWriter,
): ts.Expression | null {
  if (expression && ts.isIdentifier(expression)) {
    return writer.variableInitializers.get(expression.text) ?? expression;
  }
  return expression;
}

function firstCallIdentifier(expression: ts.Expression | null): string | null {
  if (!expression) {
    return null;
  }
  let current: ts.Node = expression;
  while (ts.isCallExpression(current)) {
    if (ts.isIdentifier(current.expression)) {
      return current.expression.text;
    }
    current = current.expression;
  }
  let found: string | null = null;
  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      found = node.expression.text;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(expression);
  return found;
}

function snapshotPathFromExpression(
  expression: ts.Expression | null,
  sourceFile: ts.SourceFile,
): string | null {
  if (!expression) {
    return null;
  }
  const text = expression.getText(sourceFile);
  const match = text.match(/snapshot(?:\.[a-zA-Z0-9_]+)+/);
  return match?.[0] ?? null;
}

function producerExportName(writer: RegisteredArtifactWriter): string {
  const expression = resolveExpression(writer.contentExpression, writer);
  const builder = firstCallIdentifier(expression);
  if (builder && builder !== 'JSON' && builder !== 'JSON.stringify') {
    return builder;
  }
  const snapshotPath = snapshotPathFromExpression(expression, writer.sourceFile);
  return snapshotPath ?? `writeRegisteredArtifact.${writer.id}`;
}

function schemaExportName(writer: RegisteredArtifactWriter): string {
  const expression = resolveExpression(writer.contentExpression, writer);
  const builder = firstCallIdentifier(expression);
  if (builder && builder !== 'JSON' && builder !== 'JSON.stringify') {
    return builder;
  }
  const snapshotPath = snapshotPathFromExpression(expression, writer.sourceFile);
  if (snapshotPath) {
    return snapshotPath.replace(/^snapshot\.certification\./, 'PulseCertification.');
  }
  return producerExportName(writer);
}

function schemaModule(writer: RegisteredArtifactWriter): string {
  const expression = resolveExpression(writer.contentExpression, writer);
  const snapshotPath = snapshotPathFromExpression(expression, writer.sourceFile);
  return snapshotPath ? './types' : writer.moduleRef;
}

function referencesFor(index: ArtifactReferenceIndex, artifactPath: string): string[] {
  return [...(index.get(artifactPath) ?? new Set<string>())].sort();
}

function consumersFor(
  artifactPath: string,
  writer: RegisteredArtifactWriter,
  context: ArtifactDiscoveryContext,
): string[] {
  return referencesFor(context.pulseReferences, artifactPath).filter(
    (moduleRef) => moduleRef !== './artifact-registry' && moduleRef !== writer.moduleRef,
  );
}

function isExternalSnapshot(artifactPath: string, references: string[]): boolean {
  const text = `${artifactPath} ${references.join(' ')}`.toLowerCase();
  return (
    text.includes('external') ||
    text.includes('adapter') ||
    text.includes('gitnexus') ||
    text.includes('beads')
  );
}

function isPreservedEvidence(artifactPath: string): boolean {
  const words = wordsFrom(artifactPath);
  return (
    words.has('evidence') ||
    words.has('trace') ||
    words.has('traces') ||
    words.has('probes') ||
    words.has('audit') ||
    words.has('coverage')
  );
}

function freshnessFor(artifactPath: string, references: string[]): PulseArtifactFreshnessPolicy {
  if (isExternalSnapshot(artifactPath, references)) {
    return { mode: 'external_snapshot' };
  }
  if (isPreservedEvidence(artifactPath)) {
    return { mode: 'preserved' };
  }
  return { mode: 'run' };
}

function truthModeFor(freshness: PulseArtifactFreshnessPolicy): PulseArtifactTruthMode {
  if (freshness.mode === 'external_snapshot') {
    return 'external_snapshot';
  }
  if (freshness.mode === 'preserved') {
    return 'preserved_evidence';
  }
  return 'generated_from_module';
}

function shouldMirrorToRoot(artifactPath: string, context: ArtifactDiscoveryContext): boolean {
  if (context.rootArtifacts.has(artifactPath)) {
    return true;
  }
  return referencesFor(context.repoReferences, artifactPath).some(
    (moduleRef) => !moduleRef.startsWith('./') && !moduleRef.includes('/__tests__/'),
  );
}

function buildDiscoveredArtifactDefinition(
  writer: RegisteredArtifactWriter,
  context: ArtifactDiscoveryContext,
): PulseArtifactDefinition {
  const relativePath = resolveDiscoveredArtifactPath(writer.id, context);
  const consumers = consumersFor(relativePath, writer, context);
  const references = referencesFor(context.repoReferences, relativePath);
  const freshness = freshnessFor(relativePath, references);
  return {
    id: writer.id,
    relativePath,
    schema: {
      module: schemaModule(writer),
      exportName: schemaExportName(writer),
    },
    producer: {
      module: writer.moduleRef,
      exportName: producerExportName(writer),
    },
    consumers,
    freshness,
    truthMode: truthModeFor(freshness),
    mirrorToRoot: shouldMirrorToRoot(relativePath, context),
  };
}

function buildArtifactDefinitionById(
  artifacts: PulseArtifactDefinition[],
): Map<string, PulseArtifactDefinition> {
  return new Map(artifacts.map((artifact) => [artifact.id, artifact]));
}

function sortArtifacts(artifacts: PulseArtifactDefinition[]): PulseArtifactDefinition[] {
  const seen = new Set<string>();
  return artifacts
    .filter((artifact) => {
      if (seen.has(artifact.id)) {
        return false;
      }
      seen.add(artifact.id);
      return true;
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function resolveDiscoveryRoot(rootDir: string): string {
  if (
    fs.existsSync(path.join(rootDir, 'scripts', 'pulse', 'artifacts.ts')) ||
    fs.existsSync(path.join(rootDir, 'scripts', 'pulse', '__parts__', 'artifacts', 'generate.ts'))
  ) {
    return rootDir;
  }
  return path.resolve(__dirname, '..', '..');
}

/** Build the canonical artifact registry for a PULSE run. */
export function buildArtifactRegistry(rootDir: string): PulseArtifactRegistry {
  const canonicalDir = safeJoin(rootDir, '.pulse', 'current');
  const tempDir = safeJoin(rootDir, '.pulse', 'tmp');
  const sourceRootDir = resolveDiscoveryRoot(rootDir);
  const pulseDir = safeJoin(sourceRootDir, 'scripts', 'pulse');
  const context = discoverArtifactReferences(sourceRootDir, rootDir, pulseDir);
  const artifacts = sortArtifacts(
    discoverRegisteredWriters(pulseDir).map((writer) =>
      buildDiscoveredArtifactDefinition(writer, context),
    ),
  );
  const mirrors = artifacts
    .filter((artifact) => artifact.mirrorToRoot)
    .map((artifact) => artifact.relativePath)
    .sort();

  return {
    rootDir,
    canonicalDir,
    tempDir,
    artifacts,
    mirrors,
  };
}

/** Resolve an artifact definition by stable registry id. */
export function getArtifactDefinitionById(
  registry: PulseArtifactRegistry,
  id: string,
): PulseArtifactDefinition | null {
  return buildArtifactDefinitionById(registry.artifacts).get(id) ?? null;
}

/** Resolve an artifact definition by stable registry id or fail closed. */
export function requireArtifactDefinitionById(
  registry: PulseArtifactRegistry,
  id: string,
): PulseArtifactDefinition {
  const artifact = getArtifactDefinitionById(registry, id);
  if (!artifact) {
    throw new Error(`PULSE artifact id is not registered: ${id}`);
  }
  return artifact;
}

/** Resolve the compatibility filename for a registered artifact id. */
export function resolveArtifactRelativePath(registry: PulseArtifactRegistry, id: string): string {
  return requireArtifactDefinitionById(registry, id).relativePath;
}
