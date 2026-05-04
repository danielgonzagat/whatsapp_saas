import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

type ConsoleCleanerTruthMode = 'confirmed_static' | 'weak_signal';

interface ConsoleCleanerDiagnosticInput {
  predicateKinds: string[];
  severity: Break['severity'];
  file: string;
  line: number;
  description: string;
  detail: string;
  truthMode: ConsoleCleanerTruthMode;
}

function diagnosticToken(value: string): string {
  let token = '';
  for (const char of value) {
    const lower = char.toLowerCase();
    const isAlphaNumeric = (lower >= 'a' && lower <= 'z') || (lower >= '0' && lower <= '9');
    token += isAlphaNumeric ? lower : '-';
  }
  return token.split('-').filter(Boolean).join('-');
}

function buildConsoleCleanerDiagnostic(input: ConsoleCleanerDiagnosticInput): Break {
  const predicateToken = input.predicateKinds.map(diagnosticToken).filter(Boolean).join('+');
  return {
    type: `diagnostic:console-cleaner:${predicateToken || 'source-observation'}`,
    severity: input.severity,
    file: input.file,
    line: input.line,
    description: input.description,
    detail: input.detail,
    source: `syntax-evidence:console-cleaner;truthMode=${input.truthMode};predicates=${input.predicateKinds.join(',')}`,
    surface: 'source-cleanliness',
  };
}

function isTestFile(filePath: string): boolean {
  const normalized = filePath.replaceAll('\\', '/');
  const lowerPath = normalized.toLowerCase();
  const segments = lowerPath.split('/');
  const fileName = segments[segments.length - 1] ?? '';
  return (
    fileName.endsWith('.spec.ts') ||
    fileName.endsWith('.test.ts') ||
    segments.includes('__tests__') ||
    segments.includes('__mocks__') ||
    fileName.startsWith('seed.') ||
    lowerPath.includes('fixture')
  );
}

function isPulseScript(filePath: string): boolean {
  return filePath.replaceAll('\\', '/').includes('/scripts/pulse/');
}

function fileNameTokens(filePath: string): string[] {
  const base = path.basename(filePath).toLowerCase();
  const tokens: string[] = [];
  let current = '';
  for (const char of base) {
    const isAlphaNumeric = (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9');
    if (isAlphaNumeric) {
      current += char;
      continue;
    }
    if (current) {
      tokens.push(current);
      current = '';
    }
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

function hasToken(tokens: string[], token: string): boolean {
  return tokens.includes(token);
}

function hasStartupEvidence(filePath: string, content: string): boolean {
  const tokens = fileNameTokens(filePath);
  const hasLoggerEvidence =
    hasToken(tokens, 'logger') ||
    content.includes('class Logger') ||
    content.includes('LoggerService');
  const hasBootstrapEvidence =
    content.includes('NestFactory') ||
    content.includes('bootstrap()') ||
    content.includes('app.listen(');
  const hasInfrastructureStartupEvidence =
    (hasToken(tokens, 'redis') ||
      hasToken(tokens, 'queue') ||
      hasToken(tokens, 'db') ||
      hasToken(tokens, 'main')) &&
    (content.includes('process.env') ||
      content.includes('createClient') ||
      content.includes('bootstrap'));
  return hasLoggerEvidence || hasBootstrapEvidence || hasInfrastructureStartupEvidence;
}

function codeBeforeLineComment(line: string): string {
  const commentIndex = line.indexOf('//');
  return commentIndex >= 0 ? line.slice(0, commentIndex) : line;
}

function compactWhitespace(value: string): string {
  let compact = '';
  for (const char of value) {
    if (char !== ' ' && char !== '\t' && char !== '\r' && char !== '\n') {
      compact += char;
    }
  }
  return compact;
}

function hasConsoleLogCall(code: string): boolean {
  return compactWhitespace(code).includes('console.log(');
}

function lineCommentText(line: string): string | null {
  const commentIndex = line.indexOf('//');
  if (commentIndex < 0) {
    return null;
  }
  return line.slice(commentIndex + 2).trimStart();
}

function leadingUppercaseMarker(comment: string): string | null {
  let marker = '';
  for (const char of comment) {
    if (char >= 'A' && char <= 'Z') {
      marker += char;
      continue;
    }
    break;
  }
  if (marker === 'TODO' || marker === 'FIXME' || marker === 'HACK' || marker === 'XXX') {
    return marker;
  }
  return null;
}

function unresolvedWorkMarker(line: string): string | null {
  const comment = lineCommentText(line);
  return comment ? leadingUppercaseMarker(comment) : null;
}

function pushDiagnostic(breaks: Break[], input: ConsoleCleanerDiagnosticInput): void {
  breaks.push(buildConsoleCleanerDiagnostic(input));
}

/** Check console usage. */
export function checkConsoleUsage(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // console.log check: backend only; worker has its own logging mechanism.
  const prodDirs = [config.backendDir];

  for (const dir of prodDirs) {
    const files = walkFiles(dir, ['.ts']).filter((f) => !isTestFile(f) && !isPulseScript(f));

    for (const file of files) {
      let content: string;
      try {
        content = readTextFile(file, 'utf8');
      } catch {
        continue;
      }
      if (hasStartupEvidence(file, content)) {
        continue;
      }

      const lines = content.split('\n');
      const relFile = path.relative(config.rootDir, file);

      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();

        // Skip full-line comments
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          continue;
        }

        if (hasConsoleLogCall(codeBeforeLineComment(trimmed))) {
          // Skip if annotated with PULSE:OK on this line or the line before
          const prevLine = i > 0 ? lines[i - 1].trim() : '';
          if (trimmed.includes('PULSE:OK') || prevLine.includes('PULSE:OK')) {
            continue;
          }

          pushDiagnostic(breaks, {
            predicateKinds: ['console_log_call_in_backend_source', 'logger_not_observed'],
            severity: 'low',
            file: relFile,
            line: i + 1,
            description: 'console.log() found in production code - use Logger instead',
            detail: trimmed.slice(0, 120),
            truthMode: 'confirmed_static',
          });
        }
      }
    }
  }

  // Unresolved work markers: scan all .ts and .tsx files.
  const allDirs = [config.frontendDir, config.backendDir, config.workerDir];

  for (const dir of allDirs) {
    const files = walkFiles(dir, ['.ts', '.tsx']).filter((f) => !isPulseScript(f));

    for (const file of files) {
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
        const marker = unresolvedWorkMarker(line);
        if (marker) {
          pushDiagnostic(breaks, {
            predicateKinds: ['unresolved_work_marker_comment', marker.toLowerCase()],
            severity: 'low',
            file: relFile,
            line: i + 1,
            description: `${marker} comment left unresolved`,
            detail: line.trim().slice(0, 120),
            truthMode: 'confirmed_static',
          });
        }
      }
    }
  }

  return breaks;
}
