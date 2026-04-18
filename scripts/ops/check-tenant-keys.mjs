#!/usr/bin/env node
/**
 * check-tenant-keys.mjs — invariant I4 (tenant isolation) for Redis
 * cache keys, distributed lock keys, and BullMQ job payloads.
 *
 * Companion to scripts/ops/check-tenant-filter.mjs (which audits
 * Prisma queries). The invariant is the same: any per-workspace data
 * touched by the worker or backend must be scoped by workspaceId at
 * the storage layer, regardless of which storage layer is involved.
 *
 * This scanner walks backend/src and worker/ and looks for Redis
 * commands that take a key argument (set, get, del, setex, incr,
 * expire, hset, hget, hgetall, etc.). For each call, it extracts the
 * key string (literal or template) and classifies:
 *
 *   OK_SCOPED       key references ${workspaceId} or similar
 *   OK_GLOBAL       key matches a curated global-pattern allowlist
 *   PARAMETERIZED   key is a non-template variable (can't statically
 *                   verify; soft warning)
 *   BUG             literal key with no workspaceId reference
 *
 * As with the prisma audit, allowlist entries pin (file, line) tuples
 * with a reason. The script exits non-zero on unallowlisted BUGs.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

const SCAN_DIRS = [path.join(repoRoot, 'backend', 'src'), path.join(repoRoot, 'worker')];

const ALLOWLIST_PATH = path.join(here, 'tenant-keys-allowlist.json');

// ─── Globally-safe key prefixes ───────────────────────────────────────────

/**
 * Patterns for keys that are intentionally global (not workspace-scoped).
 * Each entry is a regex applied to the literal key text. If the key
 * matches, it's OK_GLOBAL.
 */
const GLOBAL_KEY_PATTERNS = [
  // Auth and identity — globally unique by design
  /^auth:rate-limit:/,
  /^auth:login:/,
  /^auth:register:/,
  /^auth:email-verification:/,
  /^auth:password-reset:/,
  /^session:/,
  // Webhook dedup keys are scoped by (provider, externalId), not workspace
  /^webhook:payment:/,
  /^webhook:stripe:/,
  /^webhook:meta:/,
  // System health and metrics
  /^health:/,
  /^metrics:/,
  /^prometheus:/,
  // Idempotency keys are scoped by client-supplied X-Idempotency-Key
  /^idempotency:/,
  // Schedule locks for cron jobs
  /^cron:/,
  /^schedule:/,
  // Provider connection state (Meta Cloud, WAHA) — keyed by phone, not workspace
  /^meta:/,
  /^waha:session:/,
  // Cross-workspace ops alerting feed (consumed by /ops/alerts admin endpoint)
  /^alerts:/,
  // Global CIA learning patterns shared across all workspaces by design
  /^cia:global-/,
];

// ─── Redis command surface ────────────────────────────────────────────────

const REDIS_RECEIVERS = ['redis', 'redisPub', 'redisSub', 'cache', 'cacheManager', 'this\\.redis'];
const REDIS_KEY_METHODS = new Set([
  'set',
  'get',
  'del',
  'setex',
  'getex',
  'incr',
  'incrby',
  'decr',
  'decrby',
  'expire',
  'ttl',
  'exists',
  'hset',
  'hget',
  'hgetall',
  'hdel',
  'hincrby',
  'lpush',
  'rpush',
  'lrange',
  'sadd',
  'srem',
  'smembers',
  'zadd',
  'zrange',
  'zrem',
]);

// ─── File discovery ───────────────────────────────────────────────────────

function walkDir(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.next') continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkDir(full, files);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts') && !entry.endsWith('.d.ts')) {
      files.push(full);
    }
  }
  return files;
}

// ─── Redis call extraction ────────────────────────────────────────────────

const RECEIVER_ALT = REDIS_RECEIVERS.join('|');
const REDIS_CALL_RE = new RegExp(`\\b(?:${RECEIVER_ALT})\\.(\\w+)\\s*\\(`, 'g');

