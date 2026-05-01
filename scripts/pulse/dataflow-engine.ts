import * as path from 'path';
import { safeJoin } from './lib/safe-path';
import { readTextFile, writeTextFile, pathExists, readDir, ensureDir } from './safe-fs';
import type {
  DataflowRawSignal,
  DataflowCoverageStatus,
  DataflowState,
  DataflowStateMutation,
  EntityLifecycle,
} from './types.dataflow-engine';

const MODEL_REGEX = /model\s+(\w+)\s*\{/g;

// ── Prisma operation regexes (matches both `prisma.` and `tx.` prefixes) ──
const PRISMA_CLIENT_PREFIX = String.raw`(?:\b|\.)`;
const CREATE_REGEX = new RegExp(
  `${PRISMA_CLIENT_PREFIX}(?:prisma|tx)\\.(\\w+)\\.(create|upsert)\\(`,
  'g',
);
const READ_REGEX = new RegExp(
  `${PRISMA_CLIENT_PREFIX}(?:prisma|tx)\\.(\\w+)\\.(findUnique|findMany|findFirst|findFirstOrThrow|count|aggregate|groupBy)\\(`,
  'g',
);
const UPDATE_REGEX = new RegExp(
  `${PRISMA_CLIENT_PREFIX}(?:prisma|tx)\\.(\\w+)\\.(update|updateMany)\\(`,
  'g',
);
const DELETE_REGEX = new RegExp(
  `${PRISMA_CLIENT_PREFIX}(?:prisma|tx)\\.(\\w+)\\.(delete|deleteMany)\\(`,
  'g',
);

const MODEL_CREATE_REGEX = new RegExp(
  `${PRISMA_CLIENT_PREFIX}(?:prisma|tx)\\.(\\w+)\\.create\\(`,
  'g',
);
const TRANSACTION_REGEX = /(?:\b|\.)prisma\.\$transaction\(|\btx\.\w+\./;

function classifySourceRole(_filePath: string, content: string): string {
  const decoratorNames = Array.from(content.matchAll(/@([A-Z]\w*)\s*\(/g), (match) => match[1]);
  const className = content.match(/\bclass\s+([A-Z]\w*)\b/)?.[1];
  const implementedContract = content.match(/\bimplements\s+([A-Z]\w*)\b/)?.[1];
  const importedConstruct = content.match(/\bimport\s+\{([^}]+)\}\s+from\b/)?.[1];

  if (decoratorNames.length > 0 && className) {
    return `source_construct:decorated_class:${decoratorNames.join('+')}:${className}`;
  }
  if (implementedContract && className) {
    return `source_construct:interface:${implementedContract}:${className}`;
  }
  if (importedConstruct) {
    const firstConstruct = importedConstruct
      .split(',')
      .map((entry) => entry.trim())
      .find(Boolean);
    if (firstConstruct) {
      return `source_construct:import:${firstConstruct}`;
    }
  }
  return 'source_construct:unknown';
}

export function parsePrismaSchema(schemaPath: string): string[] {
  const content = readTextFile(schemaPath);
  const models: string[] = [];
  let match: RegExpExecArray | null;
  MODEL_REGEX.lastIndex = 0;
  while ((match = MODEL_REGEX.exec(content)) !== null) {
    models.push(match[1]);
  }
  return models;
}

function extractModelBlock(
  content: string,
  modelBodyStart: number,
): { text: string; endIndex: number } {
  let depth = 1;
  let pos = modelBodyStart;
  const startPos = modelBodyStart + 1;

  while (depth > 0 && pos < content.length) {
    pos++;
    const char = content[pos];
    if (char === '(') {
      // scan for matching `)` accounting for `"..."` strings inside parens
      let innerPos = pos + 1;
      while (innerPos < content.length && content[innerPos] !== ')') {
        if (content[innerPos] === '"') {
          innerPos = content.indexOf('"', innerPos + 1);
          if (innerPos === -1) break;
        }
        innerPos++;
      }
      if (content[innerPos] === ')') {
        pos = innerPos;
        continue;
      }
    }
    if (char === '"') {
      // scan for matching `"` accounting for escaped `\"`
      let innerPos = pos + 1;
      while (innerPos < content.length) {
        if (content[innerPos] === '\\') {
          innerPos++; // skip escaped char
        } else if (content[innerPos] === '"') {
          pos = innerPos;
          break;
        }
        innerPos++;
      }
      continue;
    }
    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
    }
  }

  return {
    text: content.slice(startPos, pos),
    endIndex: pos,
  };
}

interface PrismaFieldEvidence {
  name: string;
  type: string;
  attributes: string;
  relationFields: string[];
  relationReferences: string[];
}

interface SourceFileSnapshot {
  absolutePath: string;
  relativePath: string;
  content: string;
}

interface FieldUsageEvidence {
  writtenFields: Set<string>;
  predicateFields: Set<string>;
  projectedFields: Set<string>;
  mentionedFields: Set<string>;
  sourceFiles: Set<string>;
}

interface ModelUsageGraph {
  usageByModel: Map<string, FieldUsageEvidence>;
}

function createFieldUsageEvidence(): FieldUsageEvidence {
  return {
    writtenFields: new Set(),
    predicateFields: new Set(),
    projectedFields: new Set(),
    mentionedFields: new Set(),
    sourceFiles: new Set(),
  };
}

function sourceFileExtensionPattern(): RegExp {
  return /\.(ts|tsx|js|jsx)$/;
}

function shouldSkipSourceDirectory(entryName: string): boolean {
  return entryName.startsWith('.') || entryName === 'node_modules' || entryName === 'dist';
}

function discoverSourceFiles(rootDir: string): SourceFileSnapshot[] {
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

function sourceLooksLikeUi(content: string): boolean {
  return (
    /<[A-Za-z][\w.-]*(\s|>)/.test(content) || /\b(?:React|JSX|useState|useEffect)\b/.test(content)
  );
}

function routeFromSourceFile(relativePath: string): string {
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

function parseBracketList(attributes: string, key: 'fields' | 'references'): string[] {
  const match = new RegExp(`${key}:\\s*\\[([^\\]]*)\\]`).exec(attributes);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((entry) => entry.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
}

function parseModelFieldEvidence(schemaContent: string): Map<string, PrismaFieldEvidence[]> {
  const result = new Map<string, PrismaFieldEvidence[]>();
  let match: RegExpExecArray | null;
  MODEL_REGEX.lastIndex = 0;
  while ((match = MODEL_REGEX.exec(schemaContent)) !== null) {
    const modelName = match[1];
    const openBraceIdx = schemaContent.indexOf('{', match.index);
    if (openBraceIdx === -1) continue;

    const block = extractModelBlock(schemaContent, openBraceIdx);

    const fields: PrismaFieldEvidence[] = [];
    const lines = block.text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue;
      const fieldMatch = trimmed.match(/^(\w+)\s+([A-Za-z_]\w*)(.*)$/);
      if (fieldMatch) {
        const attributes = fieldMatch[3] ?? '';
        fields.push({
          name: fieldMatch[1],
          type: fieldMatch[2].replace(/[?[\]]/g, ''),
          attributes,
          relationFields: parseBracketList(attributes, 'fields'),
          relationReferences: parseBracketList(attributes, 'references'),
        });
      }
    }

    result.set(modelName, fields);
  }
  return result;
}

function parseModelFields(schemaContent: string): Map<string, string[]> {
  const evidence = parseModelFieldEvidence(schemaContent);
  const result = new Map<string, string[]>();
  for (const [modelName, fields] of evidence) {
    result.set(
      modelName,
      fields.map((field) => field.name),
    );
  }
  return result;
}

/**
 * Parses Prisma enums from the schema, returning a map of enum name → members.
 */
function parseEnums(schemaContent: string): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const enumRegex = /enum\s+(\w+)\s*\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = enumRegex.exec(schemaContent)) !== null) {
    const name = match[1];
    const body = match[2];
    const members = body
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('//'))
      .map((l) => l.replace(/\s.*$/, ''))
      .filter(Boolean);
    result.set(name, members);
  }
  return result;
}

