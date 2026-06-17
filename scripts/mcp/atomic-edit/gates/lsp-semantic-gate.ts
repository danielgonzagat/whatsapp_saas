/**
 * gates/lsp-semantic-gate.ts — DELTA semantic gate via the LSP mesh (DYNAMIC_GATES).
 *
 * This is the genuine delivery of the LSP mesh into the edit path. The standalone
 * `lsp-diagnostic-gate` is ABSOLUTE (reds on ANY error in the file, even pre-existing
 * ones), which is why it was never wired into the lattice — an absolute gate on the
 * write path would block edits to any file that already has an unrelated error. This
 * gate fixes that: it is DELTA, exactly like `type-soundness-gate` — it queries the
 * language server for BOTH the prior bytes and the candidate overlay and reds ONLY on
 * a diagnostic the edit INTRODUCES. It closes the one capability gap tsc-based
 * type-soundness cannot: cross-language semantic errors (python/go/rust/…) reported by
 * a real language server.
 *
 * Doctrine compliance:
 *   - DELTA, not absolute. Pre-existing errors appear in BOTH the before and after
 *     query and cancel; only the net-new error survives. This is `validate()`'s
 *     `after <= before` philosophy lifted to live LSP diagnostics.
 *   - HONEST / UNJUDGED, never red-by-guess. No configured LSP for the extension, no
 *     resolvable language server, the router missing, or either query failing → the
 *     gate ABSTAINS (`unjudged`) — never red, never green-by-assumption. On a bare
 *     clone / CI with no server installed it is a clean no-op, so it cannot destabilise
 *     the standalone lattice.
 *   - CONSERVATIVE. A single `didOpen` judges one file in isolation, so cross-file
 *     resolution diagnostics (cannot-find-module / undefined-name / no-exported-member)
 *     are unreliable and are EXCLUDED — the connection/binding/reachability gates own
 *     those. What remains is intrinsic single-file semantics (type mismatches, bad
 *     argument counts, arithmetic on non-numbers) that an LSP judges reliably in
 *     isolation and that an edit genuinely introduces.
 *
 * Cost: when a server IS present it spawns it twice (~before+after); bounded to a few
 * files per run. When absent it costs one cheap probe and abstains.
 */
import * as path from 'node:path';
import type { GateModule, GateContext, GateResult, GateRed } from './contract.js';
import { EXT_TO_LSP, queryLspMesh } from './lsp-diagnostic-gate.js';

const GATE_NAME = 'lsp-semantic';

// At most this many applicable files per run get the (before+after) LSP round-trip.
const MAX_FILES = 5;

// Cross-file / resolution diagnostics are unreliable when a file is judged in
// isolation via a single didOpen (the rest of the project is not loaded). They are
// owned by the connection/binding/reachability gates, so this gate excludes them and
// keeps only intrinsic single-file semantic facts.
const RESOLUTION_NOISE =
  /cannot find (name|module|namespace)|could not (resolve|find)|unresolved|no exported member|is not defined|cannot import|module ['"][^'"]+['"] (was )?not found|unknown (import|module)|has no attribute|undefined (name|variable)/i;
// TypeScript cross-file resolution codes (tsserver), excluded for the same reason.
const RESOLUTION_TS_CODES = new Set([2304, 2305, 2306, 2307, 2503, 2552, 2614, 2691, 2724]);

interface ErrSig {
  code: number | undefined;
  message: string;
}

function errorSignatures(result: { diagnostics?: Array<{ severity: number; message: string; code?: number }> }): ErrSig[] {
  const diags = result.diagnostics ?? [];
  return diags
    .filter((d) => d.severity === 1)
    .filter((d) => !RESOLUTION_NOISE.test(d.message || ''))
    .filter((d) => !(typeof d.code === 'number' && RESOLUTION_TS_CODES.has(d.code)))
    .map((d) => ({ code: d.code, message: (d.message || '').trim() }));
}

const sigKey = (s: ErrSig): string => `${s.code ?? '?'}::${s.message}`;

const gate: GateModule = {
  name: GATE_NAME,
  kind: 'dynamic',
  appliesTo(rel: string): boolean {
    return path.extname(rel).toLowerCase() in EXT_TO_LSP;
  },
  async run(ctx: GateContext): Promise<GateResult> {
    const note =
      'every edit to an LSP-routable file: the language server reports no NEW intrinsic ' +
      'semantic error vs the prior bytes (DELTA — pre-existing errors are tolerated; ' +
      'cross-file resolution is excluded and owned by the connection/binding gates)';

    const applicable = ctx.changedFiles
      .map((f) => f.replaceAll('\\', '/'))
      .filter((rel) => this.appliesTo(rel))
      .slice(0, MAX_FILES);

    if (applicable.length === 0) {
      return { gate: GATE_NAME, green: true, reds: [], note, notApplicable: true };
    }

    const reds: GateRed[] = [];
    const abstentions: string[] = [];
    let judged = 0;

    for (const rel of applicable) {
      const after = ctx.readFile(rel);
      if (after === null) continue;
      const before = ctx.priorOf(rel);
      if (before === after) continue; // nothing this gate can judge changed
      const language = EXT_TO_LSP[path.extname(rel).toLowerCase()];
      const absPath = path.join(ctx.repoRoot, rel);

      let beforeRes;
      let afterRes;
      try {
        // Baseline first: if we cannot establish the prior diagnostics honestly we must
        // not red the edit (the delta would be meaningless). New file → '' before.
        beforeRes = await queryLspMesh(absPath, language, before);
        if (!beforeRes.ok) { abstentions.push(`${rel}: LSP baseline unavailable (${language})`); continue; }
        afterRes = await queryLspMesh(absPath, language, after);
        if (!afterRes.ok) { abstentions.push(`${rel}: LSP candidate query failed (${language})`); continue; }
      } catch (err) {
        abstentions.push(`${rel}: LSP threw (${(err as Error).message.slice(0, 80)})`);
        continue;
      }

      judged += 1;
      const beforeCounts = new Map<string, number>();
      for (const s of errorSignatures(beforeRes)) {
        const k = sigKey(s);
        beforeCounts.set(k, (beforeCounts.get(k) ?? 0) + 1);
      }
      for (const s of errorSignatures(afterRes)) {
        const k = sigKey(s);
        const remaining = beforeCounts.get(k) ?? 0;
        if (remaining > 0) {
          beforeCounts.set(k, remaining - 1); // pre-existing — cancels (delta)
          continue;
        }
        reds.push({
          file: rel,
          fact: `LSP "${language}" reports a NEW semantic error this edit introduces${s.code ? ` (code ${s.code})` : ''}: ${s.message.slice(0, 160)}`,
        });
      }
    }

    // No file could be judged (no server / all queries failed) → honest UNJUDGED.
    if (judged === 0) {
      return {
        gate: GATE_NAME,
        green: true,
        reds: [],
        note: `${note} — UNJUDGED: ${abstentions.slice(0, 3).join(' | ') || 'no LSP-judgable change'}`,
        unjudged: true,
        unjudgedReason: abstentions[0] ?? 'no language server resolved for the changed files',
      };
    }

    if (reds.length > 0) {
      return { gate: GATE_NAME, green: false, reds, note };
    }
    return { gate: GATE_NAME, green: true, reds: [], note };
  },
};

export default gate;
