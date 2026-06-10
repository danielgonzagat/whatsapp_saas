/**
 * gates/converge-operator.ts — THE GATES RUN BACKWARD.
 *
 * The lens runs the registry FORWARD: given committed bytes, it SEES every red
 * (a wire that dangles). This operator runs the SAME registry BACKWARD: given an
 * overlay that is RED, it drives the overlay to a GREEN fixpoint by applying only
 * gate-discharging byte-splices — or, when no splice the bytes determine can do
 * it, it returns `needsIntent` (honest escalation), never a guessed edit.
 *
 * It is the convergence analogue of repair.ts ("the HAND") with one structural
 * difference dictated by the parallel-build contract: repair.ts is a concurrent-hot
 * engine file owned by another session, so this operator carries its OWN EXTERNAL
 * PROPOSER REGISTRY and never edits a gate. The proposers are pure functions of the
 * overlay + the reds the registry already reported; the operator imports only
 * `runGates`/`LENS_GATES` from gates/registry.js READ-ONLY to re-gate a candidate.
 *
 * TWO PROPOSERS — exactly the two dominant mechanical red classes:
 *
 *   (1) BINDING red — fact `referenced name '<name>' binds to no declaration,
 *       import, or known global (unbound)`. The fix is a MISSING IMPORT:
 *         (a) a Node builtin → `import { name } from 'node:<mod>'`;
 *         (b) a name exported by a SIBLING module in the same directory → import it.
 *       (Same fix class repair.ts automates; re-derived here so the operator is
 *        self-contained and never touches the hot file.)
 *
 *   (2) CONNECTION red — a NEW relative import in the overlay file that resolves to
 *       NOTHING (`import './x' resolves to nothing` — the canonical connection fact
 *       from gates/contract.ts). The registry's LENS_GATES do not carry the byte-floor
 *       connection gate (it lives in connection-gate.ts, off the registry), so this
 *       operator DETECTS the dangling relative wire itself — overlay-aware, with the
 *       SAME candidate resolution as the shared resolveRelImport — and the proposer's
 *       fix is to retarget the specifier to the resolveRelImport target when exactly
 *       one such target exists on disk/overlay. Ambiguous or absent → no proposal.
 *
 * THE HAND (monotone acceptance — this is what makes it sound). Each pass:
 *   collect total reds R = registry reds (over LENS_GATES) + the operator's own
 *   dangling-relative-import reds; gather every proposer's byte-splices; apply ONLY
 *   the maximal subset whose application STRICTLY DECREASES |R| and ADDS NO NEW red.
 *   Re-gate the candidate the same way. Repeat until R = ∅ (converged) or no
 *   accepted progress is possible (→ needsIntent). Cap at 8 passes (a fixpoint is
 *   reached far sooner in practice — each accepted pass strictly shrinks R).
 *
 * HONESTY DOCTRINE (the project law, carried in the result shape `ConvergeResult`):
 *   `converged: true` ⟺ `finalReds === 0`. A candidate is accepted ONLY when it is
 *   green-convergent (re-gated, reds strictly fewer, none new) — never trusted from
 *   the proposer alone. A red with no bytes-determined fix yields `needsIntent: true`
 *   (the residual reds need an intention decision), never a red-by-guess splice. An
 *   overlay the operator cannot even gate (gate throws / unjudged) contributes no
 *   red and no false-green: those gates are simply skipped by runGates, exactly as
 *   the forward lens skips them.
 *
 * Honest ceiling: this proves the overlay reaches a GREEN registry fixpoint by
 * bytes — ASSEMBLED + CONNECTED. It does not prove the converged module BREATHES
 * (runtime behaviour is the dynamic gates' / a deploy probe's job). And the two
 * proposers cover the mechanical class only; a semantic red (wrong name, wrong
 * route, a missing export that does not yet exist anywhere) is correctly left to
 * intent rather than fabricated.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LENS_GATES, runGates, type UnifiedRed } from './registry.js';
import { makeContext } from './contract.js';
import lintFixGate from './lint-fix-gate.js';
import type { ConvergeResult } from './algebra.js';

const SOURCE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/**
 * Common Node builtin exports → their module. Enough to cover the mechanical
 * missing-builtin-import class the binding gate reds expose. (Kept local so the
 * operator never imports the concurrent-hot repair.ts; the two maps are allowed to
 * drift — correctness is enforced by the green-convergent re-gate, not by this map.)
 */