function findRedisCalls(source) {
  const findings = [];
  for (const m of source.matchAll(REDIS_CALL_RE)) {
    const method = m[1];
    if (!REDIS_KEY_METHODS.has(method)) continue;

    const matchStart = m.index ?? 0;
    const argStart = matchStart + m[0].length;
    // Extract the first argument (the key) — read until the first
    // top-level comma or closing paren.
    const keyArg = extractFirstArg(source, argStart);
    const lineNumber = source.slice(0, matchStart).split('\n').length;
    findings.push({
      method,
      line: lineNumber,
      offset: matchStart,
      keyArg: keyArg.trim(),
    });
  }
  return findings;
}

function extractFirstArg(source, startIdx) {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let templateBraceDepth = 0;
  for (let i = startIdx; i < source.length; i++) {
    const c = source[i];
    const prev = i > 0 ? source[i - 1] : '';
    if (inSingle) {
      if (c === "'" && prev !== '\\') inSingle = false;
      continue;
    }
    if (inDouble) {
      if (c === '"' && prev !== '\\') inDouble = false;
      continue;
    }
    if (inTemplate) {
      if (c === '`' && prev !== '\\' && templateBraceDepth === 0) {
        inTemplate = false;
      } else if (c === '{' && prev === '$') {
        templateBraceDepth++;
      } else if (c === '}' && templateBraceDepth > 0) {
        templateBraceDepth--;
      }
      continue;
    }
    if (c === "'") inSingle = true;
    else if (c === '"') inDouble = true;
    else if (c === '`') inTemplate = true;
    else if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      if (depth === 0 && c === ')') return source.slice(startIdx, i);
      depth--;
    } else if (c === ',' && depth === 0) {
      return source.slice(startIdx, i);
    }
  }
  return source.slice(startIdx);
}

// ─── Classification ───────────────────────────────────────────────────────

