import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

function isTestFile(filePath: string): boolean {
  return /\.(spec|test)\.ts$|__tests__|__mocks__|\/seed\.|fixture/i.test(filePath);
}

function isPulseScript(filePath: string): boolean {
  return filePath.includes('/scripts/pulse/');
}

export function checkConsoleUsage(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // ---- console.log check: backend + worker only (skip tests, skip pulse scripts) ----
  const prodDirs = [config.backendDir, config.workerDir];

  for (const dir of prodDirs) {
    const files = walkFiles(dir, ['.ts']).filter(f => !isTestFile(f) && !isPulseScript(f));

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

        // Skip full-line comments
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

        // Skip if console.log is inside a comment on this line
        const codeBeforeComment = trimmed.split('//')[0];

        if (/console\.log\s*\(/.test(codeBeforeComment)) {
          breaks.push({
            type: 'CONSOLE_IN_PRODUCTION',
            severity: 'low',
            file: relFile,
            line: i + 1,
            description: 'console.log() found in production code — use Logger instead',
            detail: trimmed.slice(0, 120),
          });
        }
      }
    }
  }

  // ---- TODO/FIXME/HACK/XXX: scan all .ts and .tsx files ----
  const allDirs = [config.frontendDir, config.backendDir, config.workerDir];
  const TODO_RE = /\/\/\s*(TODO|FIXME|HACK|XXX)\b/i;

  for (const dir of allDirs) {
    const files = walkFiles(dir, ['.ts', '.tsx']).filter(f => !isPulseScript(f));

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
        const line = lines[i];
        const m = TODO_RE.exec(line);
        if (m) {
          const marker = m[1].toUpperCase();
          breaks.push({
            type: 'UNRESOLVED_TODO',
            severity: 'low',
            file: relFile,
            line: i + 1,
            description: `${marker} comment left unresolved`,
            detail: line.trim().slice(0, 120),
          });
        }
      }
    }
  }

  return breaks;
}
