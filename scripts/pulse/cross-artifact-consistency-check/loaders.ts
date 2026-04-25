import * as path from 'path';
import * as fs from 'fs';

/** Maximum allowed generatedAt drift in milliseconds (5 minutes). */
export const MAX_GENERATED_AT_DRIFT_MS = 5 * 60 * 1000;

/**
 * Resolves the repo root by searching upward from __dirname for package.json.
 */
function resolveRepoRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(__dirname, '..', '..', '..');
}

export const REPO_ROOT = resolveRepoRoot();

/**
 * Resolves `p` to an absolute path and asserts it lives inside `REPO_ROOT`.
 *
 * Guards against path-traversal where a caller-supplied artifact path tries
 * to escape the repository via `..` segments or absolute path injection.
 *
 * @throws Error when the resolved path escapes the repo root.
 */
function assertPathInsideRepoRoot(p: string): string {
  const resolved = path.resolve(p);
  const normalizedRoot = path.resolve(REPO_ROOT);
  if (resolved !== normalizedRoot && !resolved.startsWith(normalizedRoot + path.sep)) {
    throw new Error(
      `PULSE cross-artifact: path "${p}" resolves outside repo root "${normalizedRoot}"`,
    );
  }
  return resolved;
}

/** Reserved object keys that must never be used to index a record-like value. */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/** Default artifact paths relative to repo root. */
export const DEFAULT_ARTIFACT_PATHS: string[] = [
  'PULSE_CERTIFICATE.json',
  'PULSE_CLI_DIRECTIVE.json',
  'PULSE_ARTIFACT_INDEX.json',
  '.pulse/current/PULSE_AUTONOMY_PROOF.json',
  '.pulse/current/PULSE_AUTONOMY_STATE.json',
  '.pulse/current/PULSE_AGENT_ORCHESTRATION_STATE.json',
  '.pulse/current/PULSE_EXTERNAL_SIGNAL_STATE.json',
  '.pulse/current/PULSE_CONVERGENCE_PLAN.json',
  '.pulse/current/PULSE_PRODUCT_VISION.json',
];

/**
 * Load a single artifact JSON file with an informative error on failure.
 * Returns null when the file is missing or unparseable.
 */
export function loadArtifact(filePath: string): Record<string, unknown> | null {
  const safePath = assertPathInsideRepoRoot(filePath);
  if (!fs.existsSync(safePath)) {
    return null;
  }
  let raw: string;
  try {
    raw = fs.readFileSync(safePath, 'utf8');
  } catch (err) {
    throw new Error(
      `PULSE cross-artifact: cannot read "${filePath}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `PULSE cross-artifact: "${filePath}" is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Safely deep-get a dotted path from an object (e.g. "cycleProof.proven"). */
export function deepGet(obj: Record<string, unknown>, dotPath: string): unknown {
  const parts = dotPath.split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    if (FORBIDDEN_KEYS.has(part)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}
