#!/usr/bin/env node
/**
 * architecture findings engine — wraps check:architecture and check:architecture:guardrails.
 * NOT constitution-locked. Wrapped scripts ARE constitution-locked and must not be modified.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { buildReport, fingerprint } from './_schema.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname;

// ---------------------------------------------------------------------------
// run a node script, capturing stdout+stderr regardless of exit code
// ---------------------------------------------------------------------------
function runCheck(scriptPath) {
  const start = performance.now();
  const result = spawnSync('node', [scriptPath], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout = (result.stdout || '').trimEnd();
  const stderr = (result.stderr || '').trimEnd();
  const durationMs = Math.round(performance.now() - start);
  return { stdout, stderr, durationMs };
}

// ---------------------------------------------------------------------------
// parsers — each returns { file, line?, rule, message, severity } or null
// ---------------------------------------------------------------------------

// "  - frontend/src/app/page.tsx: 450 lines exceeds 400 for max_new_file_lines"
const SIZE_LINE_RE = /^\s*-\s+(.+?):\s+(\d+)\s+lines\s+exceeds\s+(\d+)\s+for\s+(.+)$/;
function parseSizeViolation(line) {
  const m = SIZE_LINE_RE.exec(line);
  if (!m) return null;
  return {
    file: m[1],
    line: undefined,
    rule: 'oversized-file',
    message: `${m[2]} lines exceeds ${m[3]} for ${m[4]}`,
    severity: 'medium',
  };
}

// "  - frontend/src/components/Foo.tsx:42 -> new @ts-ignore (@ts-ignore)"
const SUPPRESSION_LINE_RE = /^\s*-\s+(.+?):(\d+)\s+->\s+(.+?)\s+\((.+?)\)$/;
function parseSuppressionViolation(line) {
  const m = SUPPRESSION_LINE_RE.exec(line);
  if (!m) return null;
  return {
    file: m[1],
    line: Number(m[2]),
    rule: 'suppression-comment',
    message: `${m[3]} (${m[4]})`,
    severity: 'high',
  };
}

// "- backend/src/whatever.controller.ts nao declara guardas nem marca explicitamente como publico"
const NO_GUARD_RE = /^\s*-\s+(.+?)\s+nao\s+declara\s+guardas/;
function parseNoGuard(line) {
  const m = NO_GUARD_RE.exec(line);
  if (!m) return null;
  return {
    file: m[1],
    line: undefined,
    rule: 'missing-guard',
    message: 'Controller does not declare guards or explicitly mark as public',
    severity: 'high',
  };
}

// "- NextIntlClientProvider aparece em multiplos layouts: frontend/src/app/layout.tsx, ..."
const DUP_PROVIDER_RE = /^\s*-\s+(.+?)\s+aparece\s+em\s+multiplos\s+layouts:\s+(.+)$/;
function parseDuplicateProvider(line) {
  const m = DUP_PROVIDER_RE.exec(line);
  if (!m) return null;
  const provider = m[1];
  const filesPart = m[2];
  const files = [...new Set(filesPart.split(/,\s*/))];
  return files.map((file) => ({
    file,
    line: undefined,
    rule: 'duplicate-provider-in-layouts',
    message: `${provider} appears in multiple layouts`,
    severity: 'medium',
  }));
}

// "- frontend/src/components/File.tsx tem nome muito proximo de componente existente (KnownName)"
const SIMILAR_NAME_RE =
  /^\s*-\s+(.+?)\s+tem\s+nome\s+muito\s+proximo\s+de\s+componente\s+existente/;
function parseSimilarName(line) {
  const m = SIMILAR_NAME_RE.exec(line);
  if (!m) return null;
  return {
    file: m[1],
    line: undefined,
    rule: 'similar-component-name',
    message: 'Name too close to existing component',
    severity: 'low',
  };
}

const PARSERS = [
  parseSizeViolation,
  parseSuppressionViolation,
  parseNoGuard,
  parseDuplicateProvider,
  parseSimilarName,
];

function parseLine(line) {
  for (const parser of PARSERS) {
    const result = parser(line);
    if (result !== null) return result;
  }
  return null;
}

function isBannerLine(line) {
  return /^\[(?:architecture|check-architecture)\]/.test(line);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

await (async () => {
  const guardrailsScript = `${REPO_ROOT}/scripts/ops/check-architecture-guardrails.mjs`;
  const architectureScript = `${REPO_ROOT}/scripts/ops/check-architecture.mjs`;

  if (!existsSync(guardrailsScript) || !existsSync(architectureScript)) {
    process.stdout.write(
      JSON.stringify(
        buildReport('architecture', 'local-scripts', [], {
          durationMs: 0,
          status: 'error',
          error: 'One or both wrapped architecture guard scripts are missing from the repo.',
        }),
        null,
        2,
      ),
    );
    process.stdout.write('\n');
    process.exit(0);
  }

  // 1) run both scripts independently
  const guardrailsResult = runCheck(guardrailsScript);
  const architectureResult = runCheck(architectureScript);

  const allOutput = [
    guardrailsResult.stdout,
    guardrailsResult.stderr,
    architectureResult.stdout,
    architectureResult.stderr,
  ].join('\n');

  const totalDurationMs = guardrailsResult.durationMs + architectureResult.durationMs;

  // 2) parse every line
  const lines = allOutput.split('\n');
  const findingsMap = new Map();
  let skippedCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (isBannerLine(trimmed)) continue;

    // Only process lines that look like violation items (start with "-" after optional indent)
    if (!/^\s*-/.test(line)) continue;

    const parsed = parseLine(line);

    if (parsed === null) {
      skippedCount++;
      process.stderr.write(`[architecture-engine] unparsed: ${trimmed.slice(0, 120)}\n`);
      continue;
    }

    // Some parsers return an array (one finding per file), others return a single object
    const results = Array.isArray(parsed) ? parsed : [parsed];

    for (const partial of results) {
      const finding = {
        file: partial.file,
        line: partial.line,
        category: 'architecture',
        severity: partial.severity,
        engine: 'architecture',
        rule: partial.rule,
        message: partial.message,
      };
      const fp = fingerprint(finding);
      if (!findingsMap.has(fp)) {
        findingsMap.set(fp, finding);
      }
    }
  }

  // 3) finalise — add fingerprints to every finding
  const findings = [...findingsMap.values()].map((f) => ({
    ...f,
    fingerprint: fingerprint(f),
  }));

  const status = skippedCount > 0 ? 'partial' : 'ok';

  process.stdout.write(
    JSON.stringify(
      buildReport('architecture', 'local-scripts', findings, {
        durationMs: totalDurationMs,
        status,
      }),
      null,
      2,
    ),
  );

  process.stdout.write('\n');
})();
