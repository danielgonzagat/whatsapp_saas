import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

type NextJSPredicateKind =
  | 'browser-global-access'
  | 'client-render-boundary-missing'
  | 'file-upload-input'
  | 'image-literal-element'
  | 'missing-observed-validation'
  | 'optimization-bypass-evidence'
  | 'ssr-execution-surface';

interface NextJSFindingInput {
  readonly predicateKinds: readonly NextJSPredicateKind[];
  readonly severity: Break['severity'];
  readonly file: string;
  readonly line: number;
  readonly description: string;
  readonly detail: string;
}

function isTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  return (
    normalized.includes('.spec.') ||
    normalized.includes('.test.') ||
    normalized.includes('__tests__') ||
    normalized.includes('__mocks__') ||
    normalized.includes('fixture')
  );
}

function nextJSFinding(input: NextJSFindingInput): Break {
  const predicateId = input.predicateKinds.join('+');
  return {
    type: `diagnostic:nextjs-checker:${predicateId}`,
    severity: input.severity,
    file: input.file,
    line: input.line,
    description: input.description,
    detail: input.detail,
    source: `syntax-evidence:nextjs-checker;predicates=${predicateId}`,
  };
}

function isWordCharacter(ch: string | undefined): boolean {
  return (
    ch !== undefined &&
    ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch === '_')
  );
}

function findLiteralImgStarts(line: string): number[] {
  const matches: number[] = [];
  let cursor = 0;
  while (cursor < line.length) {
    const index = line.indexOf('<img', cursor);
    if (index === -1) {
      break;
    }
    const next = line[index + '<img'.length];
    if (next === undefined || next === '>' || /\s/.test(next)) {
      matches.push(index);
    }
    cursor = index + '<img'.length;
  }
  return matches;
}

function findBrowserGlobalAccesses(
  line: string,
): Array<{ name: 'document' | 'window'; index: number }> {
  const matches: Array<{ name: 'document' | 'window'; index: number }> = [];
  for (const name of ['window', 'document'] as const) {
    let cursor = 0;
    const access = `${name}.`;
    while (cursor < line.length) {
      const index = line.indexOf(access, cursor);
      if (index === -1) {
        break;
      }
      const previous = line[index - 1];
      if (!isWordCharacter(previous)) {
        matches.push({ name, index });
      }
      cursor = index + access.length;
    }
  }
  return matches.sort((a, b) => a.index - b.index);
}

function hasUploadFileDecorator(line: string): boolean {
  return line.includes('@UploadedFile') && line.includes('(') && line.includes(')');
}

function hasFileValidationEvidence(methodContext: string): boolean {
  const validationTokens = ['ParseFilePipe', 'MaxFileSizeValidator', 'FileTypeValidator'];
  return validationTokens.some((token) => methodContext.includes(token));
}

// Whether the line is inside a string literal or a comment (very rough heuristic)
function isInStringOrComment(line: string, matchIndex: number): boolean {
  // Check for // comment before match
  const commentIdx = line.indexOf('//');
  if (commentIdx !== -1 && commentIdx < matchIndex) {
    return true;
  }

  // Check for obvious string context: the match is between quotes
  let inStr: string | null = null;
  for (let i = 0; i < matchIndex; i++) {
    const ch = line[i];
    if (inStr) {
      if (ch === inStr && (i === 0 || line[i - 1] !== '\\')) {
        inStr = null;
      }
    } else if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
    }
  }
  return inStr !== null;
}

/**
 * Check whether any of the preceding lines within the enclosing function scope
 * (up to 30 lines), or the current line itself, suggest the window/document
 * access is guarded against SSR.
 */
function hasGuardAbove(lines: string[], idx: number, lookback = 30): boolean {
  // Check same line first (inline guard: typeof window !== 'undefined' && window.x)
  const currentLine = lines[idx] || '';
  if (hasDefinedGuard(currentLine, 'window')) {
    return true;
  }
  if (hasDefinedGuard(currentLine, 'document')) {
    return true;
  }
  if (currentLine.includes('isBrowser')) {
    return true;
  }

  for (let j = Math.max(0, idx - lookback); j < idx; j++) {
    if (hasDefinedGuard(lines[j], 'window')) {
      return true;
    }
    if (hasDefinedGuard(lines[j], 'document')) {
      return true;
    }
    // Also catch `if (typeof window === 'undefined') return` early-exit guards
    if (hasUndefinedEarlyExit(lines[j], 'window')) {
      return true;
    }
    if (hasUndefinedEarlyExit(lines[j], 'document')) {
      return true;
    }
    if (lines[j].includes('useEffect(')) {
      return true;
    }
    if (lines[j].includes('isBrowser')) {
      return true;
    }
  }
  return false;
}

