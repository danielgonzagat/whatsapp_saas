import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

function shouldSkipFile(filePath: string): boolean {
  return /\.(spec|test|d)\.ts$|__tests__|__mocks__|\/seed\.|\/migration\.|fixture/i.test(filePath);
}

// Matches redis.set('key...) or redis.hset('key...)
const REDIS_SET_RE = /\bredis\s*\.(?:set|hset|setex|mset)\s*\(\s*['"`]([^'"`]+)['"`]/g;

// Matches redis.get('key...) or redis.hget('key...)
const REDIS_GET_RE = /\bredis\s*\.(?:get|hget|mget|lrange|smembers)\s*\(\s*['"`]([^'"`]+)['"`]/g;

// Detects TTL on the same line or nearby
const TTL_SIGNALS_RE = /\bEX\b|\bPX\b|\bexpire\b|\bttl\b|\bEXAT\b|\bsetex\b|\bpexpire\b/i;

/** Check redis keys. */
export function checkRedisKeys(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const dirs = [config.backendDir, config.workerDir].filter(Boolean);
  const allFiles: string[] = [];
  for (const dir of dirs) {
    allFiles.push(...walkFiles(dir, ['.ts']).filter((f) => !shouldSkipFile(f)));
  }

  if (allFiles.length === 0) {
    return breaks;
  }

  // Collect producers and consumers
  const producerKeys = new Set<string>();
  const consumerKeys = new Set<string>();

  for (const file of allFiles) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    // Quick pre-check
    if (!/\bredis\s*\./.test(content)) {
      continue;
    }

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }

      // ---- Check redis.set / hset without TTL ----
      REDIS_SET_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = REDIS_SET_RE.exec(line)) !== null) {
        const key = m[1];
        // Normalize dynamic key patterns (strip template literal vars)
        const normalizedKey = key.replace(/\$\{[^}]+\}/g, '*');
        producerKeys.add(normalizedKey);

        // Check if setex is used (has TTL built in)
        if (/\bredis\s*\.setex\s*\(/.test(line)) {
          continue;
        }

        // Look at current line + next 3 lines for TTL signals
        const window = lines.slice(i, Math.min(i + 4, lines.length)).join('\n');

        if (!TTL_SIGNALS_RE.test(window)) {
          breaks.push({
            type: 'REDIS_NO_TTL',
            severity: 'medium',
            file: relFile,
            line: i + 1,
            description: `Redis key '${normalizedKey}' set without TTL expiry`,
            detail: `${trimmed.slice(0, 120)} — add EX/PX option or call redis.expire() to prevent unbounded cache growth.`,
          });
        }
      }

      // ---- Collect consumers ----
      REDIS_GET_RE.lastIndex = 0;
      while ((m = REDIS_GET_RE.exec(line)) !== null) {
        const key = m[1];
        const normalizedKey = key.replace(/\$\{[^}]+\}/g, '*');
        consumerKeys.add(normalizedKey);
      }
    }
  }

  return breaks;
}