const BUILTIN_EXPORTS: Record<string, string> = {
  createHash: 'node:crypto', createHmac: 'node:crypto', randomUUID: 'node:crypto', randomBytes: 'node:crypto',
  readFileSync: 'node:fs', writeFileSync: 'node:fs', existsSync: 'node:fs', statSync: 'node:fs', readdirSync: 'node:fs',
  mkdirSync: 'node:fs', unlinkSync: 'node:fs', rmSync: 'node:fs', appendFileSync: 'node:fs',
  join: 'node:path', resolve: 'node:path', relative: 'node:path', dirname: 'node:path', basename: 'node:path',
  extname: 'node:path', normalize: 'node:path', isAbsolute: 'node:path',
  spawnSync: 'node:child_process', execSync: 'node:child_process', spawn: 'node:child_process', exec: 'node:child_process',
  fileURLToPath: 'node:url', pathToFileURL: 'node:url',
  homedir: 'node:os', tmpdir: 'node:os', platform: 'node:os', hostname: 'node:os', cpus: 'node:os',
  inspect: 'node:util', promisify: 'node:util', format: 'node:util',
};

/** One proposed byte-splice: replace [byteStart, byteEnd) in `content` with `replacement`. */
export interface SpliceProposal {
  /** the red class this proposal discharges (for the corpus / audit trail) */
  kind: 'binding' | 'connection' | 'format';
  /** the repo-relative overlay file this splice targets (its own attribution — no re-derivation) */
  file: string;
  /** byte offset (inclusive) into the CURRENT overlay content where the splice begins */
  byteStart: number;
  /** byte offset (exclusive) into the CURRENT overlay content where the splice ends */
  byteEnd: number;
  /** the bytes to write in place of [byteStart, byteEnd) */
  replacement: string;
  /** human-readable statement of why this discharges its red */
  rationale: string;
}

/**
 * Apply a set of NON-OVERLAPPING splices to `content`, right-to-left so earlier
 * offsets stay valid. Overlapping proposals are a programmer error here — the
 * operator only ever batches one splice per distinct red — but we defend by sorting
 * descending and skipping any splice that overlaps an already-applied one.
 */
function applySplices(content: string, splices: SpliceProposal[]): string {
  const sorted = [...splices].sort((a, b) => b.byteStart - a.byteStart);
  let out = content;
  let lastStart = Number.POSITIVE_INFINITY;
  for (const s of sorted) {
    if (s.byteEnd > lastStart) continue; // overlaps a later (already-applied) splice → skip
    out = out.slice(0, s.byteStart) + s.replacement + out.slice(s.byteEnd);
    lastStart = s.byteStart;
  }
  return out;
}

/** Candidate file paths a relative specifier could resolve to (mirrors the shared resolver). */
function relCandidates(base: string): string[] {
  const c = [
    base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, `${base}.mjs`, `${base}.cjs`, `${base}.json`,
    `${base}/index.ts`, `${base}/index.tsx`, `${base}/index.js`,
  ];
  if (base.endsWith('.js')) c.push(`${base.slice(0, -3)}.ts`, `${base.slice(0, -3)}.tsx`);
  return c;
}

/**
 * Resolve a RELATIVE specifier from `fromRel` against the overlay + disk. Returns the
 * resolved repo-relative path, or null when it dangles. Same semantics as
 * gates/contract.ts makeContext.resolveRelImport, overlay-aware so a sibling created
 * in the same transaction resolves. Bare specifiers return null (not this fact).
 */
function resolveRel(repoRoot: string, overlay: Map<string, string>, fromRel: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const norm = (p: string): string => p.replaceAll('\\', '/');
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(norm(fromRel)), spec));
  for (const cand of relCandidates(base)) {
    if (overlay.has(norm(cand)) || fs.existsSync(path.join(repoRoot, cand))) return norm(cand);
  }
  return null;
}

