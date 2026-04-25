import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const rootDir = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
  '..',
  '..',
);

export const failures = [];
export const passes = [];

/**
 * Return `filePath` as a repo-relative path (falls back to '.' if empty).
 */
export function relative(filePath) {
  return path.relative(rootDir, filePath) || '.';
}

/**
 * Assert that `filePath` is inside the repo root to prevent path traversal.
 * Throws if the resolved path escapes the repo boundary.
 */
function assertInRepo(filePath) {
  const resolved = path.resolve(filePath);
  const boundary = rootDir + path.sep;
  if (resolved !== rootDir && !resolved.startsWith(boundary)) {
    throw new Error(`Path traversal detected: ${resolved} is outside repo root`);
  }
}

/**
 * Read a tracked repo file as UTF-8. All callers construct the path via
 * `path.join(rootDir, <literal>)`, so there is no user-controlled input.
 */
export function readText(filePath) {
  assertInRepo(filePath);
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Record a pass/fail outcome for the readiness report.
 */
export function check(ok, title, detail) {
  if (ok) {
    passes.push({ title, detail });
    return;
  }
  failures.push({ title, detail });
}

/**
 * Return true when `relPath` is tracked by git (i.e., would be in
 * a clean repo clone).
 */
export function isTracked(relPath) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', relPath], {
      cwd: rootDir,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Require a file to exist at `relPath`. Returns the absolute path so
 * callers can feed it back into `requireIncludes` / `requireRegex`.
 */
export function requireFile(relPath, title) {
  const absPath = path.resolve(rootDir, relPath);
  assertInRepo(absPath);
  check(fs.existsSync(absPath), title, relPath);
  return absPath;
}

/**
 * Require the file to contain `needle` as a literal substring.
 */
export function requireIncludes(filePath, needle, title) {
  assertInRepo(filePath);
  if (!fs.existsSync(filePath)) {
    check(false, title, `missing ${relative(filePath)}`);
    return;
  }
  const content = readText(filePath);
  check(content.includes(needle), title, `${relative(filePath)} must include "${needle}"`);
}

/**
 * Require the file contents to match `regex`.
 */
export function requireRegex(filePath, regex, title, detail) {
  assertInRepo(filePath);
  if (!fs.existsSync(filePath)) {
    check(false, title, `missing ${relative(filePath)}`);
    return;
  }
  const content = readText(filePath);
  check(regex.test(content), title, detail || `${relative(filePath)} must match ${regex}`);
}

/**
 * Require the file contents to NOT match `regex`.
 */
export function requireNotRegex(filePath, regex, title, detail) {
  assertInRepo(filePath);
  if (!fs.existsSync(filePath)) {
    check(false, title, `missing ${relative(filePath)}`);
    return;
  }
  const content = readText(filePath);
  check(!regex.test(content), title, detail || `${relative(filePath)} must not match ${regex}`);
}

/**
 * Require a workflow file to use a GitHub Action at the given semver-major
 * version. Accepts either the unpinned form (`org/action@vN`) or the
 * SHA-pinned form with a trailing version comment (`org/action@<sha> # vN[.x.y]`).
 *
 * The SHA-pinned form is preferred for supply-chain hardening; this check
 * stays satisfied either way so workflows can pin to SHAs without
 * silently breaking the production-readiness gate.
 */
export function requireWorkflowAction(filePath, action, majorVersion, title) {
  assertInRepo(filePath);
  if (!fs.existsSync(filePath)) {
    check(false, title, `missing ${relative(filePath)}`);
    return;
  }
  const content = readText(filePath);
  const literalForm = `${action}@${majorVersion}`;
  const escapedAction = action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedVersion = majorVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const shaPinned = new RegExp(`${escapedAction}@[0-9a-f]{40}\\s*#\\s*${escapedVersion}(\\.|\\b)`);
  check(
    content.includes(literalForm) || shaPinned.test(content),
    title,
    `${relative(filePath)} must use ${action} at ${majorVersion} (literal or SHA-pinned with version comment)`,
  );
}

/**
 * Convert an ISO-8601 string to the number of days since that timestamp.
 * Returns +Infinity for unparseable strings so callers can treat "missing"
 * as "stale".
 */
export function daysSince(isoString) {
  const parsed = Date.parse(isoString);
  if (!Number.isFinite(parsed)) return Number.POSITIVE_INFINITY;
  return (Date.now() - parsed) / (1000 * 60 * 60 * 24);
}
