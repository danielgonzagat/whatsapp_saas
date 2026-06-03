#!/usr/bin/env node
/**
 * security-invariants — proof #5 (capability monotonicity) made structural.
 *
 * Measures the atomic engine's OWN security surface as a small set of integer
 * invariants, and enforces that a self-expansion may only ever RATCHET it UP.
 * An expansion that reduces any invariant below its stored high-water baseline
 * is refused (throws), and atomic_expand_self rolls back byte-exact.
 *
 * The invariants are deliberately load-bearing counts of real enforcement:
 *   - writeGates         : entries in WRITE_GATES (gates run at the write byte-floor)
 *   - forbiddenExecLaws  : invariant FORBIDDEN command laws in atomic_exec
 *   - nativeEditBans     : native edit tools banned by the atomic-only hook
 *   - syncByteFloorGates : gates run synchronously at the atomicWrite byte-floor
 *   - byteFloorGuards    : load-bearing guard calls inside atomicWrite
 *
 * Production baseline lives at repo-root .atomic/security-baseline.json. Fixture
 * roots use rootDir/.security-baseline.json so proofs cannot mutate the real repo
 * baseline by accident. Plain --enforce is read-only; --enforce --ratchet is the
 * explicit persistence path for strengthening. The baseline is monotonic by
 * construction: the only write path takes max(stored, current). To lower an
 * invariant on purpose the repo owner edits the baseline down by hand — a
 * deliberate, visible, owner-only act.
 *
 * CLI: `node security-invariants.mjs --enforce`           -> check only, no write
 *      `node security-invariants.mjs --enforce --ratchet` -> check + persist max
 *      `node security-invariants.mjs --measure`           -> print current invariants
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Each invariant measures one load-bearing security quantity over one engine file. */
const INVARIANTS = [
  {
    key: 'writeGates',
    file: 'gates/registry.ts',
    what: 'gates enforced at the write byte-floor (WRITE_GATES entries)',
    measure(src) {
      const m = src.match(/WRITE_GATES[^=]*=\s*\[([\s\S]*?)\n\];/);
      const body = m ? m[1] : '';
      return (body.match(/^\s*[A-Za-z0-9_]+Gate,\s*$/gm) || []).length;
    },
  },
  {
    key: 'forbiddenExecLaws',
    file: 'server-tools-exec.ts',
    what: 'invariant FORBIDDEN command laws in atomic_exec',
    measure(src) {
      const m = src.match(/const FORBIDDEN[^=]*=\s*\[([\s\S]*?)\n\];/);
      const body = m ? m[1] : '';
      return (body.match(/re:\s*\//g) || []).length;
    },
  },
  {
    key: 'nativeEditBans',
    file: 'atomic-only-hook.mjs',
    what: 'native edit tools banned by the atomic-only hook',
    measure(src) {
      const m = src.match(/NATIVE_EDIT\s*=\s*new Set\(\[([^\]]*)\]\)/);
      const body = m ? m[1] : '';
      return (body.match(/'[^']+'/g) || []).length;
    },
  },
  {
    key: 'syncByteFloorGates',
    file: 'server-helpers-io.ts',
    what: 'gates enforced synchronously at the atomicWrite byte-floor (SYNC_WRITE_GATES entries)',
    measure(src) {
      const m = src.match(/SYNC_WRITE_GATES[^=]*=\s*\[([^\]]*)\]/);
      const body = m ? m[1] : '';
      return (body.match(/[A-Za-z0-9_]+Gate/g) || []).length;
    },
  },
  {
    key: 'byteFloorGuards',
    file: 'server-helpers-io.ts',
    what: 'load-bearing guard calls inside atomicWrite',
    measure(src) {
      let n = 0;
      for (const g of [
        'assertSelfExpansionAdmission',
        'checkConnectionByteFloor',
        'checkSupplyChainByteFloor',
        'runSyncWriteGatesAt',
      ]) {
        if (new RegExp('\\b' + g + '\\s*\\(').test(src)) n++;
      }
      return n;
    },
  },
];

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, '..', '..', '..');
const ATOMIC_DIR = path.join(REPO_ROOT, '.atomic');
export const BASELINE_FILE = path.join(ATOMIC_DIR, 'security-baseline.json');
const LEGACY_BASELINE = path.join(here, '.security-baseline.json');
const IS_PRODUCTION_SOURCE =
  path.basename(here) === 'atomic-edit' &&
  path.basename(path.dirname(here)) === 'mcp' &&
  path.basename(path.dirname(path.dirname(here))) === 'scripts';

