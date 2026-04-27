import * as path from 'path';
import { pathExists, readTextFile } from '../safe-fs';
import { assertWithinRoot } from '../lib/safe-path';

/** Maximum allowed generatedAt drift in milliseconds (5 minutes). */
export const MAX_GENERATED_AT_DRIFT_MS = 5 * 60 * 1000;

/**
 * Resolves the repo root by searching upward from __dirname for package.json.
 */
function resolveRepoRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    if (pathExists(path.join(dir, 'package.json'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(__dirname, '..', '..', '..');
}

export const REPO_ROOT = resolveRepoRoot();

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
  // Validate against the trusted repo root before any fs operation. The
  // safe-fs wrappers re-validate against the global allow-list as well, so
  // path-traversal cannot reach the underlying syscall.
  const safePath = assertWithinRoot(filePath, REPO_ROOT);
  if (!pathExists(safePath)) {
    return null;
  }
  let raw: string;
  try {
    raw = readTextFile(safePath, 'utf8');
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

/**
 * Safely deep-get a dotted path from an object (e.g. "cycleProof.proven").
 *
 * Hardened against prototype pollution: forbidden keys (`__proto__`,
 * `constructor`, `prototype`) are rejected, and lookups are gated by
 * `Object.prototype.hasOwnProperty` so inherited properties never leak
 * through the index access inside the loop.
 */
export function deepGet(obj: Record<string, unknown>, dotPath: string): unknown {
  const parts = dotPath.split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    if (FORBIDDEN_KEYS.has(part)) return undefined;
    if (!Object.prototype.hasOwnProperty.call(cur, part)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}
