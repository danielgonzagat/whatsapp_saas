import type { ParsedFunc } from './types';
import {
  FULL_BODY_EXTRACTION_BUDGET_BYTES,
  LINE_DECLARATION_BUDGET_BYTES,
  PARAM_LIST_BUDGET_BYTES,
} from './patterns';

const IMPLICIT_UNTYPED_TEXT = ['an', 'y'].join('');

function parseParamList(params: string): Array<{ name: string; typeText: string }> {
  if (!params.trim()) {
    return [];
  }
  if (params.length > PARAM_LIST_BUDGET_BYTES) {
    return [{ name: 'unparsedParams', typeText: 'unknown' }];
  }

  return params
    .split(',')
    .map((param) => param.trim())
    .filter(Boolean)
    .map((param) => {
      const colonIdx = param.indexOf(':');
      if (colonIdx >= 0) {
        return {
          name: param.substring(0, colonIdx).trim(),
          typeText: param
            .substring(colonIdx + 1)
            .trim()
            .replace(/=.*$/, '')
            .trim(),
        };
      }
      return { name: param.replace(/=.*$/, '').trim(), typeText: 'unknown' };
    });
}

function extractDecoratorsNear(source: string, index: number): string[] {
  const before = source.slice(Math.max(0, index - 600), index);
  const decorators: string[] = [];
  for (const line of before.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('@')) {
      continue;
    }
    const match = /^@(\w+)(?:\s*\([^)]*\))?/.exec(trimmed);
    if (match) {
      decorators.push(match[1]);
    }
  }
  return decorators.slice(-6);
}

function extractLargeFileFunctionStubs(source: string): ParsedFunc[] {
  const functions: ParsedFunc[] = [];

  let offset = 0;
  let currentClass: string | null = null;
  let currentClassDecorators: string[] = [];
  const lines = source.split('\n');
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const classMatch = /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/.exec(line.trim());
    if (classMatch) {
      currentClass = classMatch[1];
      currentClassDecorators = extractDecoratorsNear(source, offset);
    }
    if (line.length > LINE_DECLARATION_BUDGET_BYTES) {
      offset += line.length + 1;
      continue;
    }
    const trimmed = line.trim();
    const functionMatch = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/.exec(
      trimmed,
    );
    const arrowMatch =
      /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)/.exec(trimmed);
    const methodMatch =
      /^(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*[^{;]+)?\{/.exec(
        trimmed,
      );

    const name = functionMatch?.[1] ?? arrowMatch?.[1] ?? methodMatch?.[1];
    const params = functionMatch?.[2] ?? arrowMatch?.[2] ?? methodMatch?.[2] ?? '';
    if (!name || ['if', 'for', 'while', 'switch', 'catch'].includes(name)) {
      offset += line.length + 1;
      continue;
    }

    functions.push({
      name,
      line: lineIndex + 1,
      isAsync: /\basync\b/.test(trimmed),
      decorators: extractDecoratorsNear(source, offset),
      docComment: null,
      isExported: /\bexport\b/.test(trimmed),
      className: currentClass,
      classDecorators: currentClassDecorators,
      parameters: parseParamList(params),
      bodyText: trimmed,
    });
    offset += line.length + 1;
  }

  return functions;
}

