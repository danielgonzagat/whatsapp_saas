#!/usr/bin/env node
/**
 * scripts/ops/sync-codacy-issues.mjs
 *
 * Pull every Codacy issue for this repo and write a deterministic snapshot to
 * PULSE_CODACY_STATE.json that:
 *   - the nightly workflow can commit, and
 *   - LLM agents without MCP access (e.g. Codex) can read at session start.
 *
 * Contract (see CLAUDE.md / PULSE_CLI_DIRECTIVE.json): every convergence
 * session MUST read PULSE_CODACY_STATE.json first, treat highPriorityBatch as
 * the next 50 issues to resolve, and resolve HIGH > MEDIUM > LOW.
 *
 * API reference discovered live (docs are JS-rendered and not scrapable):
 *   POST https://api.codacy.com/api/v3/analysis/organizations/{provider}/
 *        {org}/repositories/{repo}/issues/search?limit=N&cursor=C
 *   Header: api-token: <token>
 *   Body:   {} (filters live here; empty = everything)
 *   Response: { data: [...], pagination: { cursor, limit, total } }
 *
 * Auth: CODACY_API_TOKEN (CI secret) OR CODACY_ACCOUNT_TOKEN (local) OR
 * CODACY_PROJECT_TOKEN (local). First non-empty wins.
 *
 * Safety:
 *   - Never prints the token.
 *   - Writes to a tmp file then atomically renames, so crashes don't leave
 *     a partial PULSE_CODACY_STATE.json.
 *   - Exits 0 when the sync is skippable (no token) so the nightly workflow
 *     doesn't red when run locally without credentials. Exits non-zero on
 *     real API errors so CI notices.
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const outputPath = path.join(repoRoot, 'PULSE_CODACY_STATE.json');
const tmpOutputPath = `${outputPath}.tmp`;

const API_BASE = 'https://api.codacy.com/api/v3';
const PROVIDER = process.env.CODACY_PROVIDER || 'gh';
const ORGANIZATION = process.env.CODACY_ORGANIZATION || 'danielgonzagat';
const REPOSITORY = process.env.CODACY_REPOSITORY || 'whatsapp_saas';

const PAGE_LIMIT = 1000; // Codacy max per page
const MAX_PAGES = 200; // hard cap ⇒ 200k issues ceiling, defensive
const MAX_RETRIES = 5;
const RETRY_BASE_MS = 750;

// Map Codacy severityLevel → coarse HIGH/MEDIUM/LOW bucket required by the
// user-facing directive. Codacy uses two parallel severity axes depending on
// the underlying tool:
//   - Technical: Error | Warning | Info     (Biome, Lizard, ESLint, ...)
//   - Security:  Critical | High | Medium | Low | Minor  (CodeQL, Trivy, ...)
// We collapse both axes into one HIGH/MEDIUM/LOW bucket. Values observed in
// the live API on 2026-04-13: Error, Warning, Info, High. Additions fall back
// to UNKNOWN so a new level never silently vanishes from the count.
const SEVERITY_BUCKET = {
  Critical: 'HIGH',
  High: 'HIGH',
  Error: 'HIGH',
  Medium: 'MEDIUM',
  Warning: 'MEDIUM',
  Low: 'LOW',
  Info: 'LOW',
  Minor: 'LOW',
};

function pickToken() {
  const candidates = [
    ['CODACY_API_TOKEN', process.env.CODACY_API_TOKEN],
    ['CODACY_PROJECT_TOKEN', process.env.CODACY_PROJECT_TOKEN],
    ['CODACY_ACCOUNT_TOKEN', process.env.CODACY_ACCOUNT_TOKEN],
  ];
  for (const [name, value] of candidates) {
    if (value && value.trim().length > 0) {
      return { name, value: value.trim() };
    }
  }
  return null;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, init) {
  let lastErr;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: retry loop with exponential backoff — each attempt must observe the previous attempt's outcome before deciding to retry
      // nosemgrep: javascript.lang.security.detect-node-ssrf.node-ssrf
      // Safe: `url` is always built from the hardcoded API_BASE ('https://api.codacy.com/api/v3') plus env-var-derived org/repo path segments; never user input.
      const response = await fetch(url, init);
      if (response.status === 429 || response.status >= 500) {
        lastErr = new Error(`Codacy responded ${response.status} on attempt ${attempt + 1}`);
        const retryAfter = Number(response.headers.get('retry-after')) || 0;
        const backoff = Math.max(retryAfter * 1000, RETRY_BASE_MS * 2 ** attempt);
        await sleep(backoff);
        continue;
      }
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(
          `Codacy responded ${response.status} ${response.statusText}: ${body.slice(0, 400)}`,
        );
      }
      return response.json();
    } catch (error) {
      lastErr = error;
      if (attempt === MAX_RETRIES - 1) break;
      await sleep(RETRY_BASE_MS * 2 ** attempt);
    }
  }
  throw lastErr ?? new Error('Codacy request failed for unknown reason');
}

async function fetchRepositorySummary(token) {
  const url = `${API_BASE}/analysis/organizations/${PROVIDER}/${ORGANIZATION}/repositories/${REPOSITORY}`;
  return fetchWithRetry(url, {
    method: 'GET',
    headers: {
      'api-token': token,
      Accept: 'application/json',
    },
  });
}

async function fetchIssuesPage(token, cursor) {
  const qs = new URLSearchParams({ limit: String(PAGE_LIMIT) });
  if (cursor) qs.set('cursor', cursor);
  const url = `${API_BASE}/analysis/organizations/${PROVIDER}/${ORGANIZATION}/repositories/${REPOSITORY}/issues/search?${qs.toString()}`;
  return fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'api-token': token,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
}

function incrementKey(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function mapToSortedObject(map, { limit } = {}) {
  const entries = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  const capped = typeof limit === 'number' ? entries.slice(0, limit) : entries;
  return Object.fromEntries(capped);
}

function truncatedMessage(value) {
  return typeof value === 'string' ? value.slice(0, 280) : null;
}

function samplePatternMeta(patternInfo) {
  return {
    patternId: patternInfo?.id ?? null,
    category: patternInfo?.category ?? null,
    severityLevel: patternInfo?.severityLevel ?? null,
  };
}

function sampleCommitMeta(commitInfo) {
  return {
    commitSha: commitInfo?.sha ?? null,
    commitTimestamp: commitInfo?.timestamp ?? null,
  };
}

function toHighPrioritySample(issue) {
  return {
    issueId: issue.issueId,
    filePath: issue.filePath,
    lineNumber: issue.lineNumber,
    ...samplePatternMeta(issue.patternInfo),
    tool: issue.toolInfo?.name ?? null,
    message: truncatedMessage(issue.message),
    ...sampleCommitMeta(issue.commitInfo),
  };
}

async function syncCodacyIssues() {
  const token = pickToken();
  if (!token) {
    console.warn(
      '[codacy-sync] No CODACY_API_TOKEN / CODACY_PROJECT_TOKEN / CODACY_ACCOUNT_TOKEN in env — skipping.',
    );
    console.warn('[codacy-sync] PULSE_CODACY_STATE.json left untouched.');
    return { skipped: true };
  }

  console.log(`[codacy-sync] Using token from ${token.name} (value hidden).`);
  console.log(`[codacy-sync] Target: ${PROVIDER}/${ORGANIZATION}/${REPOSITORY} via ${API_BASE}`);

  const startedAt = Date.now();
  const summary = await fetchRepositorySummary(token.value);
  const summaryData = summary?.data ?? {};

  const bySeverityRaw = new Map();
  const bySeverityBucket = new Map([
    ['HIGH', 0],
    ['MEDIUM', 0],
    ['LOW', 0],
    ['UNKNOWN', 0],
  ]);
  const byCategory = new Map();
  const byPatternId = new Map();
  const byTool = new Map();
  const byFile = new Map();
  const highSeverityIssues = [];
  // Codacy's cursor-based pagination is not perfectly stable under concurrent
  // analysis (observed drift of ~9% on repeated runs). Dedup by issueId to
  // guarantee we count each issue exactly once regardless of cursor hiccups.
  const seenIssueIds = new Set();
  let duplicateCount = 0;

  let cursor = '';
  let totalFromApi = null;
  let pages = 0;
  let seen = 0;

  while (pages < MAX_PAGES) {
    // biome-ignore lint/performance/noAwaitInLoops: cursor pagination depends on the previous page's cursor, parallelism impossible
    const page = await fetchIssuesPage(token.value, cursor);
    pages += 1;
    const rows = Array.isArray(page?.data) ? page.data : [];
    const pagination = page?.pagination ?? {};
    if (totalFromApi === null && typeof pagination.total === 'number') {
      totalFromApi = pagination.total;
    }
    if (process.env.CODACY_SYNC_DEBUG === '1' || pages <= 2) {
      console.log(
        `[codacy-sync] page=${pages} cursor_in=${JSON.stringify(cursor)} rows=${rows.length} cursor_out=${JSON.stringify(pagination.cursor ?? null)} total=${pagination.total ?? 'n/a'}`,
      );
    }

    for (const issue of rows) {
      const issueId = typeof issue.issueId === 'string' ? issue.issueId : null;
      if (issueId) {
        if (seenIssueIds.has(issueId)) {
          duplicateCount += 1;
          continue;
        }
        seenIssueIds.add(issueId);
      }
      seen += 1;
      const severityRaw = issue.patternInfo?.severityLevel ?? 'Unknown';
      const bucket = SEVERITY_BUCKET[severityRaw] ?? 'UNKNOWN';
      incrementKey(bySeverityRaw, severityRaw);
      bySeverityBucket.set(bucket, (bySeverityBucket.get(bucket) ?? 0) + 1);

      if (issue.patternInfo?.category) {
        incrementKey(byCategory, issue.patternInfo.category);
      }
      if (issue.patternInfo?.id) {
        incrementKey(byPatternId, issue.patternInfo.id);
      }
      if (issue.toolInfo?.name) {
        incrementKey(byTool, issue.toolInfo.name);
      }
      if (typeof issue.filePath === 'string' && issue.filePath.length > 0) {
        incrementKey(byFile, issue.filePath);
      }

      if (bucket === 'HIGH') {
        highSeverityIssues.push(issue);
      }
    }

    const nextCursor = typeof pagination.cursor === 'string' ? pagination.cursor : '';
    if (!nextCursor || nextCursor === cursor || rows.length === 0) {
      cursor = '';
      break;
    }
    cursor = nextCursor;
  }

  if (pages >= MAX_PAGES && cursor !== '') {
    console.warn(`[codacy-sync] Hit MAX_PAGES=${MAX_PAGES}; some issues may be truncated.`);
  }

  // Partial-response guard: Codacy's pagination sometimes terminates early
  // (cursor returns null or an empty page) before all issues have been
  // returned, which produces a snapshot where `seen` is much smaller than
  // `apiTotal`. The bot's nightly hit this in commits bac1fdb2 and fda061fb,
  // committing partial PULSE_CODACY_STATE.json files and corrupting the
  // ratchet floor. Detect the case and either retry once or fail loud rather
  // than silently writing a wrong snapshot.
  if (
    typeof totalFromApi === 'number' &&
    totalFromApi > 0 &&
    seen > 0 &&
    seen < totalFromApi * 0.9
  ) {
    console.warn(
      `[codacy-sync] PARTIAL RESPONSE DETECTED: seen=${seen} apiTotal=${totalFromApi} ` +
        `(${Math.round((seen / totalFromApi) * 100)}%). Refusing to write the truncated snapshot.`,
    );
    console.warn(
      '[codacy-sync] Re-run codacy:sync to retry. Existing PULSE_CODACY_STATE.json was NOT touched.',
    );
    process.exit(3);
  }

  // Oldest HIGH-severity issues first — these are the priority batch.
  highSeverityIssues.sort((a, b) => {
    const ta = Date.parse(a.commitInfo?.timestamp ?? '') || 0;
    const tb = Date.parse(b.commitInfo?.timestamp ?? '') || 0;
    return ta - tb;
  });
  const highPriorityBatch = highSeverityIssues.slice(0, 50).map(toHighPrioritySample);

  const state = {
    version: 1,
    syncedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    source: 'scripts/ops/sync-codacy-issues.mjs',
    target: {
      provider: PROVIDER,
      organization: ORGANIZATION,
      repository: REPOSITORY,
      endpoint: `${API_BASE}/analysis/organizations/${PROVIDER}/${ORGANIZATION}/repositories/${REPOSITORY}/issues/search`,
    },
    repositorySummary: {
      grade: summaryData.grade ?? null,
      gradeLetter: summaryData.gradeLetter ?? null,
      issuesCount: summaryData.issuesCount ?? null,
      issuesPercentage: summaryData.issuesPercentage ?? null,
      loc: summaryData.loc ?? null,
      lastAnalysedCommit: summaryData.lastAnalysedCommit
        ? {
            sha: summaryData.lastAnalysedCommit.sha ?? null,
            authorName: summaryData.lastAnalysedCommit.authorName ?? null,
            endedAnalysis: summaryData.lastAnalysedCommit.endedAnalysis ?? null,
          }
        : null,
    },
    totalIssues: seen,
    totalIssuesFromApi: totalFromApi,
    duplicatePagesSkipped: duplicateCount,
    pagesFetched: pages,
    bySeverity: Object.fromEntries(
      ['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].map((key) => [key, bySeverityBucket.get(key) ?? 0]),
    ),
    bySeverityRaw: mapToSortedObject(bySeverityRaw),
    byCategory: mapToSortedObject(byCategory),
    byPatternId: mapToSortedObject(byPatternId, { limit: 50 }),
    byTool: mapToSortedObject(byTool),
    topFiles: Array.from(byFile.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([file, count]) => ({ file, count })),
    highPriorityBatch,
  };

  writeFileSync(tmpOutputPath, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(tmpOutputPath, outputPath);

  console.log(
    `[codacy-sync] Wrote ${path.relative(repoRoot, outputPath)} — totalIssues=${seen}, apiTotal=${
      totalFromApi ?? 'n/a'
    }, duplicates=${duplicateCount}, HIGH=${state.bySeverity.HIGH}, MEDIUM=${state.bySeverity.MEDIUM}, LOW=${state.bySeverity.LOW}, pages=${pages}, elapsed=${(
      (Date.now() - startedAt) /
      1000
    ).toFixed(1)}s.`,
  );

  return state;
}

async function loadLocalEnvFile() {
  // When run locally outside CI we opportunistically read .env.pulse.local so
  // the developer experience matches the nightly workflow without requiring
  // them to export vars into their shell. This is no-op in CI.
  if (process.env.CI === 'true') return;
  const envPath = path.join(repoRoot, '.env.pulse.local');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

async function main() {
  await loadLocalEnvFile();
  try {
    await syncCodacyIssues();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[codacy-sync] Failed: ${message}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { syncCodacyIssues };