/** Length-preserving blanking of // and block comments so a `from './x'` in a comment is never read as an import. */
function blankComments(text: string): string {
  const out = text.split('');
  const n = text.length;
  let i = 0;
  const blankTo = (end: number): void => {
    for (let k = i; k < end && k < n; k += 1) if (out[k] !== '\n') out[k] = ' ';
  };
  while (i < n) {
    const c = text[i];
    const c2 = text[i + 1];
    if (c === '/' && c2 === '/') {
      let j = i + 2;
      while (j < n && text[j] !== '\n') j += 1;
      blankTo(j);
      i = j;
    } else if (c === '/' && c2 === '*') {
      let j = i + 2;
      while (j < n && !(text[j] === '*' && text[j + 1] === '/')) j += 1;
      j = Math.min(j + 2, n);
      blankTo(j);
      i = j;
    } else if (c === '"' || c === "'" || c === '`') {
      let j = i + 1; // skip OVER the string (specifiers live here) — preserve it
      while (j < n && text[j] !== c) {
        if (text[j] === '\\') j += 1;
        j += 1;
      }
      i = Math.min(j + 1, n);
    } else {
      i += 1;
    }
  }
  return out.join('');
}

interface RelImportSite {
  spec: string;
  /** byte offset of the opening quote of the specifier in the ORIGINAL content */
  quoteStart: number;
  /** byte offset just past the closing quote of the specifier in the ORIGINAL content */
  quoteEnd: number;
}

/**
 * Locate every RELATIVE import specifier site in `content` (the dangling-wire
 * candidates). Token coarse but quote-precise: comments are blanked so a comment
 * `from './x'` is never matched; the byte span covers the quoted specifier so a
 * connection proposer can retarget it in place. Matches `from '...'`, bare
 * `import '...'`, and `require('...')`.
 */
