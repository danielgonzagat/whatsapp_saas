/**
 * gates/type-soundness-gate.ts — the TYPE-SOUNDNESS gate (verification ladder, rung 3).
 *
 * The connection/binding/supply-chain gates prove a write is SYNTACTICALLY intact
 * and CONNECTED (every wire resolves). They do NOT prove it is TYPE-SOUND: a write
 * can satisfy every byte/edge fact and still introduce `TS2322`/`TS2345` the moment
 * the project type-checks. `engine.ts:validate()` is syntactic-only by design (it
 * runs on every micro-splice and must stay cheap). The opt-in `atomic_verify`
 * typecheck runs `tsc --noEmit -p` on DISK, AFTER the bytes already landed.
 *
 * This gate closes that gap at the one place it must be closed to be inescapable:
 * the pre-write convergence floor (registry.WRITE_GATES → runGates over the overlay),
 * BEFORE any byte lands. It type-checks the CANDIDATE content in-memory and refuses
 * the write iff it would INTRODUCE a new type error — never reverting because nothing
 * was ever written.
 *
 * It obeys the frozen gate doctrine exactly:
 *
 *  - DELTA, not absolute. It compiles the prior disk content (ctx.priorOf) AND the
 *    candidate overlay with the IDENTICAL root set + compiler host, and reddens only
 *    when the changed file's error count rises. Pre-existing type debt is tolerated;
 *    only the regression this write causes is blocked. This is `validate()`'s
 *    `after <= before` philosophy, lifted from syntax to types.
 *
 *  - DELTA also makes single-file rooting SOUND. Rooting `createProgram` on just the
 *    changed files (instead of the whole `tsconfig` closure) is fast but normally
 *    yields false errors (missing global augmentations declared elsewhere). Because
 *    the prior and candidate compiles share the exact same root-scoping, every such
 *    structural false-error appears in BOTH and cancels in the delta — only the
 *    edit's net-new errors survive.
 *
 *  - UNJUDGED, never red-by-guess / green-by-assumption. No tsconfig from the changed
 *    file up to repo root, the TypeScript module unavailable, a source file the
 *    program cannot load, more than MAX_CHANGED checkable files (too broad to type
 *    cheaply at the floor — and the signal by which the whole-repo READ lens bails),
 *    or changed files spanning more than one tsconfig → `unjudged: true`. A throw is
 *    recorded honest-unjudged by `runGates`.
 *
 * It has NO side effects: a pure in-process `ts` compilation over (overlay ∪ disk).
 * No spawn, no disk write, no revert machinery — so it is safe in the WRITE path.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import type { GateContext, GateModule, GateRed, GateResult } from './contract.js';

const TS_RE = /\.tsx?$/;
const isCheckable = (rel: string): boolean => TS_RE.test(rel) && !rel.endsWith('.d.ts');

/**
 * Cost + honesty bound. A normal converge writes 1–3 files; this caps the in-memory
 * compile and, because the READ lens passes the whole repo as `changedFiles`, it is
 * also the signal by which this gate bails to `unjudged` in lens mode (a whole-repo
 * type sweep is the verify tool's job, not the per-write floor's).
 */
const MAX_CHANGED = 8;
const MAX_DIAG_REPORT = 20;

/** Walk from the changed file's directory up to repoRoot looking for a tsconfig.json. */
function nearestTsconfig(repoRoot: string, fromRel: string): string | null {
  const rootAbs = path.resolve(repoRoot);
  let dir = path.dirname(path.resolve(repoRoot, fromRel));
  for (;;) {
    const cand = path.join(dir, 'tsconfig.json');
    if (fs.existsSync(cand)) return cand;
    if (dir === rootAbs) return null;
    const parent = path.dirname(dir);
    if (parent === dir) return null; // hit fs root without finding repoRoot — stop
    dir = parent;
  }
}

/**
 * Compile `changed` (repo-relative) against `tsconfigPath`, serving `overrides`
 * (repo-relative → content) in-memory and everything else from disk. Returns the
 * count of ERROR-category syntactic+semantic diagnostics for each changed file, plus
 * the diagnostics themselves for the candidate pass's red message. A file whose
 * source cannot be loaded gets count -1 (→ the caller bails unjudged).
 */
