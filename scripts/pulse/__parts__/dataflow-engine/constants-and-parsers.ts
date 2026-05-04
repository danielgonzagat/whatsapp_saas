import * as path from 'path';
import { safeJoin } from '../../lib/safe-path';
import { readTextFile } from '../../safe-fs';
import type { DataflowCoverageStatus } from '../../types.dataflow-engine';

export const MODEL_REGEX = /model\s+(\w+)\s*\{/g;

export const PRISMA_CLIENT_PREFIX = String.raw`(?:\b|\.)`;
export const CREATE_REGEX = new RegExp(
  `${PRISMA_CLIENT_PREFIX}(?:prisma|tx)\\.(\\w+)\\.(create|upsert)\\(`,
  'g',
);
export const READ_REGEX = new RegExp(
  `${PRISMA_CLIENT_PREFIX}(?:prisma|tx)\\.(\\w+)\\.(findUnique|findMany|findFirst|findFirstOrThrow|count|aggregate|groupBy)\\(`,
  'g',
);
export const UPDATE_REGEX = new RegExp(
  `${PRISMA_CLIENT_PREFIX}(?:prisma|tx)\\.(\\w+)\\.(update|updateMany)\\(`,
  'g',
);
export const DELETE_REGEX = new RegExp(
  `${PRISMA_CLIENT_PREFIX}(?:prisma|tx)\\.(\\w+)\\.(delete|deleteMany)\\(`,
  'g',
);
export const MODEL_CREATE_REGEX = new RegExp(
  `${PRISMA_CLIENT_PREFIX}(?:prisma|tx)\\.(\\w+)\\.create\\(`,
  'g',
);
export const TRANSACTION_REGEX = /(?:\b|\.)prisma\.\$transaction\(|\btx\.\w+\./;

export function classifySourceRole(_filePath: string, content: string): string {
  const decoratorNames = Array.from(content.matchAll(/@([A-Z]\w*)\s*\(/g), (m) => m[1]);
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

export function extractModelBlock(
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
      let innerPos = pos + 1;
      while (innerPos < content.length) {
        if (content[innerPos] === '\\') {
          innerPos++;
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

export interface PrismaFieldEvidence {
  name: string;
  type: string;
  attributes: string;
  relationFields: string[];
  relationReferences: string[];
}

export interface SourceFileSnapshot {
  absolutePath: string;
  relativePath: string;
  content: string;
}

export interface FieldUsageEvidence {
  writtenFields: Set<string>;
  predicateFields: Set<string>;
  projectedFields: Set<string>;
  mentionedFields: Set<string>;
  sourceFiles: Set<string>;
}

export interface ModelUsageGraph {
  usageByModel: Map<string, FieldUsageEvidence>;
}

export interface ModelOperations {
  model: string;
  createdBy: Array<{ source: string; filePath: string; status: DataflowCoverageStatus }>;
  readBy: Array<{ source: string; filePath: string; status: DataflowCoverageStatus }>;
  updatedBy: Array<{ source: string; filePath: string; status: DataflowCoverageStatus }>;
  deletedBy: Array<{ source: string; filePath: string; status: DataflowCoverageStatus }>;
  hasWorkspaceIsolation: boolean;
  hasMutableState: boolean;
  hasVersionHistory: boolean;
  fieldUsage: FieldUsageEvidence;
}

export function createFieldUsageEvidence(): FieldUsageEvidence {
  return {
    writtenFields: new Set(),
    predicateFields: new Set(),
    projectedFields: new Set(),
    mentionedFields: new Set(),
    sourceFiles: new Set(),
  };
}

export function sourceFileExtensionPattern(): RegExp {
  return /\.(ts|tsx|js|jsx)$/;
}

export function shouldSkipSourceDirectory(entryName: string): boolean {
  return entryName.startsWith('.') || entryName === 'node_modules' || entryName === 'dist';
}

export function parseBracketList(attributes: string, key: 'fields' | 'references'): string[] {
  const match = new RegExp(`${key}:\\s*\\[([^\\]]*)\\]`).exec(attributes);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((entry) => entry.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
}
