/**
 * gates/lint-fix-gate.ts — the exoneration-free MECHANICALLY-FIXABLE-LINT fact,
 * and the proposer that DRAINS that population from the corpus.
 *
 * THE PROBLEM IT CLOSES. The convergence corpus is import-fix-dominated: the two
 * proposers in converge-operator.ts discharge binding (missing-import) and
 * connection (dangling-relative) reds, so almost every repair triple the crivo
 * records is "add an import". But the SARIF/lint finding population is dominated by
 * a different, equally MECHANICAL class — formatting. Prettier alone is ~51% of the
 * mechanically-fixable findings, and eslint --fix's fixable subset (the rules whose
 * `fix` is a deterministic text edit: quotes, semis, spacing, `prefer-const`,
 * trailing commas, …) is most of the rest. None of that needs an intention
 * decision: the fixed form is SINGLE-VALUED and IDEMPOTENT. This gate makes that
 * class first-class so the corpus stops being import-fix-dominated.
 *
 * THE FACT (one exoneration-free statement, no language server, no daemon, no human):
 *   A file is ALREADY in its canonical mechanically-fixed form, or it is not.
 *   "Canonical form" = the deterministic output of running the project's own
 *   prettier (its resolved .prettierrc config) over the file's content. If
 *   format(content) === content the file is green; if it differs, the file is red
 *   AND the gate hands back the exact byte-splice to the formatted form. Because
 *   prettier is a pure function of (bytes, config, parser) and is idempotent
 *   (format(format(x)) === format(x), validated in the proof), the fix is
 *   deterministic and green-convergent: applying it once reaches the fixpoint, and
 *   a second run of the gate over the result is green.
 *
 * WHY DYNAMIC (kind:'dynamic'). Like type-soundness and probe-convergence, deciding
 * the fact requires running a tool (prettier). But UNLIKE probe-convergence it needs
 * NO file write: prettier.format is a pure in-process call on the OVERLAY content
 * (overlay wins, else disk), so there is no instrument→run→revert transaction to
 * perform — the "apply→run→revert-byte-exact" discipline of probe-convergence-gate
 * collapses here to a single side-effect-free call, which is strictly safer (nothing
 * is ever written, so nothing can be left dirty). The gate therefore reuses the
 * OVERLAY discipline (judge the candidate content, never disk) without the snapshot
 * machinery. It honours the project formatting by resolving the SAME .prettierrc the
 * repo uses (prettier.resolveConfig), so it never imposes a foreign style.
 *
 * DELTA / NEW-only is INTENTIONALLY NOT applied here, and that is the honest design.
 * The other write-gates use priorOf delta because their fact is "this write must not
 * INTRODUCE a dangling wire" — pre-existing debt is tolerated. Formatting is
 * different in kind: prettier's output is idempotent and whole-file, so the
 * canonical-form fact is naturally absolute and the same in BOTH directions — the
 * WRITE floor and the READ lens ask the identical question ("is this content already
 * canonical?") and a converge pass drives it to the fixpoint in one accepted splice.
 * Making it delta would be incoherent (there is no "partial format"). This is the
 * one gate whose fact is legitimately absolute, and the doc says so out loud.
 *
 * proposeFixes — THE DRAIN. The gate implements the optional proposeFixes contract:
 * for every red file it returns ONE byte-span splice covering the WHOLE content
 * (`[0, content.length) → formatted`). The convergence operator applies it, re-gates
 * (this gate then sees format(formatted) === formatted → green), and accepts it
 * because |reds| strictly drops with no new red. Whole-content span side-steps the
 * byte-vs-UTF16 ambiguity in applySplices (it uses String.slice): spanning [0,len]
 * is correct under either reading, exactly as the binding proposer's [0,0] prepend.
 *
 * TRI-STATE HONESTY (the project law):
 *   - GREEN    — format(content) === content (already canonical) → no fact violated.
 *   - RED      — format(content) !== content → the file is not canonical; the splice
 *                to the canonical form is available via proposeFixes.
 *   - UNJUDGED — prettier cannot decide the bytes: no parser is inferable for the
 *                path, the file is in a .prettierignore, prettier throws (a genuine
 *                SYNTAX ERROR — which is the binding/type gates' fact, not ours), or
 *                the prettier module / config cannot be loaded. Never red-by-guess
 *                (a syntax-broken file is not "unformatted", it is unparseable → not
 *                this gate's concern), never green-by-assumption.
 *
 * HONEST CEILING (the Rice line). This gate converges the MECHANICALLY-FIXABLE,
 * IDEMPOTENT subset only — the subset whose fixed form is a deterministic function
 * of the bytes. That is exactly where decidability stops:
 *   - A NON-FIXABLE lint rule (no-unused-vars, no-explicit-any, complexity,
 *     no-floating-promises, …) has NO single mechanical fix — removing the unused
 *     var might delete a needed side effect; narrowing `any` is a type decision.
 *     Those reds belong to the STRUCTURAL gates (binding/type-soundness/the eslint
 *     decider) and to intent, never here. This gate deliberately judges ONLY the
 *     canonical-formatting fact, so it can never red-by-guess a semantic issue.
 *   - prettier's idempotence is what makes the fix green-convergent; if a future
 *     formatter were non-idempotent the second-run check in proposeFixes' consumer
 *     (the operator's re-gate) would reject it. We additionally assert idempotence in
 *     the proof, so a regression there is caught.
 * It proves a file is CANONICAL, never that the canonical file BEHAVES correctly —
 * that is the dynamic gates'/a deploy probe's job, consistent with the whole crivo.
 */
