import * as path from 'path';
import { safeJoin } from '../../lib/safe-path';
import { readTextFile, pathExists, readDir } from '../../safe-fs';
import {
  PRISMA_CLIENT_PREFIX,
  createFieldUsageEvidence,
  sourceFileExtensionPattern,
  shouldSkipSourceDirectory,
} from './constants-and-parsers';
import type {
  SourceFileSnapshot,
  FieldUsageEvidence,
  ModelUsageGraph,
  PrismaFieldEvidence,
} from './constants-and-parsers';

export function discoverSourceFiles(rootDir: string): SourceFileSnapshot[] {
  const files: SourceFileSnapshot[] = [];

  function scanDir(dir: string): void {
    if (!pathExists(dir)) return;
    const entries = readDir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (shouldSkipSourceDirectory(entry.name)) continue;
        scanDir(fullPath);
      } else if (entry.isFile() && sourceFileExtensionPattern().test(entry.name)) {
        try {
          files.push({
            absolutePath: fullPath,
            relativePath: path.relative(rootDir, fullPath),
            content: readTextFile(fullPath),
          });
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  scanDir(rootDir);
  return files;
}

export function sourceLooksLikeUi(content: string): boolean {
  return (
    /<[A-Za-z][\w.-]*(\s|>)/.test(content) || /\b(?:React|JSX|useState|useEffect)\b/.test(content)
  );
}

export function routeFromSourceFile(relativePath: string): string {
  const normalized = relativePath.split(path.sep).join('/');
  const extension = path.extname(normalized);
  const withoutExtension = extension ? normalized.slice(0, -extension.length) : normalized;
  const segments = withoutExtension.split('/').filter(Boolean);
  const routeRootIndex = segments.findIndex((segment) => segment === 'pages' || segment === 'app');
  const routeSegments = routeRootIndex >= 0 ? segments.slice(routeRootIndex + 1) : segments;
  const normalizedSegments = routeSegments
    .filter((segment) => segment !== 'index' && segment !== 'page')
    .map((segment) => {
      if (segment.startsWith('[[...') && segment.endsWith(']]')) {
        return `:${segment.slice('[[...'.length, -']]'.length)}*`;
      }
      if (segment.startsWith('[...') && segment.endsWith(']')) {
        return `:${segment.slice('[...'.length, -']'.length)}*`;
      }
      if (segment.startsWith('[') && segment.endsWith(']')) {
        return `:${segment.slice('['.length, -']'.length)}`;
      }
      return segment;
    });
  return `/${normalizedSegments.join('/')}`.replace(/\/+/g, '/') || '/';
}

export function collectFieldUsageFromContext(
  context: string,
  fields: PrismaFieldEvidence[],
  usage: FieldUsageEvidence,
  bucketName: 'createdBy' | 'readBy' | 'updatedBy' | 'deletedBy',
  relativePath: string,
): void {
  for (const field of fields) {
    const fieldPattern = new RegExp(`\\b${field.name}\\b`);
    if (!fieldPattern.test(context)) continue;
    usage.mentionedFields.add(field.name);
    usage.sourceFiles.add(relativePath);
    if (bucketName === 'createdBy' || bucketName === 'updatedBy') {
      usage.writtenFields.add(field.name);
    } else if (/\bwhere\s*:/.test(context)) {
      usage.predicateFields.add(field.name);
    } else if (/\bselect\s*:|\binclude\s*:/.test(context)) {
      usage.projectedFields.add(field.name);
    }
  }
}

export function buildUsageGraph(
  sourceFiles: SourceFileSnapshot[],
  modelByPrismaProperty: Map<string, string>,
  fieldEvidenceByModel: Map<string, PrismaFieldEvidence[]>,
): ModelUsageGraph {
  const usageByModel = new Map<string, FieldUsageEvidence>();
  for (const modelName of fieldEvidenceByModel.keys()) {
    usageByModel.set(modelName, createFieldUsageEvidence());
  }

  const operationRegex = new RegExp(
    `${PRISMA_CLIENT_PREFIX}(?:prisma|tx)\\.(\\w+)\\.(create|upsert|findUnique|findMany|findFirst|findFirstOrThrow|count|aggregate|groupBy|update|updateMany|delete|deleteMany)\\(`,
    'g',
  );

  for (const sourceFile of sourceFiles) {
    operationRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = operationRegex.exec(sourceFile.content)) !== null) {
      const modelName = modelByPrismaProperty.get(match[1]);
      if (!modelName) continue;
      const fields = fieldEvidenceByModel.get(modelName) ?? [];
      const usage = usageByModel.get(modelName);
      if (!usage) continue;
      const operation = match[2];
      const bucketName =
        operation === 'create' || operation === 'upsert'
          ? 'createdBy'
          : operation === 'update' || operation === 'updateMany'
            ? 'updatedBy'
            : operation === 'delete' || operation === 'deleteMany'
              ? 'deletedBy'
              : 'readBy';
      const context = sourceFile.content.slice(
        Math.max(0, match.index - 600),
        Math.min(sourceFile.content.length, match.index + 1200),
      );
      collectFieldUsageFromContext(context, fields, usage, bucketName, sourceFile.relativePath);
    }
  }

  return { usageByModel };
}

function readArtifactObject(filePath: string): Record<string, unknown> | null {
  if (!pathExists(filePath)) return null;
  try {
    const parsed = JSON.parse(readTextFile(filePath)) as unknown;
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

export function mergeArtifactUsageEvidence(
  rootDir: string,
  usageByModel: Map<string, FieldUsageEvidence>,
): void {
  const artifactPaths = [
    safeJoin(rootDir, '.pulse', 'current', 'PULSE_DATAFLOW_STATE.json'),
    safeJoin(rootDir, 'PULSE_DATAFLOW_STATE.json'),
  ];

  for (const artifactPath of artifactPaths) {
    const artifact = readArtifactObject(artifactPath);
    if (!artifact) continue;
    const artifactLabel = path.relative(rootDir, artifactPath);

    if (Array.isArray(artifact.entities)) {
      for (const entity of artifact.entities) {
        if (entity === null || typeof entity !== 'object' || Array.isArray(entity)) continue;
        const candidate = entity as Record<string, unknown>;
        if (typeof candidate.model !== 'string') continue;
        const usage = usageByModel.get(candidate.model);
        if (!usage) continue;
        for (const field of stringArray(candidate.piiFields)) {
          usage.mentionedFields.add(field);
          usage.sourceFiles.add(artifactLabel);
        }
      }
    }

    if (Array.isArray(artifact.mutations)) {
      for (const mutation of artifact.mutations) {
        if (mutation === null || typeof mutation !== 'object' || Array.isArray(mutation)) continue;
        const candidate = mutation as Record<string, unknown>;
        if (typeof candidate.targetModel !== 'string') continue;
        const usage = usageByModel.get(candidate.targetModel);
        if (!usage) continue;
        for (const field of stringArray(candidate.fields)) {
          usage.writtenFields.add(field);
          usage.mentionedFields.add(field);
          usage.sourceFiles.add(artifactLabel);
        }
      }
    }
  }
}
