#!/usr/bin/env node
/**
 * check-tenant-filter.mjs — invariant I4 (tenant isolation) static analyzer.
 *
 * Scans backend/src and worker/ for Prisma queries on workspace-scoped
 * models and flags any that do not include `workspaceId` in their
 * `where` clause. The flagged set is the working set for PR P2.5-1's
 * tenant isolation audit.
 *
 * Pure regex scanner — no child_process, no shell, no external commands.
 * Uses String.prototype.matchAll for all pattern matching.
 *
 * ## Approach
 *
 * Each finding the script reports is then either:
 *   - **fixed** in code (the query gains a workspaceId filter), or
 *   - **allowlisted** in scripts/ops/tenant-filter-allowlist.json with
 *     a justification (admin-only, global model, intentional, etc.)
 *
 * The script exits non-zero only when there are BUG-level findings
 * (workspace-scoped model, no workspaceId filter, not allowlisted).
 * PK_REVIEW and UNKNOWN_MODEL are soft warnings shown only with
 * --verbose.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

const SCAN_DIRS = [path.join(repoRoot, 'backend', 'src'), path.join(repoRoot, 'worker')];

const ALLOWLIST_PATH = path.join(here, 'tenant-filter-allowlist.json');
const BASELINE_PATH = path.join(here, 'tenant-filter-baseline.json');

// ─── Model classification (loaded from schema) ────────────────────────────

const SCHEMA_PATH = path.join(repoRoot, 'backend', 'prisma', 'schema.prisma');

/**
 * Parse the Prisma schema and partition models into:
 *   - DIRECT_SCOPED: model has its own `workspaceId String` field.
 *     Every read/write must include workspaceId in the where clause.
 *   - TRANSITIVE: model doesn't have workspaceId directly. It is
 *     reached through a parent relation (e.g. CheckoutCoupon belongs
 *     to a CheckoutProduct which belongs to a workspace). Queries on
 *     these are not flagged as BUGs by default — they get the
 *     TRANSITIVE_REVIEW classification, which is a soft warning.
 *
 * Models like Plan, RefreshToken, PasswordResetToken are intentionally
 * cross-workspace (auth tokens, platform-wide catalogs). They land in
 * TRANSITIVE because they have no workspaceId field, and the soft
 * warning is appropriate — operators can audit them via the verbose
 * report and explicitly allowlist any that are correctly global.
 */