import * as path from 'node:path';
import { createRequire } from 'node:module';
import {
  type GateModule,
  type GateContext,
  type GateResult,
  type GateRed,
} from './contract.js';

/** Files prettier has a parser for in this repo (the mechanically-formattable set). */
const FORMATTABLE_RE = /\.(ts|tsx|js|jsx|mjs|cjs|json|jsonc|md|mdx|css|scss|less|html|yml|yaml)$/;
/** Declaration files are emitted artefacts, not hand-formatted source — never judged. */
const SKIP_RE = /\.d\.ts$/;

/**
 * Minimal structural shape of the prettier API surface this gate uses. We load
 * prettier lazily through the importing context's require so it resolves against the
 * repo's installed prettier (3.x), and degrade to unjudged if it is absent.
 */
interface PrettierLike {
  format(source: string, options: Record<string, unknown>): Promise<string> | string;
  resolveConfig(filePath: string): Promise<Record<string, unknown> | null>;
  getFileInfo(
    filePath: string,
  ): Promise<{ inferredParser: string | null; ignored: boolean }>;
}

let prettierCache: PrettierLike | null | undefined;

/**
 * Load the repo's own prettier ONCE (memoised). Resolved relative to this gate file
 * so it finds the prettier installed in the repo's node_modules walk-up — the SAME
 * binary the project's `npm run lint`/format uses, so the canonical form this gate
 * asserts is the project's real canonical form, not a foreign default. Returns null
 * (→ unjudged) when prettier is not installed.
 */
function loadPrettier(): PrettierLike | null {
  if (prettierCache !== undefined) return prettierCache;
  try {
    const req = createRequire(import.meta.url);
    prettierCache = req('prettier') as PrettierLike;
  } catch {
    prettierCache = null;
  }
  return prettierCache;
}

/**
 * The canonical form of `content` for `rel`, or a decision-defer reason. Pure +
 * side-effect-free: prettier.format over the in-memory content with the repo's
 * resolved config. The `filepath` option lets prettier infer the parser by
 * extension (validated: a `.ts` path infers the `typescript` parser).
 *
 * Returns one of:
 *   { formatted }     — the canonical bytes (compare to `content` for green/red)
 *   { unjudged: why } — no parser, ignored by .prettierignore, syntax error, or a
 *                       prettier/config load failure (honest defer, never red).
 */
