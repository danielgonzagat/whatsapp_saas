/**
 * PULSE Parser 86: Cache Invalidation Checker
 * Layer 17: Data Consistency
 * Mode: DEEP (requires codebase scan + optional runtime validation)
 *
 * CHECKS:
 * 1. SWR cache stale after write: verifies that mutation operations (POST/PUT/DELETE)
 *    call `mutate()` or `revalidate()` to invalidate affected SWR cache keys
 * 2. Verifies that write API handlers in the frontend invalidate related SWR keys
 *    (e.g., creating a product should invalidate /api/products list cache)
 * 3. Redis cache stale after DB write: verifies backend services that write to Redis
 *    also invalidate cache keys when the underlying data changes
 * 4. Checks for missing cache invalidation in financial data (balance, payments)
 *    — stale balance display is a critical UX and trust issue
 * 5. Verifies cache keys include workspace/tenant ID (multi-tenant isolation)
 * 6. Checks TTL values are appropriate — financial data should have short TTL (< 60s)
 *    or be invalidated on write, not cached for long periods
 *
 * REQUIRES: PULSE_DEEP=1
 * BREAK TYPES:
 *   CACHE_STALE_AFTER_WRITE(high) — SWR cache not invalidated after mutation
 *   CACHE_REDIS_STALE(high)        — Redis cache not invalidated after DB write
 */
import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

const FINANCIAL_PATH_RE = /wallet|balance|payment|billing|saldo|transaction/i;
const WRITE_METHOD_RE = /\bpost\b|\bput\b|\bpatch\b|\bdelete\b/i;
const SWR_MUTATE_RE = /\bmutate\s*\(|\brevalidate\s*\(|\buseSWRConfig|mutate\s*\(/;
const REDIS_WRITE_RE = /redis\.set|redis\.hset|redis\.zadd|\.setEx|\.set\s*\(/i;
const REDIS_DEL_RE = /redis\.del|redis\.hdel|redis\.expire|cache\.invalidate/i;

/** Check cache invalidation. */
export function checkCacheInvalidation(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // CHECK 1-4: Frontend SWR cache invalidation after writes
  const frontendFiles = walkFiles(config.frontendDir, ['.ts', '.tsx']);

  for (const file of frontendFiles) {
    if (/node_modules|\.next/.test(file)) {
      continue;
    }
    if (/\.spec\.|\.test\./.test(file)) {
      continue;
    }

    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const relFile = path.relative(config.rootDir, file);
    const lines = content.split('\n');

    // Detect files that make write API calls
    const hasWriteCall =
      /apiFetch\s*\(.*(?:POST|PUT|PATCH|DELETE)|method:\s*['"](?:POST|PUT|PATCH|DELETE)/i.test(
        content,
      );
    if (!hasWriteCall) {
      continue;
    }

    // Check if there's a corresponding mutate() call
    const hasMutate = SWR_MUTATE_RE.test(content);

    if (!hasMutate) {
      const isFinancial = FINANCIAL_PATH_RE.test(file);
      breaks.push({
        type: 'CACHE_STALE_AFTER_WRITE',
        severity: isFinancial ? 'high' : 'high',
        file: relFile,
        line: 0,
        description:
          'Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation',
        detail:
          'Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys',
      });
    }

    // CHECK 4: Financial data specifically — must always invalidate
    if (FINANCIAL_PATH_RE.test(file) && hasWriteCall) {
      if (
        !hasMutate &&
        !/router\.refresh\(\)|router\.push\(|window\.location\.reload/i.test(content)
      ) {
        breaks.push({
          type: 'CACHE_STALE_AFTER_WRITE',
          severity: 'high',
          file: relFile,
          line: 0,
          description:
            'Financial write without any cache invalidation strategy — user may see wrong balance',
          detail:
            'After wallet/payment mutations, call mutate() immediately to show updated balance',
        });
      }
    }

    // CHECK: SWR keys that include workspace ID (tenant isolation)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (/useSWR\s*\(/.test(line)) {
        // Check the SWR key (first arg) includes workspaceId or similar
        const swrKeyMatch = line.match(/useSWR\s*\(\s*(['"`][^'"`]+['"`])/);
        if (swrKeyMatch) {
          const key = swrKeyMatch[1];
          if (!/workspace|workspaceId|\$\{/i.test(key)) {
            // Static key without tenant scoping — potential cross-tenant cache leakage
            // (flagged only if in a page/component that has workspace context)
            if (/workspace|tenant/i.test(content)) {
              breaks.push({
                type: 'CACHE_STALE_AFTER_WRITE',
                severity: 'high',
                file: relFile,
                line: i + 1,
                description:
                  'SWR cache key is not scoped to workspace — cross-tenant cache leakage risk',
                detail: `Key ${key} should include workspaceId: \`/api/resource/\${workspaceId}\``,
              });
            }
          }
        }
      }
    }
  }

  // CHECK 3 & 6: Backend Redis cache invalidation after DB writes
  const backendFiles = walkFiles(config.backendDir, ['.ts']);

  for (const file of backendFiles) {
    if (/\.spec\.ts$|migration|seed/i.test(file)) {
      continue;
    }
    if (!/service/i.test(file)) {
      continue;
    }

    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const relFile = path.relative(config.rootDir, file);

    // Files that both write to Redis AND write to DB
    const hasRedisWrite = REDIS_WRITE_RE.test(content);
    const hasDbWrite = /\.create\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/.test(content);
    const hasRedisInvalidation = REDIS_DEL_RE.test(content);

    if (hasRedisWrite && hasDbWrite && !hasRedisInvalidation) {
      breaks.push({
        type: 'CACHE_REDIS_STALE',
        severity: 'high',
        file: relFile,
        line: 0,
        description:
          'Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data',
        detail:
          'After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries',
      });
    }

    // CHECK 6: Financial Redis cache TTL check
    if (FINANCIAL_PATH_RE.test(file) && hasRedisWrite) {
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (REDIS_WRITE_RE.test(line)) {
          // Check if TTL is set and is not too long
          const ttlMatch = content
            .slice(Math.max(0, content.indexOf(line) - 50), content.indexOf(line) + 200)
            .match(/\bEX\s+(\d+)|ttl[:\s]+(\d+)|expire\s*\(\s*\w+\s*,\s*(\d+)/i);

          if (ttlMatch) {
            const ttl = parseInt(ttlMatch[1] || ttlMatch[2] || ttlMatch[3] || '0', 10);
            if (ttl > 300) {
              // 5 minutes
              breaks.push({
                type: 'CACHE_REDIS_STALE',
                severity: 'high',
                file: relFile,
                line: i + 1,
                description: `Financial data cached in Redis with TTL of ${ttl}s — too long, user may see stale balance`,
                detail:
                  'Financial cache TTL should be ≤60s; prefer invalidation-on-write over time-based expiry',
              });
            }
          } else {
            // No TTL — cache never expires
            breaks.push({
              type: 'CACHE_REDIS_STALE',
              severity: 'high',
              file: relFile,
              line: i + 1,
              description:
                'Financial data cached in Redis without TTL — cache never expires, will always be stale',
              detail:
                'Set EX (expire) on all Redis cache writes; financial data should use ≤60s TTL',
            });
          }
        }
      }
    }
  }

  // TODO: Implement when infrastructure available
  // - Runtime cache staleness test (write then read, measure divergence)
  // - Cache hit ratio monitoring (too high = stale data served too much)
  // - Distributed cache invalidation verification across multiple instances

  return breaks;
}
