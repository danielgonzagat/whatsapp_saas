import { execFileSync } from 'node:child_process';
import { existsSync as nodeExistsSync, readFileSync as nodeReadFileSync } from 'node:fs';
import path from 'node:path';

export const rootDir = toAbsolutePath(
  `${path.dirname(new URL(import.meta.url).pathname)}${path.sep}..${path.sep}..${path.sep}..`,
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
  const resolved = toAbsolutePath(filePath);
  const boundary = rootDir + path.sep;
  if (resolved !== rootDir && !resolved.startsWith(boundary)) {
    throw new Error(`Path traversal detected: ${resolved} is outside repo root`);
  }
  return resolved;
}

/**
 * Read a tracked repo file as UTF-8. All callers construct the path via
 * `path.join(rootDir, <literal>)`, so there is no user-controlled input.
 */
export function readText(filePath) {
  const safePath = assertInRepo(filePath);
  return nodeReadFileSync(safePath, 'utf8');
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
  const absPath = assertInRepo(`${rootDir}${path.sep}${relPath}`);
  check(nodeExistsSync(absPath), title, relPath);
  return absPath;
}

/**
 * Require the file to contain `needle` as a literal substring.
 */
export function requireIncludes(filePath, needle, title) {
  const safePath = assertInRepo(filePath);
  if (!nodeExistsSync(safePath)) {
    check(false, title, `missing ${relative(safePath)}`);
    return;
  }
  const content = readText(safePath);
  check(content.includes(needle), title, `${relative(safePath)} must include "${needle}"`);
}

function loadFileOrReportMissing(filePath, title) {
  const safePath = assertInRepo(filePath);
  if (!nodeExistsSync(safePath)) {
    check(false, title, `missing ${relative(safePath)}`);
    return null;
  }
  return readText(safePath);
}

/**
 * Require the file contents to match `regex`.
 */
export function requireRegex(filePath, regex, title, detail) {
  const content = loadFileOrReportMissing(filePath, title);
  if (content === null) {
    return;
  }
  check(regex.test(content), title, detail || `${relative(filePath)} must match ${regex}`);
}

/**
 * Require the file contents to NOT match `regex`.
 */
export function requireNotRegex(filePath, regex, title, detail) {
  const content = loadFileOrReportMissing(filePath, title);
  if (content === null) {
    return;
  }
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
const REGEX_INPUT_MAX_LEN = 256;

function safeForRegex(value) {
  const str = String(value ?? '');
  return str.length > REGEX_INPUT_MAX_LEN ? str.slice(0, REGEX_INPUT_MAX_LEN) : str;
}

function escapeForRegex(value) {
  return safeForRegex(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildShaPinnedActionRegex(action, majorVersion) {
  return { action: safeForRegex(action), majorVersion: safeForRegex(majorVersion) };
}

function hasShaPinnedAction(content, action, majorVersion) {
  const marker = `${action}@`;
  let offset = content.indexOf(marker);
  while (offset !== -1) {
    const shaStart = offset + marker.length;
    const sha = content.slice(shaStart, shaStart + 40);
    const rest = content.slice(shaStart + 40, shaStart + 80);
    if (/^[0-9a-f]{40}$/.test(sha) && rest.includes(`# ${majorVersion}`)) {
      return true;
    }
    offset = content.indexOf(marker, offset + marker.length);
  }
  return false;
}

export function requireWorkflowAction(filePath, action, majorVersion, title) {
  const content = loadFileOrReportMissing(filePath, title);
  if (content === null) {
    return;
  }
  const literalForm = `${action}@${majorVersion}`;
  const shaPinned = buildShaPinnedActionRegex(action, majorVersion);
  check(
    content.includes(literalForm) ||
      hasShaPinnedAction(content, shaPinned.action, shaPinned.majorVersion),
    title,
    `${relative(filePath)} must use ${action} at ${majorVersion} (literal or SHA-pinned with version comment)`,
  );
}

function toAbsolutePath(input) {
  const normalized = path.normalize(input);
  if (path.isAbsolute(normalized)) {
    return normalized;
  }
  return path.normalize(`${process.cwd()}${path.sep}${normalized}`);
}

/**
 * Convert an ISO-8601 string to the number of days since that timestamp.
 * Returns +Infinity for unparseable strings so callers can treat "missing"
 * as "stale".
 */
export function daysSince(isoString) {
  const parsed = Date.parse(isoString);
  if (!Number.isFinite(parsed)) {
    return Number.POSITIVE_INFINITY;
  }
  return (Date.now() - parsed) / (1000 * 60 * 60 * 24);
}
