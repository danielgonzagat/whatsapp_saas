import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';
import { safeJoin } from './safe-path';

/** How PULSE should interpret an artifact as operational truth. */
export type PulseArtifactTruthMode =
  | 'generated_from_module'
  | 'preserved_evidence'
  | 'external_snapshot'
  | 'compatibility_mirror';

/** Module/type pair that owns an artifact payload shape. */
export interface PulseArtifactSchemaRef {
  /** Source module that owns the artifact shape or builder. */
  module: string;
  /** Exported type, builder, or artifact contract name. */
  exportName: string;
}

/** Module/export pair that produces an artifact during a PULSE run. */
export interface PulseArtifactProducerRef {
  /** Producer module. */
  module: string;
  /** Producer export or snapshot source field. */
  exportName: string;
}

/** Artifact freshness policy. */
export interface PulseArtifactFreshnessPolicy {
  /** Freshness is bound to a run, preserved evidence, or adapter snapshot. */
  mode: 'run' | 'preserved' | 'external_snapshot';
  /** Maximum accepted age for snapshot-like evidence. */
  maxAgeMinutes?: number;
}

/** Pulse artifact definition shape. */
export interface PulseArtifactDefinition {
  /** Id property. */
  id: string;
  /** Relative path property. */
  relativePath: string;
  /** Schema module that owns this artifact's payload shape. */
  schema: PulseArtifactSchemaRef;
  /** Producer module/export that owns artifact generation. */
  producer: PulseArtifactProducerRef;
  /** Downstream modules that consume this artifact as evidence. */
  consumers: string[];
  /** Freshness policy for interpreting this artifact. */
  freshness: PulseArtifactFreshnessPolicy;
  /** Truth mode for this artifact; filenames are compatibility, not truth. */
  truthMode: PulseArtifactTruthMode;
  /** Mirror to root property. */
  mirrorToRoot?: boolean;
  /** Maximum persisted bytes before the artifact writer applies storage policy. */
  maxBytes?: number;
  /** Storage strategy for oversized optional artifacts. */
  oversizedStrategy?: 'summarize-json';
}

/** Pulse artifact registry shape. */
export interface PulseArtifactRegistry {
  /** Root dir property. */
  rootDir: string;
  /** Canonical dir property. */
  canonicalDir: string;
  /** Temp dir property. */
  tempDir: string;
  /** Artifacts property. */
  artifacts: PulseArtifactDefinition[];
  /** Mirrors property. */
  mirrors: string[];
  /** Run identity — set by generateArtifacts at run start. */
  runId?: string;
}

const OPTIONAL_EVIDENCE_MAX_BYTES = 1024 * 1024;
const OPTIONAL_TRACE_MAX_BYTES = 512 * 1024;
const EXTERNAL_SNAPSHOT_MAX_AGE_MINUTES = 6 * 60;
const LONG_EXTERNAL_SNAPSHOT_MAX_AGE_MINUTES = 24 * 60;

const ARTIFACT_FILE_PATTERN = /^PULSE_[A-Z0-9_]+\.(json|jsonl|md)$/;
const SOURCE_FILE_PATTERN = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const IGNORED_DISCOVERY_DIRS = new Set([
  '.git',
  '.next',
  '.pulse',
  'coverage',
  'dist',
  'node_modules',
  'parser-tests',
]);

type ArtifactReferenceIndex = Map<string, Set<string>>;

interface RegisteredArtifactWriter {
  id: string;
  moduleRef: string;
  contentExpression: ts.Expression | null;
  sourceFile: ts.SourceFile;
}

interface ArtifactDiscoveryContext {
  pulseDir: string;
  pulseReferences: ArtifactReferenceIndex;
  repoReferences: ArtifactReferenceIndex;
  rootArtifacts: Set<string>;
  referencedArtifacts: Set<string>;
}

function moduleRefFromPulseFile(pulseDir: string, filePath: string): string {
  const relative = path.relative(pulseDir, filePath).replace(/\\/g, '/');
  return `./${relative.replace(SOURCE_FILE_PATTERN, '')}`;
}