function diagnoseChanged(
  repoRoot: string,
  tsconfigPath: string,
  changed: string[],
  overrides: Map<string, string>,
): { counts: Map<string, number>; diags: Map<string, ts.Diagnostic[]> } {
  const cfg = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(cfg.config ?? {}, ts.sys, path.dirname(tsconfigPath));
  const options: ts.CompilerOptions = {
    ...parsed.options,
    noEmit: true,
    skipLibCheck: true,
    skipDefaultLibCheck: true,
    incremental: false,
    composite: false,
    declaration: false,
    declarationMap: false,
    tsBuildInfoFile: undefined,
  };

  const absOf = (rel: string): string => path.normalize(path.resolve(repoRoot, rel));
  const overrideAbs = new Map<string, string>();
  for (const [rel, content] of overrides) overrideAbs.set(absOf(rel), content);

  const host = ts.createCompilerHost(options, true);
  const origGetSource = host.getSourceFile.bind(host);
  const origReadFile = host.readFile.bind(host);
  const origFileExists = host.fileExists.bind(host);
  host.readFile = (fileName) => {
    const ov = overrideAbs.get(path.normalize(fileName));
    return ov !== undefined ? ov : origReadFile(fileName);
  };
  host.fileExists = (fileName) =>
    overrideAbs.has(path.normalize(fileName)) || origFileExists(fileName);
  host.getSourceFile = (fileName, languageVersionOrOptions, onError, shouldCreate) => {
    const ov = overrideAbs.get(path.normalize(fileName));
    if (ov !== undefined) return ts.createSourceFile(fileName, ov, languageVersionOrOptions, true);
    return origGetSource(fileName, languageVersionOrOptions, onError, shouldCreate);
  };

  const program = ts.createProgram(changed.map(absOf), options, host);
  const counts = new Map<string, number>();
  const diags = new Map<string, ts.Diagnostic[]>();
  for (const rel of changed) {
    const sf = program.getSourceFile(absOf(rel));
    if (!sf) {
      counts.set(rel, -1);
      continue;
    }
    const errs = [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)].filter(
      (d) => d.category === ts.DiagnosticCategory.Error,
    );
    counts.set(rel, errs.length);
    diags.set(rel, errs);
  }
  return { counts, diags };
}

function toRed(repoRoot: string, rel: string, d: ts.Diagnostic): GateRed {
  let locus: string | undefined;
  if (d.file && typeof d.start === 'number') {
    const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
    locus = `L${line + 1}:${character + 1}`;
  }
  const msg = ts.flattenDiagnosticMessageText(d.messageText, ' ');
  return { file: rel, locus, fact: `type error TS${d.code}: ${msg}` };
}

const gate: GateModule = {
  name: 'type-soundness',
  kind: 'dynamic',
  appliesTo: (rel) => isCheckable(rel),
  run(ctx: GateContext): GateResult {
    const note = 'this write introduces no NEW TypeScript error (delta vs prior; pre-existing debt tolerated)';
    const changed = ctx.changedFiles.filter(isCheckable);
    if (changed.length === 0) return { gate: 'type-soundness', green: true, reds: [], note };
    if (changed.length > MAX_CHANGED) {
      return { gate: 'type-soundness', green: true, reds: [], note, unjudged: true };
    }

    // All changed files must share one tsconfig — refuse to mix projects.
    const configs = new Set<string>();
    for (const rel of changed) {
      const tc = nearestTsconfig(ctx.repoRoot, rel);
      if (!tc) return { gate: 'type-soundness', green: true, reds: [], note, unjudged: true };
      configs.add(tc);
    }
    if (configs.size !== 1) return { gate: 'type-soundness', green: true, reds: [], note, unjudged: true };
    const tsconfigPath = [...configs][0];

    // Candidate compile: changed files served from the overlay (overlay wins, else disk).
    const candOverrides = new Map<string, string>();
    for (const rel of changed) {
      const content = ctx.readFile(rel);
      if (content === null) return { gate: 'type-soundness', green: true, reds: [], note, unjudged: true };
      candOverrides.set(rel, content);
    }
    const cand = diagnoseChanged(ctx.repoRoot, tsconfigPath, changed, candOverrides);
    if ([...cand.counts.values()].some((c) => c < 0)) {
      return { gate: 'type-soundness', green: true, reds: [], note, unjudged: true };
    }
    // Fast path: a candidate with zero errors in every changed file cannot be a
    // regression regardless of prior — green without the second compile.
    if ([...cand.counts.values()].every((c) => c === 0)) {
      return { gate: 'type-soundness', green: true, reds: [], note };
    }

    // Prior compile (identical roots + host scoping) to apply delta semantics: the
    // changed files served from their pre-write disk bytes (ctx.priorOf). Structural
    // false-errors from single-file rooting appear in both passes and cancel here.
    const priorOverrides = new Map<string, string>();
    for (const rel of changed) priorOverrides.set(rel, ctx.priorOf(rel));
    const prior = diagnoseChanged(ctx.repoRoot, tsconfigPath, changed, priorOverrides);

    const reds: GateRed[] = [];
    for (const rel of changed) {
      const now = cand.counts.get(rel) ?? 0;
      const was = prior.counts.get(rel);
      // A prior file that failed to load (-1) cannot anchor a delta → skip honestly.
      if (was === undefined || was < 0) continue;
      if (now > was) {
        for (const d of cand.diags.get(rel) ?? []) {
          if (reds.length >= MAX_DIAG_REPORT) break;
          reds.push(toRed(ctx.repoRoot, rel, d));
        }
      }
    }
    return { gate: 'type-soundness', green: reds.length === 0, reds, note };
  },
};

export default gate;