function relImportSites(content: string): RelImportSite[] {
  const code = blankComments(content);
  const sites: RelImportSite[] = [];
  const re = /(?:\bfrom\s+|\brequire\s*\(\s*|^\s*import\s+)(['"])([^'"]+)\1/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const spec = m[2];
    if (!spec.startsWith('.')) continue; // bare → not the connection fact
    // the matched quote+spec+quote ends at re.lastIndex; the opening quote is at
    // lastIndex - (spec.length + 2). The byte offsets line up with the original
    // content because blankComments is length-preserving.
    const quoteEnd = re.lastIndex;
    const quoteStart = quoteEnd - (spec.length + 2);
    sites.push({ spec, quoteStart, quoteEnd });
  }
  return sites;
}

/**
 * CONNECTION reds the operator detects itself (the registry LENS_GATES do not carry
 * the byte-floor connection gate). A red = a relative import in the overlay file that
 * resolves to nothing. Only files in `overlay` are judged (this is the candidate set
 * the operator is converging). The fact phrasing matches gates/contract.ts.
 */
function connectionReds(repoRoot: string, overlay: Map<string, string>): UnifiedRed[] {
  const reds: UnifiedRed[] = [];
  for (const [rel, content] of overlay) {
    if (!SOURCE_RE.test(rel)) continue;
    for (const site of relImportSites(content)) {
      if (resolveRel(repoRoot, overlay, rel, site.spec) === null) {
        reds.push({
          gate: 'connection',
          file: rel,
          locus: `b${site.quoteStart}-${site.quoteEnd}`,
          fact: `import '${site.spec}' resolves to nothing`,
        });
      }
    }
  }
  return reds;
}

/** Total red set = registry reds (binding + the rest of LENS_GATES) ∪ the operator's connection reds. */
async function totalReds(repoRoot: string, overlay: Map<string, string>): Promise<UnifiedRed[]> {
  const changed = [...overlay.keys()];
  const reg = await runGates(LENS_GATES, repoRoot, overlay, changed, true);
  return [...reg.reds, ...connectionReds(repoRoot, overlay)];
}

/*
 * TODO (A6 lint-fix proposer — deferred, NOT forced; the integration note explicitly
 * permits "leave a documented TODO" when it does not cleanly compose). The A6 lint-fix
 * gate IS fully wired into the crivo: registry.ts adds it to DYNAMIC_GATES, so it reds
 * a non-canonical file on the WRITE floor and the READ lens, and it exposes the exact
 * canonical-form byte-splice via its own proposeFixes — drainable through the dynamic
 * path. What is deferred is adding a THIRD operator-side proposer here so the
 * convergence CORPUS spans formatting, not import-only.
 *
 * WHY IT DOES NOT CLEANLY COMPOSE INTO THIS OPERATOR (the precise blocker, verified):
 *   The operator's monotone HAND accepts a candidate ONLY if total reds STRICTLY
 *   decrease. So a canonical-form splice is acceptance-valid only if the lint-fix red
 *   it discharges is part of totalReds(). But unioning lint-fix reds into totalReds()
 *   makes EVERY non-canonical overlay a counted red — and that breaks the operator's
 *   own contract proof (converge-operator.proof.mjs), which was verified empirically:
 *     - GREEN-ALREADY: the proof's already-green fixture `export const x = 1; ...` is
 *       not prettier-canonical, so the operator would apply a format splice →
 *       `appliedEdits===0` FAILS (the operator must invent NO work on a green overlay).
 *     - RED→GREEN(binding/connection): after the import splice the file is still not
 *       prettier-canonical, so a residual lint-fix red survives → `finalReds===0` and
 *       `converged===true` FAIL.
 *   The lint-fix fact is ABSOLUTE and ORTHOGONAL to the operator's dangling-wire
 *   mission; counting it would redefine "converged" from "every wire resolves" to
 *   "every wire resolves AND every file is canonical", a broader contract than this
 *   operator promises. That is an intention decision for the operator's owner, not a
 *   byte-determined fix — so per doctrine it is left to intent, not forced.
 *
 * HOW TO LAND IT CLEANLY (for the operator's owner): give the format pass its OWN
 * fixpoint loop AFTER the wire-convergence loop reaches green (compose two operators
 * sequentially, each sound on its own red class), or thread a per-class red budget so
 * the HAND accepts a splice that strictly drains ITS OWN class. Either keeps each
 * proof's invariant. The gate already exposes everything needed (run + proposeFixes);
 * only the operator's acceptance contract needs the owner's decision.
 */

/** Search the file's OWN directory (overlay + disk) for a sibling exporting `name`; return its import specifier or null. */
function findSiblingExport(repoRoot: string, overlay: Map<string, string>, fileRel: string, name: string): string | null {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    String.raw`export\s+(?:async\s+)?(?:const|let|var|function|class)\s+${esc}\b|export\s*\{[^}]*\b${esc}\b[^}]*\}`,
  );
  const dirRel = path.posix.dirname(fileRel.replaceAll('\\', '/'));
  const selfBase = path.posix.basename(fileRel);
  const specFor = (base: string): string => (/\.tsx?$/.test(base) ? `./${base.replace(/\.tsx?$/, '.js')}` : `./${base}`);
  // overlay siblings first (a file created in the same transaction can export the name)
  for (const [rel, content] of overlay) {
    if (path.posix.dirname(rel.replaceAll('\\', '/')) !== dirRel) continue;
    const base = path.posix.basename(rel);
    if (base === selfBase || !/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(base) || base.endsWith('.proof.ts')) continue;
    if (re.test(content)) return specFor(base);
  }
  const dirAbs = path.join(repoRoot, dirRel);
  let entries: string[];
  try {
    entries = fs.readdirSync(dirAbs);
  } catch {
    return null;
  }
  for (const e of entries) {
    if (e === selfBase || !/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(e) || e.endsWith('.proof.ts')) continue;
    if (overlay.has(`${dirRel}/${e}`)) continue; // already considered above
    let src: string;
    try {
      src = fs.readFileSync(path.join(dirAbs, e), 'utf8');
    } catch {
      continue;
    }
    if (re.test(src)) return specFor(e);
  }
  return null;
}

/**
 * PROPOSER 1 — binding red → missing import. Groups every binding red's name by the
 * module it should come from (builtin or sibling) and proposes ONE splice at byte 0
 * that prepends the import lines. A name with no findable export is NOT proposed
 * (left to intent). Returns at most one splice (the prepend) per file.
 */
function proposeBindingFixes(repoRoot: string, overlay: Map<string, string>, reds: UnifiedRed[]): SpliceProposal[] {
  const out: SpliceProposal[] = [];
  const byFile = new Map<string, UnifiedRed[]>();
  for (const r of reds) {
    if (r.gate !== 'binding') continue;
    (byFile.get(r.file) ?? byFile.set(r.file, []).get(r.file)!).push(r);
  }
  for (const [rel, fileReds] of byFile) {
    const byModule = new Map<string, Set<string>>();
    for (const r of fileReds) {
      const m = /referenced name '([^']+)'/.exec(r.fact);
      if (!m) continue;
      const name = m[1];
      const spec = BUILTIN_EXPORTS[name] ?? findSiblingExport(repoRoot, overlay, rel, name);
      if (!spec) continue; // no bytes-determined source → leave to intent
      (byModule.get(spec) ?? byModule.set(spec, new Set()).get(spec)!).add(name);
    }
    if (byModule.size === 0) continue;
    const importLines = [...byModule].map(([spec, names]) => `import { ${[...names].sort().join(', ')} } from '${spec}';`);
    out.push({
      kind: 'binding',
      file: rel,
      byteStart: 0,
      byteEnd: 0,
      replacement: `${importLines.join('\n')}\n`,
      rationale: `${rel}: prepend missing import(s) for unbound name(s): ${importLines.join(' ')}`,
    });
  }
  return out;
}

