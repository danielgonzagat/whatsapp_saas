import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

export function checkMissingAwait(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const dirs = [config.backendDir, config.workerDir].filter(Boolean);

  for (const dir of dirs) {
    const files = walkFiles(dir, ['.ts']).filter(f => {
      if (/\.(spec|test|d)\.ts$/.test(f)) return false;
      if (/node_modules/.test(f)) return false;
      return true;
    });

    for (const file of files) {
      let content: string;
      try {
        content = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }

      const lines = content.split('\n');
      const relFile = path.relative(config.rootDir, file);

      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();

        // Skip comment lines
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

        // Look for .then( calls
        if (!trimmed.includes('.then(')) continue;

        // Skip lines that already chain .catch( on the same line
        if (trimmed.includes('.catch(')) continue;

        // Check the next 3 lines for .catch(
        const nextLines = lines.slice(i + 1, Math.min(i + 4, lines.length));
        const hasCatch = nextLines.some(l => l.includes('.catch('));
        if (hasCatch) continue;

        // Skip common false positives: test matchers, comments, string literals
        if (/['"`].*\.then\(.*['"`]/.test(trimmed)) continue;
        // Skip Promise.resolve().then() — these are utility patterns
        if (/Promise\s*\.\s*resolve\s*\(\s*\)\.then\(/.test(trimmed)) continue;
        // Skip already-awaited expressions: `await something().then(...)`
        if (/\bawait\b/.test(trimmed)) continue;
        // Skip variable assignments where result is captured (float is less likely)
        if (/(?:const|let|var)\s+\w+\s*=\s*\w+.*\.then\(/.test(trimmed)) continue;
        // Skip return statements with .then() — they propagate the promise
        if (/^\s*return\s+/.test(lines[i])) continue;

        breaks.push({
          type: 'FLOATING_PROMISE',
          severity: 'high',
          file: relFile,
          line: i + 1,
          description: '.then() call without .catch() — unhandled promise rejection',
          detail: `${trimmed.slice(0, 120)} — add .catch(err => this.logger.error(err)) or use async/await with try/catch`,
        });
      }
    }
  }

  return breaks;
}
