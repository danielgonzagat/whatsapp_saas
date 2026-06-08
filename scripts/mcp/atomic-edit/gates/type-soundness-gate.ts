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
const MAX_CHANGED = 256;
const MAX_DIAG_REPORT = 20;

const TEST_FILE_RE = /\.(spec|test)\.[cm]?[jt]sx?$/;
const TEST_CONFIG_NAMES = [
  'tsconfig.spec.json',
  'tsconfig.test.json',
  'tsconfig.jest.json',
  'tsconfig.vitest.json',
];

/**
 * The tsconfig that GOVERNS a file's real compilation. Walking up from the file's
 * directory: a TEST file (.spec/.test) prefers a sibling test config
 * (tsconfig.spec.json/…) — a project's app tsconfig typically EXCLUDES specs
 * (`**​/*spec.ts`) AND is stricter, so compiling a spec under it fabricates errors
 * the real `jest`/`vitest` run never sees (missing jest globals, noUnusedLocals,
 * noUncheckedIndexedAccess). A non-test file uses the nearest tsconfig.json.
 *
 * Name-based, NOT include-glob membership: a globbed file set goes stale for files
 * created mid-session (a brand-new file the glob predates would look "excluded"),
 * and a project's eslint tsconfig often globs specs too but with the wrong options —
 * so the test-config NAME is the faithful selector for how the file really compiles.
 */
function relOf(repoRoot: string, absPath: string): string {
  return path.relative(repoRoot, path.resolve(absPath)).replaceAll('\\', '/');
}

function existsInOverlayOrDisk(repoRoot: string, overlay: Map<string, string>, absPath: string): boolean {
  return overlay.has(relOf(repoRoot, absPath)) || fs.existsSync(absPath);
}

function selectConfig(repoRoot: string, fromRel: string, overlay: Map<string, string> = new Map()): string | null {
  const rootAbs = path.resolve(repoRoot);
  const isTest = TEST_FILE_RE.test(fromRel);
  let dir = path.dirname(path.resolve(repoRoot, fromRel));
  for (;;) {
    if (isTest) {
      for (const name of TEST_CONFIG_NAMES) {
        const cand = path.join(dir, name);
        if (existsInOverlayOrDisk(repoRoot, overlay, cand)) return cand;
      }
    }
    const primary = path.join(dir, 'tsconfig.json');
    if (existsInOverlayOrDisk(repoRoot, overlay, primary)) return primary;
    if (dir === rootAbs) return null;
    const parent = path.dirname(dir);
    if (parent === dir) return null; // hit fs root without finding repoRoot — stop
    dir = parent;
  }
}

/**
 * The ambient `@types/*` packages the project's REAL compiler would auto-include.
 *
 * TypeScript ≤5.x implicitly included every `@types/*` package found in the
 * effective type roots when `compilerOptions.types` was unset; TypeScript ≥6.0
 * dropped that implicit inclusion. This gate roots a fresh `createProgram` on just
 * the changed files (for single-file delta speed) and may run under a different TS
 * major than the project's own toolchain — so relying on the implicit behaviour
 * makes a normal `process.env` (a `@types/node` global the real `next build`
 * resolves) or a JSX global look UNDEFINED. That is a false positive, and the gate
 * doctrine is "sound under-approximation, NEVER a false positive".
 *
 * Fix: reproduce the legacy auto-inclusion explicitly. Enumerate the `@types/*`
 * package names under the effective type roots — anchored on the tsconfig's own
 * directory (via a throwaway options clone carrying `configFilePath`) so the
 * project's local `@types` resolve exactly as its real compiler sees them — and
 * pass them as `options.types`. This only ADDS the ambient globals the real
 * compiler already has: it can make a previously-false error resolve, never
 * suppress a genuine one, so it stays a sound under-approximation. A project that
 * pinned `types` itself keeps that explicit choice untouched.
 */
