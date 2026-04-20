import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

function shouldSkipFile(file: string): boolean {
  return (
    /node_modules|\.next[/\\]|[/\\]dist[/\\]|\.(spec|test)\.(ts|tsx|js|jsx)$|__tests__|__mocks__|[/\\]fixture|[/\\]seed\./i.test(
      file,
    ) ||
    // Skip the pulse scripts themselves to avoid self-reporting false positives
    /[/\\]scripts[/\\]pulse[/\\]/i.test(file)
  );
}

/**
 * Determine if a require() call uses a non-literal (variable) argument.
 * require('hardcoded') → false (safe)
 * require(variable) or require(`${something}`) → true (dynamic)
 */
function isDynamicRequire(line: string, matchIndex: number): boolean {
  // Find the opening paren after 'require'
  const afterRequire = line.slice(matchIndex + 'require('.length - 1);
  // Match what's inside the parens
  const innerMatch = afterRequire.match(/\(\s*(['"`]([^'"`]*?)['"`]|\s*)\s*\)/);
  if (!innerMatch) {
    // Could not parse cleanly — check if there's a string literal immediately
    const literalCheck = afterRequire.match(/\(\s*['"`]/);
    return !literalCheck;
  }
  // If the first captured group starts with a quote, it's a literal
  const inner = innerMatch[1]?.trim() ?? '';
  return !(inner.startsWith("'") || inner.startsWith('"') || inner.startsWith('`'));
}

export function checkInjection(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const dirs = [config.frontendDir, config.backendDir, config.workerDir];

  for (const dir of dirs) {
    const files = walkFiles(dir, ['.ts', '.tsx', '.js', '.jsx']);

    for (const file of files) {
      if (shouldSkipFile(file)) {
        continue;
      }

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

        // Skip full-line comments
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          continue;
        }

        // eval( usage — any eval call is dangerous
        if (/\beval\s*\(/.test(line)) {
          breaks.push({
            type: 'EVAL_USAGE',
            severity: 'critical',
            file: relFile,
            line: i + 1,
            description: 'eval() usage detected — code injection risk',
            detail: trimmed.slice(0, 120),
          });
        }

        // new Function( — flag when argument is not obviously a string literal
        // new Function('a', 'b', 'return a+b') → safe (all string literals)
        // new Function(userInput) → dangerous
        const newFunctionMatch = line.match(/\bnew\s+Function\s*\(/);
        if (newFunctionMatch) {
          const afterParen = line
            .slice((newFunctionMatch.index ?? 0) + newFunctionMatch[0].length)
            .trim();
          // If the first char after ( is a quote, it starts with a string literal — treat as lower risk
          // but still flag unless ALL args appear to be string literals
          if (
            !afterParen.startsWith("'") &&
            !afterParen.startsWith('"') &&
            !afterParen.startsWith('`')
          ) {
            breaks.push({
              type: 'EVAL_USAGE',
              severity: 'critical',
              file: relFile,
              line: i + 1,
              description: 'new Function() with non-literal argument — code injection risk',
              detail: trimmed.slice(0, 120),
            });
          }
        }

        // dangerouslySetInnerHTML — only flag if content is NOT sanitized
        if (/dangerouslySetInnerHTML/.test(line)) {
          const isSanitized = /sanitize|DOMPurify|purify|xss\(/i.test(line);
          if (!isSanitized) {
            breaks.push({
              type: 'XSS_DANGEROUS_HTML',
              severity: 'critical',
              file: relFile,
              line: i + 1,
              description: 'dangerouslySetInnerHTML usage — XSS risk if content is not sanitized',
              detail: trimmed.slice(0, 120),
            });
          }
        }

        // require() with dynamic/variable argument
        const requireIdx = line.indexOf('require(');
        if (requireIdx !== -1) {
          // Skip import-style CommonJS at top: const X = require('literal')
          if (isDynamicRequire(line, requireIdx)) {
            breaks.push({
              type: 'DYNAMIC_REQUIRE_RISK',
              severity: 'high',
              file: relFile,
              line: i + 1,
              description: 'require() called with dynamic/variable argument — path injection risk',
              detail: trimmed.slice(0, 120),
            });
          }
        }
      }
    }
  }

  return breaks;
}