function baselineFileFor(rootDir) {
  const resolved = path.resolve(rootDir);
  return resolved === here && IS_PRODUCTION_SOURCE ? BASELINE_FILE : path.join(resolved, '.security-baseline.json');
}

export function measureSecurityInvariants(rootDir) {
  const out = {};
  for (const inv of INVARIANTS) {
    let src = '';
    try {
      src = fs.readFileSync(path.join(rootDir, inv.file), 'utf8');
    } catch {
      src = '';
    }
    out[inv.key] = inv.measure(src);
  }
  return out;
}

export function readBaseline(rootDir = here) {
  const primary = baselineFileFor(rootDir);
  const candidates = [primary];
  if (primary !== BASELINE_FILE) candidates.push(BASELINE_FILE);
  candidates.push(LEGACY_BASELINE);
  for (const f of candidates) {
    try {
      return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch {
      /* try next */
    }
  }
  return {};
}

/**
 * Monotonicity law: the security surface may only RATCHET UP. Measures the
 * current invariants against the engine source under `rootDir`, compares against
 * the stored high-water baseline, and:
 *  - THROWS if any invariant fell below its baseline (an expansion that reduced
 *    the engine's own security) — the caller rolls back byte-exact. The throw is
 *    decided from the comparison, BEFORE any persistence, so a refusal never
 *    depends on a write succeeding.
 *  - only when persist=true, RATCHETS the baseline to max(stored, current).
 */
export function assertSecurityMonotonicity(rootDir, options = {}) {
  const persist = options.persist === true;
  const current = measureSecurityInvariants(rootDir);
  const stored = readBaseline(rootDir);
  const regressions = [];
  const next = {};
  for (const inv of INVARIANTS) {
    const cur = current[inv.key] ?? 0;
    const base = typeof stored[inv.key] === 'number' ? stored[inv.key] : cur;
    if (cur < base) regressions.push({ key: inv.key, was: base, now: cur, what: inv.what });
    next[inv.key] = Math.max(base, cur);
  }
  if (regressions.length) {
    const detail = regressions.map((r) => `${r.key}: ${r.was} -> ${r.now} (${r.what})`).join('; ');
    throw new Error(
      `refused (security monotonicity): this expansion REDUCES the atomic engine's own security surface — ${detail}. ` +
        `A capability that weakens the engine can never be admitted (proof #5). To lower an invariant on purpose, ` +
        `the repo owner must edit ${baselineFileFor(rootDir)} down by hand.`,
    );
  }
  if (persist) {
    try {
      const baselineFile = baselineFileFor(rootDir);
      fs.mkdirSync(path.dirname(baselineFile), { recursive: true });
      fs.writeFileSync(baselineFile, JSON.stringify(next, null, 2) + '\n');
    } catch {
      /* best-effort ratchet persistence */
    }
  }
  return { ok: true, current, baseline: persist ? next : stored, persisted: persist };
}

// CLI
if (process.argv.includes('--measure')) {
  process.stdout.write(JSON.stringify(measureSecurityInvariants(here), null, 2) + '\n');
  process.exit(0);
}
if (process.argv.includes('--enforce')) {
  try {
    const r = assertSecurityMonotonicity(here, { persist: process.argv.includes('--ratchet') });
    process.stdout.write(JSON.stringify({ ok: true, ...r }) + '\n');
    process.exit(0);
  } catch (e) {
    process.stderr.write((e instanceof Error ? e.message : String(e)) + '\n');
    process.exit(1);
  }
}
