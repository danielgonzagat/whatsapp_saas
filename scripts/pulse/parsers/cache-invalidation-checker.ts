/**
 * PULSE Parser 86: Cache Invalidation Checker
 * Layer 17: Data Consistency
 * Mode: DEEP (requires codebase scan + optional runtime validation)
 *
 * CHECKS:
 * 1. SWR cache stale after write: verifies that mutation operations (POST/PUT/DELETE)
 *    call `mutate()` or `revalidate()` to invalidate affected SWR cache keys
 * 2. Verifies that write API handlers in the frontend invalidate related SWR keys
 * 3. Redis cache stale after DB write: verifies backend services that write to Redis
 *    also invalidate cache keys when the underlying data changes
 * 4. Checks for missing cache invalidation in money-like state
 *    — stale balance display is a critical UX and trust issue
 * 5. Verifies cache keys include workspace/tenant ID (multi-tenant isolation)
 * 6. Checks TTL values are appropriate — money-like data should have short TTL (< 60s)
 *    or be invalidated on write, not cached for long periods
 *
 * REQUIRES: PULSE_DEEP=1
 * DIAGNOSTICS:
 *   Emits cache-consistency evidence gaps with predicate metadata. Regex/list
 *   matches are weak sensors, not authority by themselves.
 */
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

type CacheInvalidationTruthMode = 'weak_signal' | 'confirmed_static';

type CacheInvalidationDiagnosticBreak = Break & {
  truthMode: CacheInvalidationTruthMode;
};

interface CacheInvalidationDiagnosticInput {
  predicateKinds: string[];
  severity: Break['severity'];
  file: string;
  line: number;
  description: string;
  detail: string;
  truthMode: CacheInvalidationTruthMode;
}

function buildCacheInvalidationDiagnostic(
  input: CacheInvalidationDiagnosticInput,
): CacheInvalidationDiagnosticBreak {
  const predicateToken = input.predicateKinds
    .map((predicate) => predicate.replace(/[^a-z0-9]+/gi, '-').toLowerCase())
    .filter(Boolean)
    .join('+');

  return {
    type: `diagnostic:cache-invalidation-checker:${predicateToken || 'cache-consistency-observation'}`,
    severity: input.severity,
    file: input.file,
    line: input.line,
    description: input.description,
    detail: input.detail,
    source: `regex-heuristic:cache-invalidation-checker;truthMode=${input.truthMode};predicates=${input.predicateKinds.join(',')}`,
    surface: 'cache-consistency',
    truthMode: input.truthMode,
  };
}

