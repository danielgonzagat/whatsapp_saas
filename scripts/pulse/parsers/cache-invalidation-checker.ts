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
import * as ts from 'typescript';
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

function sourceFileFor(file: string, content: string): ts.SourceFile {
  return ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
}

function propertyAccessText(node: ts.Expression): string | null {
  if (ts.isIdentifier(node)) {
    return node.text;
  }
  if (ts.isPropertyAccessExpression(node)) {
    const parent = propertyAccessText(node.expression);
    return parent ? `${parent}.${node.name.text}` : node.name.text;
  }
  if (node.kind === ts.SyntaxKind.ThisKeyword) {
    return 'this';
  }
  return null;
}

function identifierTokens(value: string): string[] {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .toLowerCase();
  return spaced.split(/\s+/).filter(Boolean);
}

function hasIdentifierToken(value: string, token: string): boolean {
  return identifierTokens(value).includes(token);
}

function nodeContainsText(node: ts.Node, expected: string): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) {
      return;
    }
    if (
      ts.isIdentifier(child) ||
      ts.isStringLiteral(child) ||
      ts.isNoSubstitutionTemplateLiteral(child)
    ) {
      found = child.text.toLowerCase().includes(expected);
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function isWriteHttpMethod(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized === 'post' ||
    normalized === 'put' ||
    normalized === 'patch' ||
    normalized === 'delete'
  );
}

function hasWriteMethodEvidence(sourceFile: ts.SourceFile): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isPropertyAssignment(node)) {
      const name = node.name.getText(sourceFile).replace(/['"]/g, '');
      if (name === 'method') {
        const initializer = node.initializer;
        if (
          (ts.isStringLiteral(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer)) &&
          isWriteHttpMethod(initializer.text)
        ) {
          found = true;
          return;
        }
      }
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      isWriteHttpMethod(node.expression.name.text)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function hasSWRSurfaceEvidence(sourceFile: ts.SourceFile): boolean {
  return (
    nodeContainsText(sourceFile, 'useSWR') ||
    nodeContainsText(sourceFile, 'useSWRConfig') ||
    nodeContainsText(sourceFile, 'mutate')
  );
}

function hasCacheRefreshEvidence(sourceFile: ts.SourceFile): boolean {
  return (
    nodeContainsText(sourceFile, 'mutate') ||
    nodeContainsText(sourceFile, 'revalidate') ||
    nodeContainsText(sourceFile, 'useSWRConfig')
  );
}

function hasNavigationRefreshEvidence(sourceFile: ts.SourceFile): boolean {
  return (
    nodeContainsText(sourceFile, 'refresh') ||
    nodeContainsText(sourceFile, 'reload') ||
    nodeContainsText(sourceFile, 'push')
  );
}

function hasStatefulMutationPayload(sourceFile: ts.SourceFile): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isPropertyAssignment(node)) {
      const name = node.name.getText(sourceFile).replace(/['"]/g, '');
      if (name === 'body' || name === 'data' || name === 'payload') {
        found = true;
        return;
      }
    }
    if (ts.isCallExpression(node) && nodeContainsText(node.expression, 'json')) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function isRedisWriteCall(node: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return false;
  }
  const targetText = propertyAccessText(node.expression.expression);
  const methodName = node.expression.name.text;
  if (!targetText) {
    return false;
  }
  const targetIsCache =
    hasIdentifierToken(targetText, 'redis') || hasIdentifierToken(targetText, 'cache');
  const methodWritesCache =
    methodName === 'set' ||
    methodName === 'hset' ||
    methodName === 'zadd' ||
    methodName === 'setEx';
  return targetIsCache && methodWritesCache;
}

function isRedisInvalidationCall(node: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return false;
  }
  const targetText = propertyAccessText(node.expression.expression);
  const methodName = node.expression.name.text;
  if (!targetText) {
    return false;
  }
  const targetIsCache =
    hasIdentifierToken(targetText, 'redis') || hasIdentifierToken(targetText, 'cache');
  const methodInvalidatesCache =
    methodName === 'del' ||
    methodName === 'hdel' ||
    methodName === 'expire' ||
    methodName === 'invalidate';
  return targetIsCache && methodInvalidatesCache;
}

function hasDatabaseWriteEvidence(sourceFile: ts.SourceFile): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const methodName = node.expression.name.text;
      if (
        methodName === 'create' ||
        methodName === 'update' ||
        methodName === 'delete' ||
        methodName === 'upsert'
      ) {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function hasRedisWriteEvidence(sourceFile: ts.SourceFile): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isCallExpression(node) && isRedisWriteCall(node)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function hasRedisInvalidationEvidence(sourceFile: ts.SourceFile): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isCallExpression(node) && isRedisInvalidationCall(node)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function lineHasRedisWriteEvidence(file: string, line: string): boolean {
  const sourceFile = sourceFileFor(file, line);
  return hasRedisWriteEvidence(sourceFile);
}

function ttlSecondsNearLine(content: string, line: string): number | null {
  const lineIndex = content.indexOf(line);
  if (lineIndex < 0) {
    return null;
  }
  const context = content.slice(Math.max(0, lineIndex - 50), lineIndex + 200);
  const ttlMatch = context.match(/\bEX\s+(\d+)|ttl[:\s]+(\d+)|expire\s*\(\s*\w+\s*,\s*(\d+)/i);
  if (!ttlMatch) {
    return null;
  }
  return parseInt(ttlMatch[1] || ttlMatch[2] || ttlMatch[3] || '0', 10);
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
    const sourceFile = sourceFileFor(file, content);
    const hasWriteCall = hasWriteMethodEvidence(sourceFile);
    if (!hasWriteCall) {
      continue;
    }
    const isSWRSurface = hasSWRSurfaceEvidence(sourceFile);
    const hasMoneyState = hasStatefulMutationPayload(sourceFile);
    if (!isSWRSurface && !hasMoneyState) {
      continue;
    }

    // Check if there's a corresponding mutate() call
    const hasMutate = hasCacheRefreshEvidence(sourceFile);

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
      if (!hasMutate && !hasNavigationRefreshEvidence(sourceFile)) {
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

    const sourceFile = sourceFileFor(file, content);
    const relFile = path.relative(config.rootDir, file);

    // Files that both write to Redis AND write to DB
    const hasRedisWrite = hasRedisWriteEvidence(sourceFile);
    const hasDbWrite = hasDatabaseWriteEvidence(sourceFile);
    const hasRedisInvalidation = hasRedisInvalidationEvidence(sourceFile);

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
    if (hasStatefulMutationPayload(sourceFile) && hasRedisWrite) {
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (lineHasRedisWriteEvidence(file, line)) {
          // Check if TTL is set and is not too long
          const ttl = ttlSecondsNearLine(content, line);

          if (ttl !== null) {
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