function readSourceFile(filePath: string): ts.SourceFile | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function collectSourceFiles(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) {
    return [];
  }
  const files: string[] = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_DISCOVERY_DIRS.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (entry.isFile() && SOURCE_FILE_PATTERN.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function addReference(
  index: ArtifactReferenceIndex,
  artifactPath: string,
  moduleRef: string,
): void {
  const refs = index.get(artifactPath) ?? new Set<string>();
  refs.add(moduleRef);
  index.set(artifactPath, refs);
}

function discoverArtifactReferences(rootDir: string, pulseDir: string): ArtifactDiscoveryContext {
  const pulseReferences: ArtifactReferenceIndex = new Map();
  const repoReferences: ArtifactReferenceIndex = new Map();
  const referencedArtifacts = new Set<string>();
  for (const filePath of collectSourceFiles(rootDir)) {
    const sourceFile = readSourceFile(filePath);
    if (!sourceFile) {
      continue;
    }
    const isPulseFile = filePath.startsWith(`${pulseDir}${path.sep}`);
    const moduleRef = isPulseFile
      ? moduleRefFromPulseFile(pulseDir, filePath)
      : path.relative(rootDir, filePath).replace(/\\/g, '/');
    const visit = (node: ts.Node): void => {
      if (ts.isStringLiteralLike(node) && ARTIFACT_FILE_PATTERN.test(node.text)) {
        referencedArtifacts.add(node.text);
        addReference(repoReferences, node.text, moduleRef);
        if (isPulseFile) {
          addReference(pulseReferences, node.text, moduleRef);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  const rootArtifacts = new Set(
    fs
      .readdirSync(rootDir)
      .filter(
        (entry) =>
          ARTIFACT_FILE_PATTERN.test(entry) && fs.statSync(path.join(rootDir, entry)).isFile(),
      ),
  );

  return {
    pulseDir,
    pulseReferences,
    repoReferences,
    rootArtifacts,
    referencedArtifacts,
  };
}

function discoverRegisteredWriters(pulseDir: string): RegisteredArtifactWriter[] {
  const artifactsPath = path.join(pulseDir, 'artifacts.ts');
  const sourceFile = readSourceFile(artifactsPath);
  if (!sourceFile) {
    return [];
  }
  const writers: RegisteredArtifactWriter[] = [];
  const moduleRef = moduleRefFromPulseFile(pulseDir, artifactsPath);
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'writeRegisteredArtifact'
    ) {
      const artifactId = node.arguments[1];
      if (artifactId && ts.isStringLiteralLike(artifactId)) {
        writers.push({
          id: artifactId.text,
          moduleRef,
          contentExpression: node.arguments[2] ?? null,
          sourceFile,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return writers;
}

function wordsFrom(value: string): Set<string> {
  return new Set(
    value
      .replace(/^PULSE_/, '')
      .replace(/\.(json|jsonl|md)$/i, '')
      .split(/[^a-z0-9]+/i)
      .map((word) => word.toLowerCase())
      .filter((word) => word.length > 0),
  );
}

function conventionalArtifactPath(id: string): string {
  return `PULSE_${id.replace(/-/g, '_').toUpperCase()}.json`;
}

function resolveDiscoveredArtifactPath(id: string, context: ArtifactDiscoveryContext): string {
  const idWords = wordsFrom(id);
  let bestPath = '';
  let bestScore = 0;
  for (const artifactPath of context.referencedArtifacts) {
    const artifactWords = wordsFrom(artifactPath);
    const score = [...idWords].filter((word) => artifactWords.has(word)).length;
    if (score > bestScore) {
      bestPath = artifactPath;
      bestScore = score;
    }
  }
  return bestPath || conventionalArtifactPath(id);
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
  const builder = firstCallIdentifier(writer.contentExpression);
  if (builder && builder !== 'JSON' && builder !== 'JSON.stringify') {
    return builder;
  }
  const snapshotPath = snapshotPathFromExpression(writer.contentExpression, writer.sourceFile);
  return snapshotPath ?? `writeRegisteredArtifact.${writer.id}`;
}

function schemaExportName(writer: RegisteredArtifactWriter): string {
  const builder = firstCallIdentifier(writer.contentExpression);
  if (builder && builder !== 'JSON' && builder !== 'JSON.stringify') {
    return builder;
  }
  const snapshotPath = snapshotPathFromExpression(writer.contentExpression, writer.sourceFile);
  if (snapshotPath) {
    return snapshotPath.replace(/^snapshot\./, 'PulseArtifactSnapshot.');
  }
  return producerExportName(writer);
}

function schemaModule(writer: RegisteredArtifactWriter): string {
  const snapshotPath = snapshotPathFromExpression(writer.contentExpression, writer.sourceFile);
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
    const words = wordsFrom(artifactPath);
    return {
      mode: 'external_snapshot',
      maxAgeMinutes:
        words.has('gitnexus') || words.has('beads')
          ? LONG_EXTERNAL_SNAPSHOT_MAX_AGE_MINUTES
          : EXTERNAL_SNAPSHOT_MAX_AGE_MINUTES,
    };
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

function storagePolicyFor(
  artifactPath: string,
): Pick<PulseArtifactDefinition, 'maxBytes' | 'oversizedStrategy'> {
  const words = wordsFrom(artifactPath);
  if (!isPreservedEvidence(artifactPath)) {
    return {};
  }
  return {
    maxBytes:
      words.has('trace') || words.has('traces')
        ? OPTIONAL_TRACE_MAX_BYTES
        : OPTIONAL_EVIDENCE_MAX_BYTES,
    oversizedStrategy: 'summarize-json',
  };
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
    ...storagePolicyFor(relativePath),
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

/** Build the canonical artifact registry for a PULSE run. */
export function buildArtifactRegistry(rootDir: string): PulseArtifactRegistry {
  const canonicalDir = safeJoin(rootDir, '.pulse', 'current');
  const tempDir = safeJoin(rootDir, '.pulse', 'tmp');
  const pulseDir = safeJoin(rootDir, 'scripts', 'pulse');
  const context = discoverArtifactReferences(rootDir, pulseDir);
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