/**
 * PROPOSER 2 — connection red → retarget the specifier. For each dangling relative
 * import, scan the importing file's directory (overlay + disk) for files whose
 * basename matches the specifier's intended basename; if EXACTLY ONE resolvable
 * relative specifier reaches a real file, propose retargeting the quoted specifier to
 * it. Ambiguous (>1 candidate) or none → no proposal (intent decides the real wire).
 */
function proposeConnectionFixes(repoRoot: string, overlay: Map<string, string>, reds: UnifiedRed[]): SpliceProposal[] {
  const out: SpliceProposal[] = [];
  for (const r of reds) {
    if (r.gate !== 'connection') continue;
    const content = overlay.get(r.file);
    if (content === undefined) continue;
    const m = /^b(\d+)-(\d+)$/.exec(r.locus ?? '');
    const specM = /import '([^']+)' resolves to nothing/.exec(r.fact);
    if (!m || !specM) continue;
    const [byteStart, byteEnd] = [Number(m[1]), Number(m[2])];
    const dangling = specM[1];
    const wantBase = path.posix.basename(dangling).replace(/\.(ts|tsx|js|jsx|mjs|cjs|json)$/, '');
    const dirRel = path.posix.dirname(r.file.replaceAll('\\', '/'));
    // collect candidate sibling specifiers whose basename matches the intended one
    const matches = new Set<string>();
    const consider = (base: string): void => {
      const stem = base.replace(/\.(ts|tsx|js|jsx|mjs|cjs|json)$/, '');
      if (stem !== wantBase) return;
      const spec = /\.tsx?$/.test(base) ? `./${base.replace(/\.tsx?$/, '.js')}` : `./${base}`;
      if (resolveRel(repoRoot, overlay, r.file, spec) !== null) matches.add(spec);
    };
    for (const rel of overlay.keys()) {
      if (path.posix.dirname(rel.replaceAll('\\', '/')) === dirRel) consider(path.posix.basename(rel));
    }
    try {
      for (const e of fs.readdirSync(path.join(repoRoot, dirRel))) consider(e);
    } catch {
      /* unreadable dir → no disk candidates */
    }
    matches.delete(dangling); // the dangling spec itself is not a fix
    if (matches.size !== 1) continue; // ambiguous or none → intent decides
    const target = [...matches][0];
    const quote = content[byteStart] === '"' ? '"' : "'";
    out.push({
      kind: 'connection',
      file: r.file,
      byteStart,
      byteEnd,
      replacement: `${quote}${target}${quote}`,
      rationale: `${r.file}: retarget dangling relative import '${dangling}' → '${target}' (unique resolvable sibling)`,
    });
  }
  return out;
}

