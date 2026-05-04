import { safeJoin } from '../../lib/safe-path';
import { pathExists, readTextFile } from '../../safe-fs';
import { walkFiles } from '../../parsers/utils';
import type { APIEndpointProbe } from '../../types.api-fuzzer';

/**
 * Convert PascalCase to kebab-case for DTO filename matching.
 */
export function pascalToKebab(name: string): string {
  return name
    .replace(/Dto$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

export function inferPrimitiveTypeFromValidatorName(validatorName: string): string | null {
  const normalized = validatorName.replace(/^Is/, '').toLowerCase();
  if (normalized.includes('array')) return 'array';
  if (normalized.includes('boolean')) return 'boolean';
  if (
    normalized.includes('number') ||
    normalized.includes('int') ||
    normalized.includes('float') ||
    normalized.includes('decimal')
  ) {
    return 'number';
  }
  if (
    normalized.includes('object') ||
    normalized.includes('json') ||
    normalized.includes('record')
  ) {
    return 'object';
  }
  if (normalized.length > 0) return 'string';
  return null;
}

/**
 * Validate DTO decorator patterns from source code to infer schema shape.
 *
 * Scans all .dto.ts files in backend/src for the target class name. Uses
 * kebab-case filename matching first, then falls back to full content search.
 * Accumulates class-validator decorators across lines to correctly detect
 * optional/required fields even when decorators precede the field declaration.
 */
/**
 * Check whether a kebab-candidate file actually contains the target class.
 */
export function fileHasClass(filePath: string, dtoType: string): boolean {
  try {
    const content = readTextFile(filePath, 'utf8');
    return content.includes(`class ${dtoType}`) || content.includes(`class ${dtoType} `);
  } catch {
    return false;
  }
}

export function parseDtoSchema(
  dtoType: string,
  rootDir: string,
): Record<string, { type: string; required: boolean }> | null {
  const backendDir = safeJoin(rootDir, 'backend', 'src');
  if (!pathExists(backendDir)) {
    return null;
  }

  const allFiles = walkFiles(backendDir, ['.ts']);
  const kebab = pascalToKebab(dtoType);

  let dtoFile: string | null = null;

  for (const f of allFiles) {
    if (f.includes('.dto.ts') && f.includes(kebab) && fileHasClass(f, dtoType)) {
      dtoFile = f;
      break;
    }
  }

  if (!dtoFile) {
    for (const f of allFiles) {
      if (!f.includes('.dto.ts')) continue;
      if (fileHasClass(f, dtoType)) {
        dtoFile = f;
        break;
      }
    }
  }

  if (!dtoFile) {
    return null;
  }

  const schema: Record<string, { type: string; required: boolean }> = {};

  try {
    const content = readTextFile(dtoFile, 'utf8');
    const lines = content.split('\n');

    let inClass = false;
    let pendingIsOptional = false;
    let pendingType: string | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.includes(`class ${dtoType}`)) {
        inClass = true;
        continue;
      }
      if (inClass && trimmed === '}' && !/export\s+class/.test(trimmed)) {
        break;
      }
      if (!inClass) {
        continue;
      }

      if (/^@IsOptional\(\)/.test(trimmed)) {
        pendingIsOptional = true;
        continue;
      }

      const decoratorTypeMatch = trimmed.match(/^@(Is\w+)\(\s*(?:\{[^}]*\})?\s*\)/);
      if (decoratorTypeMatch) {
        const mapped = inferPrimitiveTypeFromValidatorName(decoratorTypeMatch[1]);
        if (mapped) {
          pendingType = mapped;
        }
        continue;
      }

      const fieldMatch = trimmed.match(/^(\w+)([?!])?\s*:\s*(.+?);?\s*$/);
      if (fieldMatch) {
        const fieldName = fieldMatch[1];
        const optionalMarker = fieldMatch[2];
        const tsType = fieldMatch[3];

        let inferredType = pendingType || tsType.replace(/\[\]$/, '');
        if (inferredType === 'array') {
          inferredType = tsType.includes('[]') ? tsType : 'array';
        }
        if (inferredType.includes('<') || inferredType.includes('{')) {
          inferredType = 'object';
        }

        const isOptional = pendingIsOptional || optionalMarker === '?';

        schema[fieldName] = {
          type: inferredType,
          required: !isOptional,
        };

        pendingIsOptional = false;
        pendingType = null;
      }
    }
  } catch {
    return null;
  }

  return Object.keys(schema).length > 0 ? schema : null;
}

export function isDtoFieldDefinition(value: unknown): value is { type: string; required: boolean } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { type?: unknown; required?: unknown };
  return typeof candidate.type === 'string' && typeof candidate.required === 'boolean';
}

export function schemaFieldsFromEndpoint(
  endpoint: APIEndpointProbe,
): Record<string, { type: string; required: boolean }> {
  const fields = endpoint.requestSchema?.fields;
  if (!fields || typeof fields !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(fields).filter((entry): entry is [string, { type: string; required: boolean }] =>
      isDtoFieldDefinition(entry[1]),
    ),
  );
}

export function sampleValueForFieldType(type: string): unknown {
  if (/boolean/i.test(type)) return true;
  if (/number|int|float|decimal/i.test(type)) return 42;
  if (/\[\]|array/i.test(type)) return ['__pulse_item'];
  if (/object|record/i.test(type)) return { value: '__pulse_nested' };
  return '__pulse_value';
}

export function buildValidPayloadFromSchema(
  schema: Record<string, { type: string; required: boolean }>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(schema).map(([fieldName, definition]) => [
      fieldName,
      sampleValueForFieldType(definition.type),
    ]),
  );
}

export function wrongTypeValueForFieldType(type: string): unknown {
  if (/boolean/i.test(type)) return 'not-bool';
  if (/number|int|float|decimal/i.test(type)) return 'not-a-number';
  if (/\[\]|array/i.test(type)) return '__pulse_not_array';
  if (/object|record/i.test(type)) return '__pulse_not_object';
  return 12345;
}
