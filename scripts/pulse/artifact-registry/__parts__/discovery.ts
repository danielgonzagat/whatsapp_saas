import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { safeJoin } from '../safe-path';

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

const ARTIFACT_FILE_PATTERN = /^PULSE_[A-Z0-9_]+\.(json|jsonl|md)$/;
const SOURCE_FILE_PATTERN = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const IGNORED_DISCOVERY_DIRS = new Set([
  '.git',
  '.next',
  '.pulse',
  '__tests__',
  'coverage',
  'dist',
  'node_modules',
  'parser-tests',
]);

export type ArtifactReferenceIndex = Map<string, Set<string>>;

export interface RegisteredArtifactWriter {
  id: string;
  moduleRef: string;
  contentExpression: ts.Expression | null;
  sourceFile: ts.SourceFile;
  variableInitializers: Map<string, ts.Expression>;
}

export interface ArtifactDiscoveryContext {
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

export function discoverArtifactReferences(
  sourceRootDir: string,
  artifactRootDir: string,
  pulseDir: string,
): ArtifactDiscoveryContext {
  const pulseReferences: ArtifactReferenceIndex = new Map();
  const repoReferences: ArtifactReferenceIndex = new Map();
  const referencedArtifacts = new Set<string>();
  for (const filePath of collectSourceFiles(sourceRootDir)) {
    const sourceFile = readSourceFile(filePath);
    if (!sourceFile) {
      continue;
    }
    const isPulseFile = filePath.startsWith(`${pulseDir}${path.sep}`);
    const moduleRef = isPulseFile
      ? moduleRefFromPulseFile(pulseDir, filePath)
      : path.relative(sourceRootDir, filePath).replace(/\\/g, '/');
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
    fs.existsSync(artifactRootDir)
      ? fs
          .readdirSync(artifactRootDir)
          .filter(
            (entry) =>
              ARTIFACT_FILE_PATTERN.test(entry) &&
              fs.statSync(path.join(artifactRootDir, entry)).isFile(),
          )
      : [],
  );

  return {
    pulseDir,
    pulseReferences,
    repoReferences,
    rootArtifacts,
    referencedArtifacts,
  };
}

export function discoverRegisteredWriters(pulseDir: string): RegisteredArtifactWriter[] {
  const artifactsPath = path.join(pulseDir, 'artifacts.ts');
  const sourceFile = readSourceFile(artifactsPath);
  if (!sourceFile) {
    return [];
  }
  const writers: RegisteredArtifactWriter[] = [];
  const variableInitializers = new Map<string, ts.Expression>();
  const moduleRef = moduleRefFromPulseFile(pulseDir, artifactsPath);
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      variableInitializers.set(node.name.text, node.initializer);
    }
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
          variableInitializers,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return writers;
}

export function wordsFrom(value: string): Set<string> {
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

export function resolveDiscoveredArtifactPath(
  id: string,
  context: ArtifactDiscoveryContext,
): string {
  const idWords = wordsFrom(id);
  const conventionalPath = conventionalArtifactPath(id);
  if (context.referencedArtifacts.has(conventionalPath)) {
    return conventionalPath;
  }
  let bestPath = '';
  let bestScore = 0;
  let bestExtraWords = Number.MAX_SAFE_INTEGER;
  for (const artifactPath of context.referencedArtifacts) {
    const artifactWords = wordsFrom(artifactPath);
    if (![...idWords].every((word) => artifactWords.has(word))) {
      continue;
    }
    const score = [...idWords].filter((word) => artifactWords.has(word)).length;
    const extraWords = artifactWords.size - score;
    if (score > bestScore || (score === bestScore && extraWords < bestExtraWords)) {
      bestPath = artifactPath;
      bestScore = score;
      bestExtraWords = extraWords;
    }
  }
  return bestPath || conventionalPath;
}