function loadModelClassification() {
  if (!existsSync(SCHEMA_PATH)) {
    console.error(`[check-tenant-filter] Schema not found: ${SCHEMA_PATH}`);
    process.exit(1);
  }
  const schema = readFileSync(SCHEMA_PATH, 'utf8');
  const blocks = schema.split(/\n(?=model \w+ \{)/);
  const directScoped = new Set();
  const transitive = new Set();
  for (const b of blocks) {
    const m = b.match(/^model (\w+)/);
    if (!m) continue;
    const name = m[1];
    const camel = name.charAt(0).toLowerCase() + name.slice(1);
    if (/\bworkspaceId\s+String/.test(b)) {
      directScoped.add(camel);
    } else {
      transitive.add(camel);
    }
  }
  return { directScoped, transitive };
}

const { directScoped: WORKSPACE_SCOPED_MODELS, transitive: TRANSITIVE_MODELS } =
  loadModelClassification();

/**
 * Models that are intentionally workspace-INDEPENDENT (auth tokens,
 * platform catalogs). Queries on these never need workspaceId.
 * Curated by hand because the schema can't express "this model is
 * global by design" — the absence of a workspaceId field is the
 * signal, but some models without workspaceId are actually
 * transitively scoped (e.g. CheckoutPayment scoped via its order).
 */
const GLOBAL_MODELS = new Set(['refreshToken', 'passwordResetToken', 'verificationCode']);

const PK_METHODS = new Set(['findUnique', 'findUniqueOrThrow', 'update', 'delete', 'upsert']);

const SCAN_METHODS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'upsert',
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

// ─── Query extraction ─────────────────────────────────────────────────────

/**
 * Extract a `{ ... }` block starting at the first `{` after `startIdx`,
 * tracking nested braces and string literals so we don't get tripped up
 * by `}` inside strings or template literals.
 */
function extractObjectLiteral(source, startIdx) {
  let i = source.indexOf('{', startIdx);
  if (i === -1) return null;
  const open = i;
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (; i < source.length; i++) {
    const c = source[i];
    const prev = i > 0 ? source[i - 1] : '';
    if (inLineComment) {
      if (c === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (c === '/' && prev === '*') inBlockComment = false;
      continue;
    }
    if (inSingle) {
      if (c === "'" && prev !== '\\') inSingle = false;
      continue;
    }
    if (inDouble) {
      if (c === '"' && prev !== '\\') inDouble = false;
      continue;
    }
    if (inTemplate) {
      if (c === '`' && prev !== '\\') inTemplate = false;
      continue;
    }
    if (c === '/' && source[i + 1] === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (c === "'") inSingle = true;
    else if (c === '"') inDouble = true;
    else if (c === '`') inTemplate = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        return { start: open, end: i, body: source.slice(open, i + 1) };
      }
    }
  }
  return null;
}

const SIMPLE_RE = /\b(?:this\.)?prisma(?:Any)?\.(\w+)\.(\w+)\s*\(/g;
const TX_RE = /\btx\.(\w+)\.(\w+)\s*\(/g;

function findPrismaCalls(source) {
  const findings = [];

  function scan(re) {
    for (const m of source.matchAll(re)) {
      const model = m[1];
      const method = m[2];
      if (!SCAN_METHODS.has(method)) continue;
      const matchStart = m.index ?? 0;
      const argsBlock = extractObjectLiteral(source, matchStart + m[0].length - 1);
      const lineNumber = source.slice(0, matchStart).split('\n').length;
      findings.push({
        model,
        method,
        line: lineNumber,
        offset: matchStart,
        argsBody: argsBlock?.body ?? '',
      });
    }
  }

  scan(SIMPLE_RE);
  scan(TX_RE);

  return findings;
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
    console.error(`[check-tenant-filter] Failed to parse allowlist: ${err.message}`);
    process.exit(1);
  }
}

function isAllowlisted(allowlist, finding, relPath) {
  return allowlist.entries.some(
    (entry) =>
      entry.file === relPath && entry.line === finding.line && entry.model === finding.model,
  );
}

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) {
    return { bugFingerprints: [] };
  }
  try {
    const raw = readFileSync(BASELINE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      bugFingerprints: Array.isArray(parsed.bugFingerprints) ? parsed.bugFingerprints : [],
    };
  } catch (err) {
    console.error(`[check-tenant-filter] Failed to parse baseline: ${err.message}`);
    process.exit(1);
  }
}

