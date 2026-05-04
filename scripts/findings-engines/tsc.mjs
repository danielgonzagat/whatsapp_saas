#!/usr/bin/env node
/**
 * tsc findings engine — produces normalized Finding[] from TypeScript compiler diagnostics.
 *
 * NOT constitution-locked. Edit freely.
 *
 * Run: node scripts/findings-engines/tsc.mjs
 * Output: EngineReport JSON to stdout.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { buildReport, fingerprint, assertEngineReport } from './_schema.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const TSC_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsc');

const WORKSPACES = [
  { project: 'backend/tsconfig.json', prefix: 'backend/' },
  { project: 'frontend/tsconfig.json', prefix: 'frontend/' },
  { project: 'worker/tsconfig.json', prefix: 'worker/' },
];

/**
 * Regex to parse a single tsc diagnostic line.
 * Matches: path(line,col): error/warning/message TS####: text
 *   Group 1: path
 *   Group 2: line
 *   Group 3: column
 *   Group 4: severity keyword (error, warning, message)
 *   Group 5: TS code
 *   Group 6: message body
 */
const DIAG_RE = /^(.+?)\((\d+),(\d+)\):\s+(error|warning|message)\s+TS(\d+):\s+(.+)$/;

/**
 * Determine category from TS error code.
 * TS 1000-1999 = parser/syntax errors.
 */
function categoryFromCode(tsCode) {
  const n = parseInt(tsCode, 10);
  if (n >= 1000 && n <= 1999) return 'syntax';
  return 'type';
}

/**
 * Determine severity from TS error code and keyword.
 * Syntax errors → always high. TS errors → high. Warnings/messages → medium.
 */
function severityFromKeyword(keyword, tsCode) {
  const n = parseInt(tsCode, 10);
  if (keyword === 'error') {
    return 'high';
  }
  if (n >= 1000 && n <= 1999) {
    return 'high'; // parser error, even if tagged 'message' (rare but defensive)
  }
  return 'medium';
}

/**
 * Normalize a path from tsc output to be repo-relative with forward slashes.
 * Tsc may emit paths relative to the project root (e.g., "src/foo.ts" when run
 * from backend/) or absolute. We prepend the workspace prefix if the path
 * doesn't already start with it.
 */
function normalizePath(rawPath, workspacePrefix) {
  let p = rawPath.trim();
  // Convert backslashes to forward slashes (Windows compat)
  p = p.replace(/\\/g, '/');
  // If absolute, make it relative to REPO_ROOT
  if (path.isAbsolute(p)) {
    p = path.relative(REPO_ROOT, p);
  }
  // Normalize forward slashes again after path.relative (it returns OS-native)
  p = p.replace(/\\/g, '/');
  // If the path doesn't already start with the workspace prefix, prepend it
  if (!p.startsWith(workspacePrefix)) {
    // Avoid double-prefixing: strip leading ./ if present
    if (p.startsWith('./')) {
      p = p.slice(2);
    }
    p = workspacePrefix + p;
  }
  return p;
}

/**
 * Parse a single line of tsc diagnostic output into a Finding, or null.
 */
function parseLine(line, workspacePrefix) {
  const match = line.match(DIAG_RE);
  if (!match) return null;

  const [, rawPath, lineStr, colStr, keyword, tsCode, message] = match;
  const file = normalizePath(rawPath, workspacePrefix);
  const lineNum = parseInt(lineStr, 10);
  const colNum = parseInt(colStr, 10);
  const category = categoryFromCode(tsCode);
  const severity = severityFromKeyword(keyword, tsCode);
  const rule = `TS${tsCode}`;

  const f = {
    file,
    line: lineNum,
    column: colNum,
    category,
    severity,
    engine: 'tsc',
    rule,
    message: message.trim(),
  };

  f.fingerprint = fingerprint(f);
  return f;
}

/**
 * Run tsc for a single workspace and return parsed findings.
 * Returns { findings, error } — error is set only if tsc couldn't execute.
 */
function runTsc({ project, prefix }) {
  const projectPath = path.join(REPO_ROOT, project);
  if (!fs.existsSync(projectPath)) {
    return { findings: [], error: null };
  }

  try {
    const stdout = execSync(`"${TSC_BIN}" --noEmit -p "${projectPath}"`, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
      timeout: 120_000,
    });
    const findings = [];
    const lines = stdout.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      const finding = parseLine(line, prefix);
      if (finding) {
        findings.push(finding);
      }
    }
    return { findings, error: null };
  } catch (err) {
    // tsc exit code 1 = findings found (not a failure)
    // tsc exit code 2 = config/setup error
    if (err.status === 1 && err.stdout) {
      const findings = [];
      const lines = err.stdout.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        const finding = parseLine(line, prefix);
        if (finding) {
          findings.push(finding);
        }
      }
      return { findings, error: null };
    }
    // exit code 2 or other errors = real failure
    const stderr = err.stderr || '';
    const stdout = err.stdout || '';
    return { findings: [], error: (stderr + stdout).trim() || err.message };
  }
}

/**
 * Detect tsc version.
 */
function detectVersion() {
  try {
    const out = execSync(`"${TSC_BIN}" --version`, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return out.trim(); // e.g. "Version 5.9.3"
  } catch {
    // Fallback: try reading from package.json
    try {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(REPO_ROOT, 'node_modules', 'typescript', 'package.json'), 'utf8'),
      );
      return `tsc ${pkg.version}`;
    } catch {
      return 'unknown';
    }
  }
}

// --- Main ---
const startTime = performance.now();
const version = detectVersion();

const allFindings = [];
const errors = [];

for (const ws of WORKSPACES) {
  const { findings, error } = runTsc(ws);
  if (error) {
    errors.push(`${ws.project}: ${error}`);
  }
  allFindings.push(...findings);
}

const endTime = performance.now();
const durationMs = Math.round(endTime - startTime);

let status = 'ok';
let reportError;

if (errors.length > 0 && allFindings.length === 0) {
  status = 'error';
  reportError = errors.join('\n');
} else if (errors.length > 0) {
  status = 'partial';
  reportError = errors.join('\n');
} else if (allFindings.length > 0) {
  // tsc found type errors — that's still "ok" for the engine; it ran correctly
  status = 'ok';
}

const report = buildReport('tsc', version, allFindings, {
  durationMs,
  status,
  ...(reportError ? { error: reportError } : {}),
});

process.stdout.write(JSON.stringify(report) + '\n');

// Self-test convenience: only run validation when NOT being imported
if (process.argv[1] === import.meta.filename) {
  // Validate the report before exit (assertEngineReport throws on violation)
  assertEngineReport(report);
}