export interface ConvergedOverlayFile {
  /** repo-relative file in the final overlay after every accepted splice */
  file: string;
  /** full final bytes for this file; callers still need write-gate admission before commit */
  newText: string;
}

export interface ConvergeReport extends ConvergeResult {
  /** the rationale of every accepted splice, in application order (corpus / audit trail) */
  accepted: string[];
  /** final overlay bytes after convergence; this is what lets higher-level intent tools become generators */
  files: ConvergedOverlayFile[];
  /** the reds that survived to the fixpoint (present iff !converged) — never guessed away */
  residual: UnifiedRed[];
  /** opt-in format-fixpoint pass: byte-splices applied to reach prettier-canonical form
   *  (separate from appliedEdits, which is wire-only) — feeds the corpus beyond import-fix */
  formatEdits: number;
  /** the format rationales applied (corpus / audit trail), empty unless opts.format */
  formatted: string[];
}

/**
 * THE OPERATOR — run the gates BACKWARD over `overlay` to a green fixpoint.
 *
 * Monotone HAND: each pass collects total reds, gathers every proposer's splices,
 * and accepts ONLY a candidate that STRICTLY decreases |reds| and adds no new red.
 * The candidate is RE-GATED through the same registry, so a proposal that does not
 * actually drive reds down is rejected, not trusted. Converged ⟺ finalReds === 0;
 * a residual the bytes cannot discharge yields needsIntent (never a guessed splice).
 */
export async function converge(
  repoRoot: string,
  overlay: Map<string, string>,
  opts: { format?: boolean } = {},
): Promise<ConvergeReport> {
  const work = new Map(overlay);
  const accepted: string[] = [];
  let reds = await totalReds(repoRoot, work);
  let appliedEdits = 0;

  for (let pass = 0; pass < 8; pass += 1) {
    if (reds.length === 0) break;
    const splices = [
      ...proposeBindingFixes(repoRoot, work, reds),
      ...proposeConnectionFixes(repoRoot, work, reds),
    ];
    if (splices.length === 0) break; // nothing the bytes determine → residual is intent

    // Build the candidate overlay by applying, per file, that file's own splices.
    // Each splice carries its target file (SpliceProposal.file) — no re-derivation,
    // no ambiguity. A file's splices are non-overlapping by construction (one byte-0
    // prepend for binding + distinct quoted-specifier spans for connection).
    const candidate = new Map(work);
    const filesTouched = new Set<string>();
    for (const [rel, content] of work) {
      const fileSplices = splices.filter((s) => s.file === rel);
      if (fileSplices.length === 0) continue;
      candidate.set(rel, applySplices(content, fileSplices));
      filesTouched.add(rel);
    }
    if (filesTouched.size === 0) break;

    // CORRECT-BY-CONSTRUCTION acceptance (the monotone HAND): re-gate the candidate
    // through the SAME registry. Accept ONLY if total reds strictly decrease AND no
    // NEW red appears. A proposal that does not actually converge is rejected here,
    // never trusted from the proposer alone.
    const after = await totalReds(repoRoot, candidate);
    const before = redKeySet(reds);
    const introducedNew = after.some((r) => !before.has(redKey(r)));
    if (after.length >= reds.length || introducedNew) {
      break; // not strictly convergent → stop; the residual is an intention decision
    }
    // ACCEPT.
    for (const s of splices) if (filesTouched.has(s.file)) accepted.push(s.rationale);
    appliedEdits += splices.filter((s) => filesTouched.has(s.file)).length;
    for (const rel of filesTouched) work.set(rel, candidate.get(rel)!);
    reds = after;
  }

  // ── OPTIONAL format-fixpoint pass (the corpus-spanning drain) ──────────────
  // Runs ONLY when opts.format AND the wire reds already converged, so it never
  // changes converged/finalReds/appliedEdits (wire facts — the default path is
  // byte-identical). Prettier is whitespace-only + idempotent → one pass reaches the
  // canonical form and cannot touch a wire. Re-gated: the format splices are KEPT only
  // if total reds stay 0 (monotone — formatting must never introduce a red), else
  // discarded. Reported as formatEdits, feeding the convergence corpus beyond import-fix.
  let formatEdits = 0;
  const formatted: string[] = [];
  if (opts.format && reds.length === 0) {
    const ctx = makeContext(repoRoot, work, [...work.keys()]);
    await lintFixGate.run(ctx); // populates the canonical-form stash that proposeFixes reads
    const fixes = lintFixGate.proposeFixes?.(ctx) ?? [];
    if (fixes.length > 0) {
      const candidate = new Map(work);
      const touched = new Set<string>();
      for (const [rel, content] of work) {
        const fileFixes = fixes.filter((f) => f.file === rel);
        if (fileFixes.length === 0) continue;
        candidate.set(rel, applySplices(content, fileFixes.map((f) => ({ kind: 'format' as const, ...f }))));
        touched.add(rel);
      }
      if (touched.size > 0 && (await totalReds(repoRoot, candidate)).length === 0) {
        for (const rel of touched) work.set(rel, candidate.get(rel)!);
        for (const f of fixes) if (touched.has(f.file)) { formatEdits += 1; formatted.push(f.rationale); }
      }
    }
  }

  const finalReds = reds.length;
  const converged = finalReds === 0;
  return {
    converged,
    finalReds,
    appliedEdits,
    // Honest escalation: residual reds the bytes could not discharge need an
    // intention decision, NOT a guessed splice. converged ⟺ finalReds === 0.
    needsIntent: !converged,
    accepted,
    files: [...work].map(([file, newText]) => ({ file, newText })),
    residual: converged ? [] : reds,
    formatEdits,
    formatted,
  };
}