function isNumericMoneyStorage(field: PrismaFieldEvidence): boolean {
  if (/@id\b|@unique\b/i.test(field.attributes)) return false;
  return field.type === 'Decimal' || field.type === 'BigInt';
}

function hasSchemaSensitivityEvidence(field: PrismaFieldEvidence): boolean {
  return /@sensitive\b|@pii\b/i.test(field.attributes);
}

function hasFieldUsageEvidence(
  field: PrismaFieldEvidence,
  usage: FieldUsageEvidence | undefined,
): boolean {
  return (
    usage?.mentionedFields.has(field.name) === true || usage?.writtenFields.has(field.name) === true
  );
}

function hasSupportedDataClassifierEvidence(
  field: PrismaFieldEvidence,
  usage: FieldUsageEvidence | undefined,
): boolean {
  return (
    isNumericMoneyStorage(field) ||
    hasSchemaSensitivityEvidence(field) ||
    hasFieldUsageEvidence(field, usage)
  );
}

function collectUnclassifiedSchemaSignals(
  fields: PrismaFieldEvidence[],
  usage: FieldUsageEvidence | undefined,
): DataflowRawSignal[] {
  return fields
    .filter(
      (field) =>
        !isNumericMoneyStorage(field) &&
        !hasSchemaSensitivityEvidence(field) &&
        usage !== undefined,
    )
    .map((field) => ({
      detector: 'unclassified-schema-field',
      field: field.name,
      truthMode: 'weak_signal',
      evidenceKind: 'schema',
      evidence:
        `Field "${field.name}" is schema-visible but lacks classifier proof; ` +
        'promotion requires schema sensitivity metadata, explicit monetary storage type, or observed source/runtime usage evidence',
    }));
}

function classifyFinancialFieldEvidence(
  fields: PrismaFieldEvidence[],
  usage: FieldUsageEvidence | undefined,
): {
  financial: boolean;
} {
  return {
    financial: fields.some(
      (field) =>
        isNumericMoneyStorage(field) &&
        (usage === undefined ||
          usage.sourceFiles.size === 0 ||
          usage.writtenFields.has(field.name) ||
          usage.predicateFields.has(field.name) ||
          usage.projectedFields.has(field.name)),
    ),
  };
}
export * from './__companions__/dataflow-engine.companion';
