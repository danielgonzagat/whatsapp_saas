import { safeJoin, safeResolve } from '../safe-path';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { pathExists, readTextFile } from '../safe-fs';

function envFinding(input: {
  predicateKinds: string[];
  severity: Break['severity'];
  file: string;
  line: number;
  description: string;
  detail: string;
}): Break {
  const predicateToken =
    input.predicateKinds
      .map((predicate) => predicate.replace(/[^a-z0-9]+/gi, '-').toLowerCase())
      .filter(Boolean)
      .join('+') || 'environment-observation';

  return {
    type: `diagnostic:env-checker:${predicateToken}`,
    severity: input.severity,
    file: input.file,
    line: input.line,
    description: input.description,
    detail: input.detail,
    source: `syntax-evidence:env-checker;predicates=${input.predicateKinds.join(',')}`,
  };
}

function isEnvChar(char: string | undefined): boolean {
  if (!char) {
    return false;
  }
  return /[A-Z0-9_]/.test(char);
}

function isEnvName(value: string): boolean {
  return value.length > 1 && /^[A-Z_][A-Z0-9_]*$/.test(value);
}

function readEnvNameAt(text: string, start: number): string {
  let cursor = start;
  let name = '';
  while (cursor < text.length && isEnvChar(text[cursor])) {
    name += text[cursor];
    cursor += 1;
  }
  return isEnvName(name) ? name : '';
}

function collectEnvReferences(line: string): string[] {
  const names: string[] = [];
  let cursor = line.indexOf('process.env.');
  while (cursor !== -1) {
    const name = readEnvNameAt(line, cursor + 'process.env.'.length);
    if (name) {
      names.push(name);
    }
    cursor = line.indexOf('process.env.', cursor + 1);
  }

  cursor = line.indexOf('configService.get');
  while (cursor !== -1) {
    const tail = line.slice(cursor);
    const quoteIndex = [...tail].findIndex((char) => char === "'" || char === '"' || char === '`');
    if (quoteIndex >= 0) {
      const quote = tail[quoteIndex];
      const valueStart = cursor + quoteIndex + 1;
      const valueEnd = line.indexOf(quote, valueStart);
      if (valueEnd > valueStart) {
        const candidate = line.slice(valueStart, valueEnd);
        if (isEnvName(candidate)) {
          names.push(candidate);
        }
      }
    }
    cursor = line.indexOf('configService.get', cursor + 1);
  }
  return names;
}

function splitIdentifier(value: string): Set<string> {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .toLowerCase();
  return new Set(spaced.split(/\s+/).filter(Boolean));
}

function hasSecretNameEvidence(value: string): boolean {
  const tokens = splitIdentifier(value);
  return (
    tokens.has('secret') ||
    tokens.has('token') ||
    tokens.has('password') ||
    tokens.has('credential') ||
    tokens.has('private') ||
    (tokens.has('api') && tokens.has('key')) ||
    tokens.has('auth')
  );
}

function hasLongOpaqueLiteral(line: string): boolean {
  let current = '';
  for (const char of line) {
    const isOpaque =
      (char >= 'A' && char <= 'Z') ||
      (char >= 'a' && char <= 'z') ||
      (char >= '0' && char <= '9') ||
      char === '+' ||
      char === '/' ||
      char === '=' ||
      char === '_' ||
      char === '-';
    if (!isOpaque) {
      if (current.length >= 32) {
        return true;
      }
      current = '';
      continue;
    }
    current += char;
  }
  return current.length >= 32;
}

function shouldSkipFile(file: string): boolean {
  const normalized = file.replace(/\\/g, '/').toLowerCase();
  return (
    normalized.includes('node_modules') ||
    normalized.includes('.next') ||
    normalized.includes('/dist/') ||
    normalized.endsWith('.spec.ts') ||
    normalized.endsWith('.test.ts') ||
    normalized.includes('__tests__') ||
    normalized.includes('__mocks__') ||
    normalized.includes('/seed.') ||
    normalized.includes('/migration.') ||
    normalized.includes('fixture')
  );
}

function readEnvExample(rootDir: string): Set<string> {
  const candidates = ['.env.example', '.env.sample', '.env.template'];
  for (const name of candidates) {
    const fullPath = safeJoin(rootDir, name);
    if (pathExists(fullPath)) {
      try {
        const content = readTextFile(fullPath, 'utf8');
        const vars = new Set<string>();
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.includes('=')) {
            continue;
          }
          // Accept both active lines (VARNAME=value) and commented-out lines (# VARNAME=value)
          // Commented vars are valid documentation of optional environment variables.
          const stripped = trimmed.startsWith('#') ? trimmed.replace(/^#+\s*/, '') : trimmed;
          // Skip section headers like "# === Section ===" (no var-style content)
          const varName = stripped.split('=')[0].trim();
          // A valid env var name: uppercase letters, digits, underscores, starts with letter/underscore
          if (varName && /^[A-Za-z_][A-Za-z0-9_]*$/.test(varName)) {
            vars.add(varName);
          }
        }
        return vars;
      } catch {
        return new Set();
      }
    }
  }
  return new Set();
}

/** Check env vars. */
export function checkEnvVars(config: PulseConfig): Break[] {
  const breaks: Break[] = [];
  const documentedVars = readEnvExample(config.rootDir);

  const referencedVars = new Map<string, { file: string; line: number }>();

  const scanDirs = [config.backendDir, config.workerDir];

  for (const dir of scanDirs) {
    const files = walkFiles(dir, ['.ts']);

    for (const file of files) {
      if (shouldSkipFile(file)) {
        continue;
      }

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

        for (const varName of collectEnvReferences(line)) {
          if (!referencedVars.has(varName)) {
            referencedVars.set(varName, { file: relFile, line: i + 1 });
          }
        }

        if (hasSecretNameEvidence(line) && hasLongOpaqueLiteral(line)) {
          breaks.push(
            envFinding({
              predicateKinds: ['opaque_literal', 'secret_name_evidence'],
              severity: 'critical',
              file: relFile,
              line: i + 1,
              description: 'Opaque secret-like literal observed in source',
              detail: trimmed.slice(0, 120),
            }),
          );
        }
      }
    }
  }

  for (const [varName, location] of referencedVars.entries()) {
    if (!documentedVars.has(varName)) {
      breaks.push(
        envFinding({
          predicateKinds: ['environment_reference', 'documentation_not_observed'],
          severity: hasSecretNameEvidence(varName) ? 'high' : 'medium',
          file: location.file,
          line: location.line,
          description: `Environment variable ${varName} is referenced but not documented in discovered env template evidence`,
          detail: `Add discovered documentation evidence for ${varName} or prove it is provided by runtime baseline.`,
        }),
      );
    }
  }

  return breaks;
}