const WRITE_METHOD_RE = /\bpost\b|\bput\b|\bpatch\b|\bdelete\b/i;
const SWR_MUTATE_RE = /\bmutate\s*\(|\brevalidate\s*\(|\buseSWRConfig|mutate\s*\(/;
const REDIS_WRITE_RE =
  /\b(?:this\.)?redis\.(?:set|hset|zadd)\b|\b(?:this\.)?cache\.(?:set|setEx)\b|\.setEx\s*\(/i;
const REDIS_DEL_RE = /redis\.del|redis\.hdel|redis\.expire|cache\.invalidate/i;
const MONEY_STATE_RE =
  /\b(?:amount|amountCents|total|subtotal|price|priceCents|currency|balance|saldo|fee|commission|refund|charge|ledger|transaction)\b/i;

function hasMoneyLikeState(content: string): boolean {
  return MONEY_STATE_RE.test(content);
}

/** Check cache invalidation. */
export function checkCacheInvalidation(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // CHECK 1-4: Frontend SWR cache invalidation after writes
  const frontendFiles = walkFiles(config.frontendDir, ['.ts', '.tsx']);

  for (const file of frontendFiles) {
    if (/node_modules|\.next/.test(file)) {
      continue;
    }
    if (/\/app\/api\//.test(file.replace(/\\/g, '/'))) {
      continue;
    }
    if (/\.spec\.|\.test\./.test(file)) {
      continue;
    }

    let content: string;
    try {
      content = readTextFile(file, 'utf8');
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
    const isSWRSurface = /\buseSWR\b|from\s+['"]swr['"]|\buseSWRConfig\b|\bmutate\s*\(/.test(
      content,
    );
    const hasMoneyState = hasMoneyLikeState(content);
    if (!isSWRSurface && !hasMoneyState) {
      continue;
    }

    // Check if there's a corresponding mutate() call
    const hasMutate = SWR_MUTATE_RE.test(content);

    if (!hasMutate) {
      breaks.push(
        buildCacheInvalidationDiagnostic({
          predicateKinds: ['write_call', 'swr_invalidation_not_observed'],
          severity: 'high',
          file: relFile,
          line: 0,
          description:
            'Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation',
          detail:
            'Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys',
          truthMode: 'weak_signal',
        }),
      );
    }

    // CHECK 4: Money-like state specifically — must always invalidate
    if (hasMoneyState && hasWriteCall) {
      if (
        !hasMutate &&
        !/router\.refresh\(\)|router\.push\(|window\.location\.reload/i.test(content)
      ) {
        breaks.push(
          buildCacheInvalidationDiagnostic({
            predicateKinds: ['money_like_write', 'cache_refresh_not_observed'],
            severity: 'high',
            file: relFile,
            line: 0,
            description:
              'Money-like write missing a cache invalidation strategy — user may see wrong balance or totals',
            detail:
              'After money-like mutations, call mutate() immediately to show updated balance or totals',
            truthMode: 'weak_signal',
          }),
        );
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
              breaks.push(
                buildCacheInvalidationDiagnostic({
                  predicateKinds: ['swr_key', 'workspace_scope_not_observed'],
                  severity: 'high',
                  file: relFile,
                  line: i + 1,
                  description:
                    'SWR cache key is not scoped to workspace — cross-tenant cache leakage risk',
                  detail: `Key ${key} should include workspaceId: \`/api/resource/\${workspaceId}\``,
                  truthMode: 'weak_signal',
                }),
              );
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
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const relFile = path.relative(config.rootDir, file);

    // Files that both write to Redis AND write to DB
    const hasRedisWrite = REDIS_WRITE_RE.test(content);
    const hasDbWrite = /\.create\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/.test(content);
    const hasRedisInvalidation = REDIS_DEL_RE.test(content);

    if (hasRedisWrite && hasDbWrite && !hasRedisInvalidation) {
      breaks.push(
        buildCacheInvalidationDiagnostic({
          predicateKinds: ['redis_write', 'db_write', 'redis_invalidation_not_observed'],
          severity: 'high',
          file: relFile,
          line: 0,
          description:
            'Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data',
          detail:
            'After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries',
          truthMode: 'weak_signal',
        }),
      );
    }

    // CHECK 6: Money-like Redis cache TTL check
    if (hasMoneyLikeState(content) && hasRedisWrite) {
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
              breaks.push(
                buildCacheInvalidationDiagnostic({
                  predicateKinds: ['money_like_redis_write', 'ttl_too_long'],
                  severity: 'high',
                  file: relFile,
                  line: i + 1,
                  description: `Money-like data cached in Redis with TTL of ${ttl}s — too long, user may see stale balances or totals`,
                  detail:
                    'Money-like cache TTL should be ≤60s; prefer invalidation-on-write over time-based expiry',
                  truthMode: 'weak_signal',
                }),
              );
            }
          } else {
            // No TTL — cache never expires
            breaks.push(
              buildCacheInvalidationDiagnostic({
                predicateKinds: ['money_like_redis_write', 'ttl_not_observed'],
                severity: 'high',
                file: relFile,
                line: i + 1,
                description:
                  'Money-like data cached in Redis without TTL — cache never expires, will always be stale',
                detail:
                  'Set EX (expire) on all Redis cache writes; money-like data should use ≤60s TTL',
                truthMode: 'weak_signal',
              }),
            );
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