/** Stable key for a red (gate+file+locus+fact) — used to test "no NEW red introduced". */
function redKey(r: UnifiedRed): string {
  return `${r.gate}\u0000${r.file}\u0000${r.locus ?? ''}\u0000${r.fact}`;
}
function redKeySet(reds: UnifiedRed[]): Set<string> {
  return new Set(reds.map(redKey));
}

// ── CLI: converge a single red overlay on demand (diagnostics) ───────────────
const self = fileURLToPath(import.meta.url);
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : '';
function findRepoRoot(start: string): string {
  let d = start;
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(d, '.git'))) return d;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return start;
}
if (invoked === self || invoked === self.replace(/\.ts$/, '.js')) {
  const repoRoot = findRepoRoot(path.dirname(self));
  const target = process.argv[2];
  if (!target) {
    process.stderr.write('usage: converge-operator.js <repo-relative-source-file>\n');
    process.exit(2);
  }
  const rel = path.relative(repoRoot, path.resolve(repoRoot, target)).replaceAll('\\', '/');
  let content: string;
  try {
    content = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
  } catch (e) {
    process.stderr.write(`cannot read ${rel}: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(2);
    throw e;
  }
  converge(repoRoot, new Map([[rel, content]]))
    .then((r) => {
      process.stdout.write(`\nCONVERGE OPERATOR — ${rel}\n`);
      process.stdout.write(`  converged   : ${r.converged}\n  finalReds   : ${r.finalReds}\n  appliedEdits: ${r.appliedEdits}\n  needsIntent : ${r.needsIntent}\n`);
      if (r.accepted.length) {
        process.stdout.write('  accepted splices:\n');
        for (const a of r.accepted) process.stdout.write(`    ${a}\n`);
      }
      if (r.residual.length) {
        process.stdout.write('  residual reds (needs intent — not guessed):\n');
        for (const rd of r.residual.slice(0, 40)) process.stdout.write(`    [${rd.gate}] ${rd.file}${rd.locus ? `:${rd.locus}` : ''} — ${rd.fact}\n`);
      }
      process.exit(0);
    })
    .catch((e: unknown) => {
      process.stderr.write(`converge error: ${e instanceof Error ? e.stack : String(e)}\n`);
      process.exit(1);
    });
}