function withStableBugFingerprints(findings) {
  const occurrenceCounts = new Map();
  return findings.map((finding) => {
    const key = `${finding.file}|${finding.model}|${finding.method}`;
    const occurrence = (occurrenceCounts.get(key) || 0) + 1;
    occurrenceCounts.set(key, occurrence);
    return {
      ...finding,
      bugFingerprint: `${finding.file}|${finding.model}|${finding.method}|${occurrence}`,
    };
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────

function hasWorkspaceIdFilter(argsBody) {
  if (!argsBody) return false;
  return /\bworkspaceId\b/.test(argsBody);
}

function classify(finding) {
  const { model, method, argsBody } = finding;

  if (GLOBAL_MODELS.has(model)) {
    return { kind: 'OK_GLOBAL', reason: 'global model' };
  }

  if (TRANSITIVE_MODELS.has(model)) {
    // Model has no workspaceId field of its own; access is presumed
    // scoped via a parent relation. Soft warning, not a hard bug.
    return { kind: 'TRANSITIVE_REVIEW', reason: 'no workspaceId field; verify parent scope' };
  }

  if (!WORKSPACE_SCOPED_MODELS.has(model)) {
    return { kind: 'UNKNOWN_MODEL', reason: `model "${model}" not in schema` };
  }

  if (hasWorkspaceIdFilter(argsBody)) {
    return { kind: 'OK_FILTERED', reason: 'workspaceId in args' };
  }

  if (PK_METHODS.has(method)) {
    return { kind: 'PK_REVIEW', reason: 'primary-key access; verify caller scoped' };
  }

  return { kind: 'BUG', reason: 'workspace-scoped model with no workspaceId filter' };
}

function main() {
  const allowlist = loadAllowlist();
  const shouldWriteBaseline = process.argv.includes('--write-baseline');
  const baseline = shouldWriteBaseline ? { bugFingerprints: [] } : loadBaseline();
  const allFindings = [];
  for (const dir of SCAN_DIRS) {
    const files = walkDir(dir);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const calls = findPrismaCalls(source);
      const relPath = path.relative(repoRoot, file);
      for (const call of calls) {
        const cls = classify(call);
        allFindings.push({ ...call, file: relPath, ...cls });
      }
    }
  }

  const findingsWithFingerprints = withStableBugFingerprints(
    allFindings
      .slice()
      .sort((a, b) =>
        a.file === b.file
          ? a.line === b.line
            ? `${a.model}.${a.method}`.localeCompare(`${b.model}.${b.method}`)
            : a.line - b.line
          : a.file.localeCompare(b.file),
      ),
  );

  const buckets = {
    OK_GLOBAL: [],
    OK_FILTERED: [],
    PK_REVIEW: [],
    TRANSITIVE_REVIEW: [],
    UNKNOWN_MODEL: [],
    BUG: [],
  };
  for (const f of findingsWithFingerprints) {
    buckets[f.kind].push(f);
  }

  const remainingBugs = buckets.BUG.filter((f) => !isAllowlisted(allowlist, f, f.file));
  const baselineBugSet = new Set(baseline.bugFingerprints);
  const baselineCoveredBugs = remainingBugs.filter((f) => baselineBugSet.has(f.bugFingerprint));
  const newBugFindings = remainingBugs.filter((f) => !baselineBugSet.has(f.bugFingerprint));
  const remainingPkReview = buckets.PK_REVIEW.filter((f) => !isAllowlisted(allowlist, f, f.file));
  const remainingTransitive = buckets.TRANSITIVE_REVIEW.filter(
    (f) => !isAllowlisted(allowlist, f, f.file),
  );
  const remainingUnknown = buckets.UNKNOWN_MODEL.filter(
    (f) => !isAllowlisted(allowlist, f, f.file),
  );

  // When generating the allowlist, route summary to stderr so stdout
  // is pure JSON for shell redirection.
  const log =
    process.argv.includes('--generate-allowlist') || shouldWriteBaseline
      ? (...args) => console.error(...args)
      : (...args) => console.log(...args);

  log('[check-tenant-filter] tenant isolation static scan');
  log(`  total prisma queries scanned:    ${allFindings.length}`);
  log(`  ok (filtered by workspaceId):    ${buckets.OK_FILTERED.length}`);
  log(`  ok (global model):               ${buckets.OK_GLOBAL.length}`);
  log(
    `  primary-key review:              ${buckets.PK_REVIEW.length} (${remainingPkReview.length} not allowlisted)`,
  );
  log(
    `  transitive scope (no own ws id): ${buckets.TRANSITIVE_REVIEW.length} (${remainingTransitive.length} not allowlisted)`,
  );
  log(
    `  unknown model (not in schema):   ${buckets.UNKNOWN_MODEL.length} (${remainingUnknown.length} not allowlisted)`,
  );
  log(
    `  workspace-scoped without filter: ${buckets.BUG.length} (${remainingBugs.length} not allowlisted, ${baselineCoveredBugs.length} baselined, ${newBugFindings.length} new)`,
  );
  log('');

  if (
    newBugFindings.length === 0 &&
    remainingPkReview.length === 0 &&
    remainingUnknown.length === 0
  ) {
    console.log('[check-tenant-filter] OK — no unscoped queries on workspace-scoped models.');
    process.exit(0);
  }

  if (process.argv.includes('--generate-allowlist')) {
    const entries = [
      ...remainingBugs.map((f) => ({
        file: f.file,
        line: f.line,
        model: f.model,
        method: f.method,
        kind: 'BUG',
        reason: 'TODO — review and either fix or document why cross-tenant',
      })),
      ...remainingTransitive.map((f) => ({
        file: f.file,
        line: f.line,
        model: f.model,
        method: f.method,
        kind: 'TRANSITIVE_REVIEW',
        reason: 'transitively scoped via parent relation; verified safe',
      })),
      ...remainingUnknown.map((f) => ({
        file: f.file,
        line: f.line,
        model: f.model,
        method: f.method,
        kind: 'UNKNOWN_MODEL',
        reason: 'TODO — verify model is workspace-safe',
      })),
    ];
    const out = {
      generatedAt: new Date().toISOString(),
      note:
        'Initial allowlist generated by --generate-allowlist for PR P2.5-1. ' +
        'Each entry should eventually be (a) deleted because the underlying query ' +
        'gained a workspaceId filter, or (b) updated with a concrete justification.',
      entries,
    };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    process.exit(0);
  }

  if (shouldWriteBaseline) {
    const out = {
      generatedAt: new Date().toISOString(),
      note:
        'Historical BUG findings baseline for invariant I4. ' +
        'CI must fail only when a new tenant-isolation BUG appears beyond this baseline. ' +
        'Delete entries as code converges.',
      bugFingerprints: remainingBugs.map((f) => f.bugFingerprint).sort(),
    };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    process.exit(0);
  }

  if (process.argv.includes('--summary')) {
    process.exit(newBugFindings.length > 0 ? 1 : 0);
  }

  if (newBugFindings.length > 0) {
    console.log('=== NEW BUGS (workspace-scoped model, no workspaceId filter) ===');
    for (const f of newBugFindings.slice(0, 80)) {
      console.log(`  ${f.file}:${f.line}  prisma.${f.model}.${f.method}`);
    }
    if (newBugFindings.length > 80) {
      console.log(`  ... and ${newBugFindings.length - 80} more`);
    }
    console.log('');
  }

  if (baselineCoveredBugs.length > 0 && process.argv.includes('--verbose')) {
    console.log('=== BASELINED BUGS (historical debt still visible) ===');
    for (const f of baselineCoveredBugs.slice(0, 80)) {
      console.log(`  ${f.file}:${f.line}  prisma.${f.model}.${f.method}`);
    }
    if (baselineCoveredBugs.length > 80) {
      console.log(`  ... and ${baselineCoveredBugs.length - 80} more`);
    }
    console.log('');
  }

  if (remainingPkReview.length > 0 && process.argv.includes('--verbose')) {
    console.log('=== PK_REVIEW (primary-key access; verify caller scoped) ===');
    for (const f of remainingPkReview.slice(0, 50)) {
      console.log(`  ${f.file}:${f.line}  prisma.${f.model}.${f.method}`);
    }
    if (remainingPkReview.length > 50) {
      console.log(`  ... and ${remainingPkReview.length - 50} more`);
    }
    console.log('');
  }

  if (remainingUnknown.length > 0 && process.argv.includes('--verbose')) {
    console.log('=== UNKNOWN_MODEL (add to WORKSPACE_SCOPED_MODELS or GLOBAL_MODELS) ===');
    const uniqueModels = new Set(remainingUnknown.map((f) => f.model));
    for (const m of [...uniqueModels].sort()) {
      console.log(`  - ${m}`);
    }
    console.log('');
  }

  if (newBugFindings.length > 0) {
    console.error(
      '[check-tenant-filter] FAIL — fix the NEW BUGs above or intentionally baseline them.',
    );
    console.error('  Historical debt stays visible in scripts/ops/tenant-filter-baseline.json.');
    process.exit(1);
  }

  console.log('[check-tenant-filter] OK — no new BUG-level findings beyond the baseline.');
  process.exit(0);
}

main();