function ambientTypeNames(
  tsconfigPath: string,
  baseOptions: ts.CompilerOptions,
  host: ts.CompilerHost,
): string[] {
  if (Array.isArray(baseOptions.types)) return baseOptions.types;
  const roots =
    ts.getEffectiveTypeRoots({ ...baseOptions, configFilePath: tsconfigPath }, host) ?? [];
  const names = new Set<string>();
  for (const root of roots) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue; // a non-existent type root contributes nothing
    }
    for (const e of entries) {
      if (!(e.isDirectory() || e.isSymbolicLink()) || e.name.startsWith('.')) continue;
      if (e.name.startsWith('@')) {
        // scoped `@types/@scope/pkg` → the package name "@scope/pkg"
        try {
          for (const s of fs.readdirSync(path.join(root, e.name), { withFileTypes: true })) {
            if (s.isDirectory() || s.isSymbolicLink()) names.add(`${e.name}/${s.name}`);
          }
        } catch {
          // unreadable scoped dir → contributes nothing
        }
      } else {
        names.add(e.name);
      }
    }
  }
  return [...names];
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
  const readOverlayOrDisk = (fileName: string): string | undefined => {
    const rel = relOf(repoRoot, fileName);
    const overlayText = overrides.get(rel);
    return overlayText !== undefined ? overlayText : ts.sys.readFile(fileName);
  };
  const cfg = ts.readConfigFile(tsconfigPath, readOverlayOrDisk);
  const parsed = ts.parseJsonConfigFileContent(
    cfg.config ?? {},
    ts.sys,
    path.dirname(tsconfigPath),
  );
  // The project's ambient declaration files (global augmentations like `declare
  // global { interface Window { … } }`, `next-env.d.ts`). The real compiler loads
  // them via the tsconfig `include`; the bounded single-file program would miss
  // them and falsely red a global the real build resolves. Rooted below.
  const ambientDts = parsed.fileNames.filter((f) => f.endsWith('.d.ts'));
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

  // Match the project compiler's ambient @types before constructing the program
  // (see ambientTypeNames) so single-file rooting under TS ≥6.0 never reds a real
  // `process`/JSX/global as undefined — closing the type-soundness lens FP class.
  options.types = ambientTypeNames(tsconfigPath, options, host);
  // Anchor type-root resolution on the tsconfig's OWN directory so an explicitly
  // listed type (e.g. `types: ["node","jest"]`) resolves from the PROJECT's
  // node_modules/@types — not from the gate process's cwd, which in a monorepo
  // need not contain the package (`@types/jest` lives in `backend/node_modules`).
  // Without this, a respected `types` list still fails to load and every spec file
  // falsely reds `describe`/`it`/`jest` as undefined.
  options.typeRoots =
    ts.getEffectiveTypeRoots({ ...options, configFilePath: tsconfigPath }, host) ??
    options.typeRoots;
  // Root the project's ambient .d.ts alongside the changed files so global
  // augmentations resolve exactly as the real compiler sees them. The counts loop
  // below iterates only `changed`, so these declarations are loaded but never judged.
  const rootNames = [
    ...new Set([...changed.map(absOf), ...ambientDts.map((f) => path.normalize(f))]),
  ];
  const program = ts.createProgram(rootNames, options, host);
  const counts = new Map<string, number>();
  const diags = new Map<string, ts.Diagnostic[]>();
  for (const rel of changed) {
    const sf = program.getSourceFile(absOf(rel));
    if (!sf) {
      counts.set(rel, -1);
      continue;
    }
    const errs = [
      ...program.getSyntacticDiagnostics(sf),
      ...program.getSemanticDiagnostics(sf),
    ].filter((d) => d.category === ts.DiagnosticCategory.Error);
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

/**
 * Judge ONE group of changed files that share a governing tsconfig: candidate
 * compile, fast-path when every file is clean, else a prior compile to apply delta
 * semantics (only NEW errors red; pre-existing debt and single-file-rooting
 * structural false-errors cancel). Returns the reds, or an unjudged signal when the
 * bytes cannot be read/computed — never red-by-guess.
 */
function judgeGroup(
  ctx: GateContext,
  tsconfigPath: string,
  files: string[],
): { reds: GateRed[] } | { unjudgedReason: string } {
  const candOverrides = new Map(ctx.overlay);
  for (const rel of files) {
    const content = ctx.readFile(rel);
    if (content === null) return { unjudgedReason: `cannot read candidate bytes for '${rel}'` };
    candOverrides.set(rel, content);
  }
  const cand = diagnoseChanged(ctx.repoRoot, tsconfigPath, files, candOverrides);
  if ([...cand.counts.values()].some((c) => c < 0)) {
    return {
      unjudgedReason:
        'candidate TypeScript diagnostics could not be computed for at least one changed file',
    };
  }
  // Fast path: a candidate clean in every file cannot be a regression → green.
  if ([...cand.counts.values()].every((c) => c === 0)) return { reds: [] };

  const priorOverrides = new Map(ctx.overlay);
  for (const rel of files) priorOverrides.set(rel, ctx.priorOf(rel));
  const prior = diagnoseChanged(ctx.repoRoot, tsconfigPath, files, priorOverrides);

  const reds: GateRed[] = [];
  for (const rel of files) {
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
  return { reds };
}

const gate: GateModule = {
  name: 'type-soundness',
  kind: 'dynamic',
  appliesTo: (rel) => isCheckable(rel),
  run(ctx: GateContext): GateResult {
    const note =
      'this write introduces no NEW TypeScript error (delta vs prior; pre-existing debt tolerated)';
    const changed = ctx.changedFiles.filter(isCheckable);
    if (changed.length === 0) return { gate: 'type-soundness', green: true, reds: [], note };
    if (changed.length > MAX_CHANGED) {
      return {
        gate: 'type-soundness',
        green: true,
        reds: [],
        note,
        unjudged: true,
        unjudgedReason: `changed TypeScript surface has ${changed.length} files, above MAX_CHANGED=${MAX_CHANGED}`,
      };
    }

    // Group each changed file under the tsconfig that GOVERNS its real compilation
    // (a spec file under its test config, not the app config that excludes it), then
    // judge each group under its own options. Mixed scopes no longer bail unjudged —
    // each governing project is judged independently. No tsconfig at all → unjudged.
    const groups = new Map<string, string[]>();
    for (const rel of changed) {
      const tc = selectConfig(ctx.repoRoot, rel, ctx.overlay);
      if (!tc) {
        return {
          gate: 'type-soundness',
          green: true,
          reds: [],
          note,
          unjudged: true,
          unjudgedReason: `no tsconfig found for '${rel}'`,
        };
      }
      const arr = groups.get(tc);
      if (arr) arr.push(rel);
      else groups.set(tc, [rel]);
    }
    const reds: GateRed[] = [];
    for (const [tsconfigPath, files] of groups) {
      const r = judgeGroup(ctx, tsconfigPath, files);
      if ('unjudgedReason' in r) {
        return {
          gate: 'type-soundness',
          green: true,
          reds: [],
          note,
          unjudged: true,
          unjudgedReason: r.unjudgedReason,
        };
      }
      reds.push(...r.reds);
    }
    return { gate: 'type-soundness', green: reds.length === 0, reds, note };
  },
};

export default gate;