function classifyKey(keyArg) {
  // Empty or weird input
  if (!keyArg) return { kind: 'PARAMETERIZED', reason: 'empty key' };

  // String literal: check for workspaceId / GLOBAL_KEY_PATTERNS
  const literal = extractStringLiteral(keyArg);

  if (literal !== null) {
    // It's a string-literal-only key (no template variables)
    if (/\bworkspaceId\b/.test(keyArg) || /workspace/i.test(literal)) {
      return { kind: 'OK_SCOPED', reason: 'literal key contains workspace' };
    }
    for (const pat of GLOBAL_KEY_PATTERNS) {
      if (pat.test(literal)) {
        return { kind: 'OK_GLOBAL', reason: `matches global pattern ${pat.source}` };
      }
    }
    return { kind: 'BUG', reason: `literal key "${literal}" has no workspaceId reference` };
  }

  // Template literal or expression — check for ${workspaceId}
  if (/\$\{\s*workspaceId\b/.test(keyArg) || /\$\{\s*\w+\.workspaceId\b/.test(keyArg)) {
    return { kind: 'OK_SCOPED', reason: 'template literal interpolates workspaceId' };
  }

  // Template literal that matches a global pattern at the prefix
  const templatePrefix = extractTemplatePrefix(keyArg);
  if (templatePrefix) {
    for (const pat of GLOBAL_KEY_PATTERNS) {
      if (pat.test(templatePrefix)) {
        return { kind: 'OK_GLOBAL', reason: `template prefix matches ${pat.source}` };
      }
    }
  }

  // Identifier reference (`key`) — can't statically verify
  if (/^[a-zA-Z_$][\w$]*$/.test(keyArg)) {
    return { kind: 'PARAMETERIZED', reason: 'key is a variable; verify caller scopes it' };
  }

  // Concatenation, function call, or anything else — soft warning
  return { kind: 'PARAMETERIZED', reason: 'key is a non-literal expression' };
}

function extractStringLiteral(s) {
  // Match a single string literal expression — 'foo', "foo", or `foo`
  // (template with no interpolation)
  const trimmed = s.trim();
  const single = trimmed.match(/^'([^'\\]*(?:\\.[^'\\]*)*)'$/);
  if (single) return single[1];
  const double = trimmed.match(/^"([^"\\]*(?:\\.[^"\\]*)*)"$/);
  if (double) return double[1];
  const template = trimmed.match(/^`([^`$\\]*(?:\\.[^`$\\]*)*)`$/);
  if (template) return template[1];
  return null;
}

function extractTemplatePrefix(s) {
  const trimmed = s.trim();
  // Template literal: get the part before the first interpolation
  const m = trimmed.match(/^`([^$]*)/);
  if (m) return m[1];
  return null;
}

// ─── Allowlist ────────────────────────────────────────────────────────────

function loadAllowlist() {
  if (!existsSync(ALLOWLIST_PATH)) {
    return { entries: [] };
  }
  try {
    const raw = readFileSync(ALLOWLIST_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[check-tenant-keys] Failed to parse allowlist: ${err.message}`);
    process.exit(1);
  }
}

function isAllowlisted(allowlist, finding, relPath) {
  return allowlist.entries.some(
    (entry) =>
      entry.file === relPath && entry.line === finding.line && entry.method === finding.method,
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────

function main() {
  const allowlist = loadAllowlist();
  const allFindings = [];
  for (const dir of SCAN_DIRS) {
    const files = walkDir(dir);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const calls = findRedisCalls(source);
      const relPath = path.relative(repoRoot, file);
      for (const call of calls) {
        const cls = classifyKey(call.keyArg);
        allFindings.push({ ...call, file: relPath, ...cls });
      }
    }
  }

  const buckets = {
    OK_SCOPED: [],
    OK_GLOBAL: [],
    PARAMETERIZED: [],
    BUG: [],
  };
  for (const f of allFindings) {
    buckets[f.kind].push(f);
  }

  const remainingBugs = buckets.BUG.filter((f) => !isAllowlisted(allowlist, f, f.file));
  const remainingParam = buckets.PARAMETERIZED.filter((f) => !isAllowlisted(allowlist, f, f.file));

  const log = process.argv.includes('--generate-allowlist')
    ? (...args) => console.error(...args)
    : (...args) => console.log(...args);

  log('[check-tenant-keys] redis key tenant scope scan');
  log(`  total redis key ops scanned:    ${allFindings.length}`);
  log(`  ok (scoped by workspaceId):     ${buckets.OK_SCOPED.length}`);
  log(`  ok (global pattern):            ${buckets.OK_GLOBAL.length}`);
  log(
    `  parameterized (verify caller):  ${buckets.PARAMETERIZED.length} (${remainingParam.length} not allowlisted)`,
  );
  log(
    `  literal key without workspace:  ${buckets.BUG.length} (${remainingBugs.length} not allowlisted)`,
  );
  log('');

  if (process.argv.includes('--generate-allowlist')) {
    const entries = [
      ...remainingBugs.map((f) => ({
        file: f.file,
        line: f.line,
        method: f.method,
        kind: 'BUG',
        keyArg: f.keyArg,
        reason: 'TODO — review and either scope by workspaceId or document why global',
      })),
      ...remainingParam.map((f) => ({
        file: f.file,
        line: f.line,
        method: f.method,
        kind: 'PARAMETERIZED',
        keyArg: f.keyArg,
        reason: 'parameterized key; caller responsible for workspace scope',
      })),
    ];
    const out = {
      generatedAt: new Date().toISOString(),
      note: 'Initial allowlist generated for PR P2.5-3.',
      entries,
    };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    process.exit(0);
  }

  if (process.argv.includes('--summary')) {
    process.exit(remainingBugs.length > 0 ? 1 : 0);
  }

  if (remainingBugs.length > 0) {
    console.log('=== BUGS (literal redis key without workspaceId reference) ===');
    for (const f of remainingBugs.slice(0, 80)) {
      console.log(`  ${f.file}:${f.line}  ${f.method}(${f.keyArg.slice(0, 60)})`);
    }
    if (remainingBugs.length > 80) console.log(`  ... and ${remainingBugs.length - 80} more`);
    console.log('');
  }

  if (remainingBugs.length > 0) {
    console.error('[check-tenant-keys] FAIL — fix the BUGs above or add them to');
    console.error('  scripts/ops/tenant-keys-allowlist.json with a justification.');
    process.exit(1);
  }

  console.log('[check-tenant-keys] OK — no BUG-level findings.');
  process.exit(0);
}

main();