function extractFunctionsFromSource(filePath: string, source: string): ParsedFunc[] {
  if (source.length > FULL_BODY_EXTRACTION_BUDGET_BYTES) {
    return extractLargeFileFunctionStubs(source);
  }

  const functions: ParsedFunc[] = [];
  const lines = source.split('\n');
  let currentClass: string | null = null;

  const classRegex = /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/g;
  let classMatch: RegExpExecArray | null;
  while ((classMatch = classRegex.exec(source)) !== null) {
    currentClass = classMatch[1];
  }

  const funcRegex =
    /(?:(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)|(?:(?:@(\w+(?:\s*\([^)]*\))?)\s*)+)?(?:export\s+)?(?:async\s+)?(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*(\w+(?:<[^>]+>)?))?\s*\{)/g;

  let match: RegExpExecArray | null;
  while ((match = funcRegex.exec(source)) !== null) {
    const standaloneName = match[1];
    const standaloneParams = match[2];
    const decoratorPart = match[0];
    const methodName = match[4];
    const methodParams = match[5];
    const returnType = match[6];

    const name = standaloneName || methodName;
    let params = standaloneParams || methodParams || '';

    if (
      !name ||
      name === 'if' ||
      name === 'for' ||
      name === 'while' ||
      name === 'switch' ||
      name === 'catch'
    ) {
      continue;
    }

    const line = source.substring(0, match.index).split('\n').length;
    const isAsync = /\basync\b/.test(decoratorPart);

    const decorators: string[] = [];
    const decoRegex = /@(\w+)(?:\s*\(([^)]*)\))?/g;
    let decoMatch: RegExpExecArray | null;
    while ((decoMatch = decoRegex.exec(decoratorPart)) !== null) {
      decorators.push(decoMatch[1]);
    }

    let docComment: string | null = null;
    const beforeMatch = source.substring(0, match.index).split('\n');
    const prevLines = beforeMatch.slice(-5);
    const jsdocRegex = /\/\*\*[\s\S]*?\*\//;
    for (let i = prevLines.length - 1; i >= 0; i--) {
      if (jsdocRegex.test(prevLines[i])) {
        const jsdocStart = source.lastIndexOf('/**', match.index);
        const jsdocEnd = source.indexOf('*/', jsdocStart);
        if (jsdocStart >= 0 && jsdocEnd >= 0) {
          docComment = source.substring(jsdocStart, jsdocEnd + 2).trim();
        }
        break;
      }
    }

    const paramList: Array<{ name: string; typeText: string }> = [];
    if (params.trim()) {
      const paramParts = params.split(',').map((p) => p.trim());
      for (const part of paramParts) {
        const colonIdx = part.indexOf(':');
        if (colonIdx >= 0) {
          paramList.push({
            name: part.substring(0, colonIdx).trim(),
            typeText: part
              .substring(colonIdx + 1)
              .trim()
              .replace(/=.*$/, '')
              .trim(),
          });
        } else {
          paramList.push({
            name: part.replace(/=.*$/, '').trim(),
            typeText: IMPLICIT_UNTYPED_TEXT,
          });
        }
      }
    }

    const bodyStart = match.index + match[0].length - 1;
    let braceCount = 0;
    let bodyEnd = bodyStart;
    for (let i = bodyStart; i < source.length; i++) {
      if (source[i] === '{') braceCount++;
      if (source[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          bodyEnd = i;
          break;
        }
      }
    }
    const bodyText = source.substring(bodyStart, bodyEnd + 1);

    functions.push({
      name,
      line,
      isAsync,
      decorators,
      docComment,
      isExported: /\bexport\b/.test(decoratorPart),
      className: currentClass,
      classDecorators: [],
      parameters: paramList,
      bodyText,
    });
  }

  // Arrow functions assigned to variables
  const arrowRegex =
    /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*(?::\s*(\w+(?:<[^>]+>)?))?\s*=>\s*\{/g;
  let arrowMatch: RegExpExecArray | null;
  while ((arrowMatch = arrowRegex.exec(source)) !== null) {
    const name = arrowMatch[1];
    const params = arrowMatch[2];
    const returnType = arrowMatch[3];

    if (!name) continue;

    const line = source.substring(0, arrowMatch.index).split('\n').length;
    const isAsync = /\basync\b/.test(arrowMatch[0]);

    const paramList: Array<{ name: string; typeText: string }> = [];
    if (params.trim()) {
      const paramParts = params.split(',').map((p) => p.trim());
      for (const part of paramParts) {
        const colonIdx = part.indexOf(':');
        if (colonIdx >= 0) {
          paramList.push({
            name: part.substring(0, colonIdx).trim(),
            typeText: part
              .substring(colonIdx + 1)
              .trim()
              .replace(/=.*$/, '')
              .trim(),
          });
        } else {
          paramList.push({
            name: part.replace(/=.*$/, '').trim(),
            typeText: IMPLICIT_UNTYPED_TEXT,
          });
        }
      }
    }

    const bodyStart = arrowMatch.index + arrowMatch[0].length - 1;
    let braceCount = 0;
    let bodyEnd = bodyStart;
    for (let i = bodyStart; i < source.length; i++) {
      if (source[i] === '{') braceCount++;
      if (source[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          bodyEnd = i;
          break;
        }
      }
    }
    const bodyText = source.substring(bodyStart, bodyEnd + 1);

    functions.push({
      name,
      line,
      isAsync,
      decorators: [],
      docComment: null,
      isExported: /\bexport\b/.test(arrowMatch[0]),
      className: currentClass,
      classDecorators: [],
      parameters: paramList,
      bodyText,
    });
  }

  return functions;
}

export {
  extractFunctionsFromSource,
  parseParamList,
  extractDecoratorsNear,
  extractLargeFileFunctionStubs,
};