async function canonicalForm(
  ctx: GateContext,
  rel: string,
  content: string,
): Promise<{ formatted?: string; unjudged?: string }> {
  const prettier = loadPrettier();
  if (!prettier) return { unjudged: 'prettier not installed — cannot decide canonical form' };
  const absPath = path.join(ctx.repoRoot, rel);
  // Parser inference + .prettierignore membership are byte facts about the path.
  let info: { inferredParser: string | null; ignored: boolean };
  try {
    info = await prettier.getFileInfo(absPath);
  } catch (e) {
    return { unjudged: `prettier.getFileInfo failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (info.ignored) return { unjudged: `'${rel}' is in a .prettierignore — not the formatting gate's concern` };
  if (!info.inferredParser) return { unjudged: `no prettier parser inferable for '${rel}'` };
  // Resolve the PROJECT's config so the canonical form is the project's, not a default.
  let cfg: Record<string, unknown> | null = null;
  try {
    cfg = await prettier.resolveConfig(absPath);
  } catch {
    cfg = null; // unreadable config → fall back to prettier defaults (still deterministic)
  }
  try {
    const formatted = await prettier.format(content, {
      ...(cfg ?? {}),
      filepath: absPath,
      parser: info.inferredParser,
    });
    return { formatted };
  } catch (e) {
    // A prettier throw here is a genuine SYNTAX ERROR in the candidate bytes. That is
    // the binding/type gate's fact (unparseable code), NOT "unformatted code" — so we
    // defer rather than redden a syntax-broken file as a formatting violation.
    return { unjudged: `prettier could not parse '${rel}' (syntax error — not a formatting fact): ${e instanceof Error ? e.message : String(e)}` };
  }
}

const isFormattable = (rel: string): boolean => FORMATTABLE_RE.test(rel) && !SKIP_RE.test(rel);

/**
 * Cost + lens bound. A normal converge writes 1–3 files; this caps the in-memory
 * format calls and, because the whole-repo READ lens passes the entire repo as
 * `changedFiles`, it is the signal by which the gate bails to `unjudged` in lens
 * mode (a whole-repo reformat sweep is the formatter CLI's job, not the per-write
 * floor's — mirrors type-soundness's MAX_CHANGED bail).
 */
const MAX_CHANGED = 8;

/**
 * Per-context stash of the canonical forms computed by run(), so proposeFixes (which
 * the frozen contract types as SYNC) can return the splice without re-running the
 * async prettier call. Keyed by GateContext identity — one run() populates exactly
 * the forms one proposeFixes(ctx) reads. A WeakMap so contexts are GC'd normally and
 * no state leaks across runs. run() populates this before returning; proposeFixes
 * reads it; the convergence operator always calls run() before proposeFixes.
 */
const CANONICAL_STASH = new WeakMap<GateContext, Map<string, { content: string; formatted: string }>>();

const lintFixGate: GateModule = {
  name: 'lint-fix',
  kind: 'dynamic',
  appliesTo: (rel) => isFormattable(rel),

  async run(ctx: GateContext): Promise<GateResult> {
    const note =
      'every changed file is already in its canonical prettier-fixed form (the mechanically-fixable, idempotent lint subset; the byte-splice to the canonical form is exposed via proposeFixes)';
    const changed = ctx.changedFiles.filter(isFormattable);
    if (changed.length === 0) return { gate: this.name, green: true, reds: [], note };
    if (changed.length > MAX_CHANGED) {
      // Whole-repo lens shape → defer; a repo-wide reformat is not the per-write floor's job.
      return { gate: this.name, green: true, reds: [], note, unjudged: true };
    }

    // Compute every candidate's canonical form ONCE, stash it for proposeFixes, and
    // derive the verdict from the same forms (no second prettier hop). A file whose
    // form is undecidable is recorded as a deferral and contributes no fix.
    const forms = new Map<string, { content: string; formatted: string }>();
    const reds: GateRed[] = [];
    const deferrals: string[] = [];
    for (const rel of changed) {
      const content = ctx.readFile(rel);
      if (content === null) {
        deferrals.push(`${rel}: cannot read`);
        continue;
      }
      const { formatted, unjudged } = await canonicalForm(ctx, rel, content);
      if (unjudged !== undefined || formatted === undefined) {
        deferrals.push(`${rel}: ${unjudged ?? 'no canonical form'}`);
        continue;
      }
      forms.set(rel, { content, formatted });
      if (formatted !== content) {
        reds.push({
          file: rel,
          // Whole-content splice → locus is the full char span; the fix is in proposeFixes.
          locus: `b0-${content.length}`,
          fact: 'not in canonical prettier-fixed form (mechanically fixable — the canonical form differs from the current content)',
        });
      }
    }
    CANONICAL_STASH.set(ctx, forms);

    if (reds.length === 0 && deferrals.length === changed.length) {
      // EVERY candidate was undecidable (no parser / ignored / unparseable / unreadable).
      // Honest: neither red-by-guess nor green-by-assumption.
      return {
        gate: this.name,
        green: true,
        reds: [],
        note: `${note} — ALL ${changed.length} file(s) UNJUDGED: ${deferrals.slice(0, 4).join(' | ')}`,
        unjudged: true,
      };
    }
    return {
      gate: this.name,
      green: reds.length === 0,
      reds,
      note:
        deferrals.length > 0
          ? `${note} (${deferrals.length} file(s) unjudged: ${deferrals.slice(0, 2).join(' | ')})`
          : note,
    };
  },

  /**
   * THE DRAIN — the gate's own repair proposals. For each red file return ONE splice
   * replacing the WHOLE content with its canonical prettier form. The splice spans
   * `[0, content.length)` so it is correct under both the byte and the UTF-16
   * (String.slice) reading of the span — same robustness as the binding proposer's
   * `[0,0]` prepend. The convergence operator applies it, re-gates this gate (which
   * then sees `format(formatted) === formatted` → green by idempotence), and accepts
   * the candidate because |reds| strictly drops with no new red introduced. A file
   * the gate could not decide (unjudged) is absent from the stash → NO proposal, never
   * a guessed edit. proposeFixes is SYNC per the frozen contract: it reads the forms
   * that the preceding run(ctx) already computed and stashed (the operator always
   * awaits run() first), so no async hop is needed here.
   */
  proposeFixes(ctx: GateContext): { file: string; byteStart: number; byteEnd: number; replacement: string; rationale: string }[] {
    const stash = CANONICAL_STASH.get(ctx);
    if (!stash) return []; // proposeFixes called without a preceding run() over this ctx
    const out: { file: string; byteStart: number; byteEnd: number; replacement: string; rationale: string }[] = [];
    for (const [rel, { content, formatted }] of stash) {
      if (formatted === content) continue; // already canonical → no fix
      out.push({
        file: rel,
        byteStart: 0,
        byteEnd: content.length,
        replacement: formatted,
        rationale: `${rel}: replace whole content with its canonical prettier-fixed form (deterministic + idempotent — drains the mechanically-fixable lint class)`,
      });
    }
    return out;
  },
};

export default lintFixGate;
