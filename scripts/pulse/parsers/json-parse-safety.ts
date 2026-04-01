import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

/**
 * Walk backwards from `lineIdx` up to `maxLines` to find an unclosed `try {`.
 * We track brace depth inversely — if we find `try {` before the depth
 * would close the current scope, we're inside a try block.
 */
function isInsideTryBlock(lines: string[], lineIdx: number): boolean {
  // Simple heuristic: scan backwards up to 10 lines for `try {`
  // If we encounter a closing `}` that matches an opening `{` on the same or
  // higher scope, we've exited the try block. Keep it simple to avoid
  // false negatives: just look for `try {` within 10 lines.
  for (let i = lineIdx; i >= Math.max(0, lineIdx - 10); i--) {
    const t = lines[i].trim();
    if (/\btry\s*\{/.test(t)) return true;
    // If we see a standalone `}` (closing block) before a `try`, we left the scope
    // But be conservative — only stop if we see `} catch` which means this is
    // the catch block of an outer try (we're in catch, not try)
    if (/\}\s*catch\b/.test(t) && i < lineIdx) return false;
  }
  return false;
}

export function checkJsonParseSafety(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const dirs = [config.backendDir, config.workerDir];

  for (const dir of dirs) {
    if (!dir) continue;

    const files = walkFiles(dir, ['.ts']);

    for (const file of files) {
      // Skip test/spec/seed/migration/mock/node_modules files
      if (/\.(test|spec|d)\.ts$|seed|migration|fixture|mock\.|node_modules/i.test(file)) continue;

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
        const trimmed = line.trim();

        // Skip comments
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

        // ── CHECK 1: JSON.parse( without try block ──────────────────────────
        if (/\bJSON\.parse\s*\(/.test(trimmed)) {
          // Skip if it's in a comment (inline)
          if (/\/\/.*JSON\.parse/.test(trimmed) && trimmed.indexOf('//') < trimmed.indexOf('JSON.parse')) continue;

          if (!isInsideTryBlock(lines, i)) {
            breaks.push({
              type: 'JSON_PARSE_UNSAFE',
              severity: 'high',
              file: relFile,
              line: i + 1,
              description: 'JSON.parse() outside try/catch — throws SyntaxError on invalid input',
              detail: trimmed.slice(0, 120),
            });
          }
        }

        // ── CHECK 2: JSON.stringify on request/socket objects ────────────────
        // These objects can have circular references and will throw a TypeError.
        if (/\bJSON\.stringify\s*\(\s*(?:req|request|socket|ws|ctx|context)\b/.test(trimmed)) {
          // Skip if it's in a comment
          if (/\/\/.*JSON\.stringify/.test(trimmed) && trimmed.indexOf('//') < trimmed.indexOf('JSON.stringify')) continue;

          breaks.push({
            type: 'STRINGIFY_CIRCULAR_RISK',
            severity: 'low',
            file: relFile,
            line: i + 1,
            description: 'JSON.stringify() on request/socket object — circular reference risk',
            detail: trimmed.slice(0, 120),
          });
        }
      }
    }
  }

  return breaks;
}
