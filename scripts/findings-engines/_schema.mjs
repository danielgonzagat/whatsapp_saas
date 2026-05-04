/**
 * Canonical Finding schema for the workspace→Obsidian mirror error surface.
 *
 * Every engine wrapper under scripts/findings-engines/<name>.mjs MUST output
 * a JSON document of shape `EngineReport` to stdout (or to its declared
 * artifact path). The aggregator at scripts/ops/aggregate-findings.mjs reads
 * these and produces FINDINGS_AGGREGATE.json + per-file sidecars.
 *
 * This file is intentionally schema-as-code (JSDoc + validators) instead of
 * .ts to stay in pure Node ESM and avoid extra build steps.
 *
 * NOT constitution-locked. Edit freely as the contract evolves.
 */

/**
 * @typedef {'critical' | 'high' | 'medium' | 'low'} Severity
 *
 * Severity ordering (rendering precedence):
 *   critical (#FF0000) > high (#FF6B00) > medium (#FFC400) > low (#3B82F6)
 *
 * Mapping:
 *   - critical: build break, security exploit, data loss risk
 *   - high:     probable bug, broken contract, perf regression
 *   - medium:   code smell, lint, complexity, dead code
 *   - low:      style, suggestion, doc gap
 */

/**
 * @typedef {(
 *   | 'syntax'
 *   | 'type'
 *   | 'import-broken'
 *   | 'import-unused'
 *   | 'cycle'
 *   | 'dead-code'
 *   | 'lint'
 *   | 'complexity'
 *   | 'security'
 *   | 'performance'
 *   | 'logic'
 *   | 'test-missing'
 *   | 'test-skipped'
 *   | 'architecture'
 *   | 'doc-missing'
 *   | 'config-drift'
 *   | 'dep-cve'
 * )} Category
 */

/**
 * @typedef {object} Finding
 * @property {string} file              Relative path from REPO_ROOT (forward slashes).
 * @property {number=} line             1-indexed line; omit for file-level findings.
 * @property {number=} column           1-indexed column; optional.
 * @property {Category} category        High-level taxonomy (drives #err/<category> tag).
 * @property {Severity} severity        Drives dot color + #err/sev/<severity> tag.
 * @property {string} engine            Producing engine identifier ('tsc', 'eslint', etc).
 * @property {string} rule              Engine-specific rule id (e.g., 'TS2322', 'no-floating-promises').
 * @property {string} message           Human-readable.
 * @property {string} fingerprint       Stable hash for dedup across runs (sha1 of file:line:rule:message).
 * @property {object=} extra            Engine-specific payload (kept for debugging; ignored by aggregator).
 */

/**
 * @typedef {object} EngineReport
 * @property {string} engine                     Engine id (must match Finding.engine).
 * @property {string} version                    Engine binary version (e.g., 'tsc 5.9.3').
 * @property {string} ranAt                      ISO timestamp.
 * @property {number} durationMs                 Wall clock.
 * @property {'ok' | 'partial' | 'error'} status How well the run completed.
 * @property {string=} error                     Set if status === 'error'.
 * @property {Finding[]} findings                The findings.
 */

import crypto from 'node:crypto';

export const SEVERITIES = /** @type {const} */ (['critical', 'high', 'medium', 'low']);

export const CATEGORIES = /** @type {const} */ ([
  'syntax',
  'type',
  'import-broken',
  'import-unused',
  'cycle',
  'dead-code',
  'lint',
  'complexity',
  'security',
  'performance',
  'logic',
  'test-missing',
  'test-skipped',
  'architecture',
  'doc-missing',
  'config-drift',
  'dep-cve',
]);

/**
 * Severity → numeric weight for max() across findings on same file.
 * @type {Record<Severity, number>}
 */
export const SEVERITY_WEIGHT = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Severity → RGB integer (Obsidian colorGroups format).
 * @type {Record<Severity, number>}
 */
export const SEVERITY_COLOR_RGB = {
  critical: 0xff0000, // red
  high: 0xff6b00, // orange
  medium: 0xffc400, // yellow
  low: 0x3b82f6, // blue
};

/**
 * Compute stable fingerprint for a finding.
 * @param {{ file: string; line?: number; rule: string; message: string }} f
 * @returns {string}
 */
export function fingerprint(f) {
  const key = `${f.file}:${f.line ?? 0}:${f.rule}:${f.message}`;
  return crypto.createHash('sha1').update(key).digest('hex').slice(0, 16);
}

/**
 * Validate a Finding object. Throws on first violation.
 * @param {unknown} obj
 * @returns {asserts obj is Finding}
 */
export function assertFinding(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('finding: not an object');
  const f = /** @type {Record<string, unknown>} */ (obj);
  if (typeof f.file !== 'string' || !f.file.length) throw new Error('finding.file: missing');
  if (f.line !== undefined && (typeof f.line !== 'number' || f.line < 1))
    throw new Error('finding.line: invalid');
  if (typeof f.category !== 'string' || !CATEGORIES.includes(/** @type {any} */ (f.category)))
    throw new Error(`finding.category: invalid (${String(f.category)})`);
  if (typeof f.severity !== 'string' || !SEVERITIES.includes(/** @type {any} */ (f.severity)))
    throw new Error(`finding.severity: invalid (${String(f.severity)})`);
  if (typeof f.engine !== 'string' || !f.engine.length) throw new Error('finding.engine: missing');
  if (typeof f.rule !== 'string' || !f.rule.length) throw new Error('finding.rule: missing');
  if (typeof f.message !== 'string' || !f.message.length)
    throw new Error('finding.message: missing');
  if (typeof f.fingerprint !== 'string' || f.fingerprint.length !== 16)
    throw new Error('finding.fingerprint: must be 16-char hex');
}

/**
 * Validate an EngineReport. Throws on first violation.
 * @param {unknown} obj
 * @returns {asserts obj is EngineReport}
 */
export function assertEngineReport(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('report: not an object');
  const r = /** @type {Record<string, unknown>} */ (obj);
  if (typeof r.engine !== 'string') throw new Error('report.engine: missing');
  if (typeof r.version !== 'string') throw new Error('report.version: missing');
  if (typeof r.ranAt !== 'string') throw new Error('report.ranAt: missing');
  if (typeof r.durationMs !== 'number') throw new Error('report.durationMs: missing');
  if (!['ok', 'partial', 'error'].includes(/** @type {string} */ (r.status)))
    throw new Error('report.status: invalid');
  if (!Array.isArray(r.findings)) throw new Error('report.findings: must be array');
  for (const f of r.findings) assertFinding(f);
}

/**
 * Helper to build an EngineReport with sane defaults.
 * @param {string} engine
 * @param {string} version
 * @param {Finding[]} findings
 * @param {{ status?: 'ok' | 'partial' | 'error'; error?: string; durationMs?: number }} [opts]
 * @returns {EngineReport}
 */
export function buildReport(engine, version, findings, opts = {}) {
  return {
    engine,
    version,
    ranAt: new Date().toISOString(),
    durationMs: opts.durationMs ?? 0,
    status: opts.status ?? 'ok',
    ...(opts.error ? { error: opts.error } : {}),
    findings,
  };
}
