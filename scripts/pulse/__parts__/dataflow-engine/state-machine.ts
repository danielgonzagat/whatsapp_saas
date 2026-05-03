import type { SourceFileSnapshot } from './constants-and-parsers';
import { extractModelBlock } from './constants-and-parsers';

interface StatusTransition {
  from: string | null;
  to: string;
  operation: string;
  sourceFile: string;
}

export function extractStatusTransitions(
  sourceFiles: SourceFileSnapshot[],
  modelName: string,
  statusFields: string[],
): Map<string, StatusTransition[]> {
  const transitions = new Map<string, StatusTransition[]>();
  if (statusFields.length === 0) return transitions;

  for (const field of statusFields) {
    transitions.set(field, []);
  }

  for (const sourceFile of sourceFiles) {
    if (!sourceFile.content.toLowerCase().includes(modelName.toLowerCase())) continue;
    for (const field of statusFields) {
      const patterns = [
        new RegExp(`data:\\s*\\{[^}]*?${field}\\s*:\\s*['"]?(\\w+)['"]?`, 'g'),
        new RegExp(`${field}\\s*:\\s*['"]?(\\w+)['"]?`, 'g'),
      ];
      for (const pat of patterns) {
        let m: RegExpExecArray | null;
        while ((m = pat.exec(sourceFile.content)) !== null) {
          const to = m[1];
          const existing = transitions.get(field) ?? [];
          if (!existing.some((t) => t.to === to && t.sourceFile === sourceFile.relativePath)) {
            existing.push({
              from: null,
              to,
              operation: 'update',
              sourceFile: sourceFile.relativePath,
            });
            transitions.set(field, existing);
          }
        }
      }
    }
  }
  return transitions;
}

export function getStatusFieldEnums(
  modelName: string,
  fields: string[],
  schemaContent: string,
  enums: Map<string, string[]>,
): Map<string, { enumName: string; members: string[] }> {
  const result = new Map<string, { enumName: string; members: string[] }>();
  const blockMatch = new RegExp(`model\\s+${modelName}\\s*\\{`, 'g').exec(schemaContent);
  if (!blockMatch) return result;

  const openBraceIdx = schemaContent.indexOf('{', blockMatch.index);
  if (openBraceIdx === -1) return result;
  const block = extractModelBlock(schemaContent, openBraceIdx);

  for (const field of fields) {
    const findTypeInBlock = new RegExp(`^\\s*${field}\\s+(\\w+)`, 'm');
    const typeMatch = findTypeInBlock.exec(block.text);
    if (typeMatch) {
      const typeHint = typeMatch[1];
      const members = enums.get(typeHint);
      if (members !== undefined) {
        result.set(field, { enumName: typeHint, members });
      }
    }
  }

  return result;
}
