import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

function shouldSkipFile(filePath: string): boolean {
  return /\.(spec|test)\.(ts|tsx)$|__tests__|__mocks__|node_modules|\.next[/\\]/i.test(filePath);
}

// Matches .toLocaleDateString() or .toLocaleString() with NO arguments
// i.e., the closing paren follows immediately (possibly with whitespace)
const DATE_NO_LOCALE_RE = /\.to(?:LocaleDate|Locale|LocaleTime)String\s*\(\s*\)/g;

export function checkLocaleConsistency(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const files = walkFiles(config.frontendDir, ['.tsx', '.ts']).filter(
    f => !shouldSkipFile(f),
  );

  for (const file of files) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    // Quick pre-check
    if (!/\.toLocale(?:Date|Time)?String\s*\(/.test(content)) continue;

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

      DATE_NO_LOCALE_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = DATE_NO_LOCALE_RE.exec(line)) !== null) {
        breaks.push({
          type: 'DATE_NO_LOCALE',
          severity: 'low',
          file: relFile,
          line: i + 1,
          description: 'Date/number formatted without explicit locale argument',
          detail: `${trimmed.slice(0, 120)} — pass a locale string (e.g. 'pt-BR') to ensure consistent formatting across environments.`,
        });
      }
    }
  }

  return breaks;
}