function hasDefinedGuard(line: string, globalName: 'document' | 'window'): boolean {
  return (
    line.includes(`typeof ${globalName} !== 'undefined'`) ||
    line.includes(`typeof ${globalName} !== "undefined"`) ||
    line.includes(`typeof ${globalName} !== \`undefined\``)
  );
}

function hasUndefinedEarlyExit(line: string, globalName: 'document' | 'window'): boolean {
  return (
    line.includes(`typeof ${globalName} === 'undefined'`) ||
    line.includes(`typeof ${globalName} === "undefined"`) ||
    line.includes(`typeof ${globalName} === \`undefined\``)
  );
}

/** Returns true if this line is deeply indented (inside a function/block body). */
function isDeepIndent(line: string): boolean {
  const spaces = line.match(/^(\s*)/)?.[1].length ?? 0;
  // "module scope" is usually 0 or 2 spaces. Anything >= 4 is inside a block.
  return spaces >= 4;
}

/** Check next js patterns. */
export function checkNextJSPatterns(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // ---- <img> instead of Next.js <Image> ----
  const tsxFiles = walkFiles(config.frontendDir, ['.tsx']).filter((f) => !isTestFile(f));

  for (const file of tsxFiles) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comment lines
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }

      for (const matchIndex of findLiteralImgStarts(line)) {
        // Skip if it's inside a string or comment
        if (isInStringOrComment(line, matchIndex)) {
          continue;
        }

        breaks.push(
          nextJSFinding({
            predicateKinds: ['image-literal-element', 'optimization-bypass-evidence'],
            severity: 'medium',
            file: relFile,
            line: i + 1,
            description: '`<img>` used instead of Next.js `<Image>` — missing optimization',
            detail: trimmed.slice(0, 120),
          }),
        );
      }
    }
  }

  // ---- SSR-unsafe window/document access at module scope ----
  // Only flag very conservative cases: module-scope lines (low indentation),
  // not inside a useEffect, not guarded by typeof window !== 'undefined'
  const allFrontendFiles = [
    ...walkFiles(config.frontendDir, ['.tsx']),
    ...walkFiles(config.frontendDir, ['.ts']),
  ].filter((f) => {
    if (isTestFile(f)) {
      return false;
    }
    // Skip app/api routes (they run server-side on purpose)
    if (f.includes('/app/api/')) {
      return false;
    }
    return true;
  });

  for (const file of allFrontendFiles) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }

      for (const browserGlobalAccess of findBrowserGlobalAccesses(line)) {
        if (isInStringOrComment(line, browserGlobalAccess.index)) {
          continue;
        }

        // Only flag if NOT deeply indented (i.e., at module scope or in a shallow function)
        if (isDeepIndent(line)) {
          continue;
        }

        // Skip if guarded by typeof check or useEffect in the preceding lines
        if (hasGuardAbove(lines, i)) {
          continue;
        }

        breaks.push(
          nextJSFinding({
            predicateKinds: [
              'browser-global-access',
              'ssr-execution-surface',
              'client-render-boundary-missing',
            ],
            severity: 'high',
            file: relFile,
            line: i + 1,
            description: `\`${browserGlobalAccess.name}\` accessed at module scope — crashes during SSR`,
            detail: trimmed.slice(0, 120),
          }),
        );
        break; // One break per line is enough
      }
    }
  }

  // ---- @UploadedFile() without validation ----
  const controllerFiles = walkFiles(config.backendDir, ['.ts']).filter(
    (f) => f.endsWith('.controller.ts') && !isTestFile(f),
  );

  for (const file of controllerFiles) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);

    // Find each method that uses @UploadedFile()
    for (let i = 0; i < lines.length; i++) {
      if (!hasUploadFileDecorator(lines[i])) {
        continue;
      }

      // Scan a window of ±20 lines for validation
      const start = Math.max(0, i - 20);
      const end = Math.min(lines.length, i + 20);
      const methodContext = lines.slice(start, end).join('\n');

      if (!hasFileValidationEvidence(methodContext)) {
        breaks.push(
          nextJSFinding({
            predicateKinds: ['file-upload-input', 'missing-observed-validation'],
            severity: 'high',
            file: relFile,
            line: i + 1,
            description:
              '@UploadedFile() used without ParseFilePipe/MaxFileSizeValidator/FileTypeValidator',
            detail: lines[i].trim().slice(0, 120),
          }),
        );
      }
    }
  }

  return breaks;
}
