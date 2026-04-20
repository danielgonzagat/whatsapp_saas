import * as fs from 'fs';
import type { PrismaModel, PrismaField, PrismaRelation, PulseConfig } from '../types';

function toCamelCase(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/** Parse schema. */
export function parseSchema(config: PulseConfig): PrismaModel[] {
  if (!config.schemaPath || !fs.existsSync(config.schemaPath)) {
    return [];
  }

  const content = fs.readFileSync(config.schemaPath, 'utf8');
  const lines = content.split('\n');
  const models: PrismaModel[] = [];
  const modelNames = new Set<string>();

  // First pass: collect all model names for relation detection
  for (const line of lines) {
    const m = line.match(/^model\s+(\w+)\s*\{/);
    if (m) {
      modelNames.add(m[1]);
    }
  }

  let currentModel: PrismaModel | null = null;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Model start
    const modelMatch = trimmed.match(/^model\s+(\w+)\s*\{/);
    if (modelMatch) {
      currentModel = {
        name: modelMatch[1],
        accessorName: toCamelCase(modelMatch[1]),
        line: i + 1,
        fields: [],
        relations: [],
      };
      braceDepth = 1;
      continue;
    }

    if (!currentModel) {
      continue;
    }

    // Track braces
    for (const ch of trimmed) {
      if (ch === '{') {
        braceDepth++;
      }
      if (ch === '}') {
        braceDepth--;
      }
    }

    // Model end
    if (braceDepth === 0) {
      models.push(currentModel);
      currentModel = null;
      continue;
    }

    // Skip comments and decorators-only lines
    if (trimmed.startsWith('//') || trimmed.startsWith('@@') || trimmed === '') {
      continue;
    }

    // Parse field
    const fieldMatch = trimmed.match(/^(\w+)\s+([\w\[\]?]+(?:\(".*?"\))?)\s*(.*)?$/);
    if (!fieldMatch) {
      continue;
    }

    const fieldName = fieldMatch[1];
    const rawType = fieldMatch[2];
    const rest = fieldMatch[3] || '';

    // Clean type
    const cleanType = rawType
      .replace(/\?$/, '')
      .replace(/\[\]$/, '')
      .replace(/\(.*\)/, '');
    const isOptional = rawType.includes('?');
    const isArray = rawType.includes('[]');
    const isId = rest.includes('@id');

    // Check if this is a relation field
    if (modelNames.has(cleanType)) {
      currentModel.relations.push({
        fieldName,
        targetModel: cleanType,
        type: isArray ? 'many' : 'one',
        line: i + 1,
      });
    } else if (cleanType !== 'Unsupported') {
      currentModel.fields.push({
        name: fieldName,
        type: cleanType,
        line: i + 1,
        isOptional,
        isArray,
        isId,
      });
    }
  }

  return models;
}
