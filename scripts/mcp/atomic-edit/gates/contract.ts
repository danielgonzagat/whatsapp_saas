/**
 * gates/contract.ts — the FROZEN gate interface.
 *
 * Every dissolvable protocol becomes ONE GateModule of this exact shape, so the
 * convergence crivo runs them uniformly in two directions:
 *   - WRITE direction (atomic_converge / atomicWrite floor): refuse the red.
 *   - READ direction (the lens): report the red over the whole repo.
 *
 * A gate states ONE exoneration-free fact: a wire resolves to a real thing, or it
 * dangles. No language server, no daemon, no human. `static` gates are pure
 * byte/edge facts; `dynamic` gates need execution and are honestly deferred.
 * A gate that cannot decide from the bytes it has returns `unjudged: true` —
 * never red-by-guess, never green-by-assumption.
 *
 * ALL gates use makeContext() below so resolution semantics never diverge.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

/** One atomic red: WHERE + the exact violated fact. The lens emits only these. */
export interface GateRed {
  /** repo-relative file the red lives in */
  file: string;
  /** atomic precision inside the file: "L<line>:<col>", byte span "b<start>-<end>", or a symbol name */
  locus?: string;
  /** the exact missing/violated fact, e.g. "import './x' resolves to nothing" */
  fact: string;
}

export interface GateResult {
  gate: string;
  green: boolean;
  reds: GateRed[];
  /** one-line statement of the invariant this gate enforces */
  note?: string;
  /** true = no relevant fact/property exists in this change; explicit green by non-applicability */
  notApplicable?: boolean;
  /** true = could not decide from the available bytes (honest); neither red nor green-by-assumption */
  unjudged?: boolean;
  /** concrete reason the gate could not decide; required by the lens for byte-auditable unknowns */
  unjudgedReason?: string;
}

export type GateKind = 'static' | 'dynamic';

export interface GateContext {
  repoRoot: string;
  /** candidate contents (relPath -> newText): the write-direction mutation set (read direction = whole repo) */
  overlay: Map<string, string>;
  /** relPaths being judged this run */
  changedFiles: string[];
  /** true when gates are reading committed bytes for an explicit lens scope, not admitting a write */
  lensMode?: boolean;
  /** resolve a repo-relative path against overlay OR disk */
  existsInTree(rel: string): boolean;
  /** overlay-aware read: overlay wins, else disk, else null */
  readFile(rel: string): string | null;
  /** shared relative-module resolver: returns the resolved repo-relative path, or null if it dangles / is bare */
  resolveRelImport(fromRel: string, spec: string): string | null;
  /**
   * Pre-write content for NEW-only delta semantics. WRITE direction: the file's
   * prior disk bytes (so a gate judges only wires THIS write introduces). LENS
   * (read) direction: always '' — committed bytes have no "prior", so every wire
   * is judged absolutely. Gates MUST read their before-content through this, not
   * via their own disk read, so the lens can make them absolute.
   */
  priorOf(rel: string): string;
}

export interface GateModule {
  /** unique kebab id (also the gate name in every GateResult) */
  name: string;
  /** static = pure byte/edge fact (runs in both directions); dynamic = needs execution (deferred, honest) */
  kind: GateKind;
  /** which files this gate judges (by extension / path shape) */
  appliesTo(rel: string): boolean;
  /** the fact, evaluated over the context */
  run(ctx: GateContext): GateResult | Promise<GateResult>;
  /**
   * OPTIONAL — the gate's own repair proposals for the reds it just reported.
   * Purely additive: a gate that does not implement this contributes no fixes and
   * the convergence operator simply skips it (no behaviour change for the 14
   * existing gates). A proposal is a BYTE-SPAN splice into a specific file
   * (`[byteStart, byteEnd) → replacement`) plus a human-readable `rationale`.
   * Honesty doctrine: a gate proposes a fix ONLY when the bytes determine it
   * unambiguously; when the discharge needs an intention decision the gate
   * proposes NOTHING (the convergence operator then reports needsIntent), never a
   * guessed edit. The operator validates and re-runs gates after applying, so a
   * proposal that does not actually drive the red to green is rejected, not trusted.
   */
  proposeFixes?(ctx: GateContext): { file: string; byteStart: number; byteEnd: number; replacement: string; rationale: string }[];
}

/**
 * The ONE shared context builder. Every gate consumes this, so the meaning of
 * "exists" / "resolves" is identical across all 9 gates and across both directions.
 */
export function makeContext(
  repoRoot: string,
  overlay: Map<string, string>,
  changedFiles: string[],
  lensMode = false,
): GateContext {
  const norm = (p: string): string => p.replaceAll('\\', '/');
  const priorOf = (rel: string): string => {
    if (lensMode) return ''; // lens judges committed bytes absolutely — no prior
    try {
      return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    } catch {
      return ''; // brand-new file → no prior → every wire is this write's claim
    }
  };
  const existsInTree = (rel: string): boolean =>
    overlay.has(norm(rel)) || fs.existsSync(path.join(repoRoot, rel));
  const readFile = (rel: string): string | null => {
    const o = overlay.get(norm(rel));
    if (o !== undefined) return o;
    try {
      return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    } catch {
      return null;
    }
  };
  // The candidate-extension probe, shared by the `.`-relative branch AND the
  // tsconfig path-alias branch so "resolves" means exactly one thing. `base` is a
  // repo-relative posix path with NO extension assumed; we try it verbatim then
  // the .ts/.tsx/.js/.jsx/.mjs/.cjs/.json + /index.* shapes a TS/bundler resolver
  // would, plus the .js→.ts/.tsx rewrite (TS lets you import a sibling .ts via a
  // '.js' specifier). Returns the FIRST candidate that exists in overlay-or-disk,
  // else null. This is the SAME list the relative branch always used — extracting
  // it is behaviour-preserving for `.` specifiers (byte-identical candidate set).
  const probeBase = (base: string): string | null => {
    const cands = [
      base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, `${base}.mjs`,
      `${base}.cjs`, `${base}.json`, `${base}/index.ts`, `${base}/index.tsx`, `${base}/index.js`,
    ];
    if (base.endsWith('.js')) cands.push(`${base.slice(0, -3)}.ts`, `${base.slice(0, -3)}.tsx`);
    return cands.find((c) => existsInTree(c)) ?? null;
  };
  // Find the package root (frontend/backend/worker) the importing file lives under,
  // for the KLOEL '@/*' -> '<package>/src/*' convention. null if the file is not
  // inside one of the three workspace packages (then '@/' cannot be expanded by
  // convention and only an explicit tsconfig `paths` entry can resolve it).
  const kloelPkgRoot = (fromRel: string): string | null => {
    for (const pkg of ['frontend', 'backend', 'worker']) {
      if (fromRel.startsWith(`${pkg}/`)) return pkg;
    }
    return null;
  };
  // Read the nearest tsconfig.json's compilerOptions.paths, walking UP from the
  // importing file's directory to repoRoot. Returns the parsed paths map (alias
  // pattern -> string[] of substitution patterns), each substitution made
  // repo-relative by joining it onto the tsconfig's own directory (+ baseUrl,
  // default '.'). Tolerant JSON parse (strips // /* */ comments and trailing
  // commas) so a real-but-comment-bearing tsconfig still yields its paths; a
  // tsconfig we cannot parse contributes NO aliases (→ unresolvable, not red).
  const tsconfigPathsFor = (fromRel: string): Record<string, string[]> => {
    let dir = path.posix.dirname(norm(fromRel));
    const stop = '.'; // repoRoot in posix-relative space
    // Walk up: fromDir, parent, ... until repoRoot.
    const visited = new Set<string>();
    for (;;) {
      if (visited.has(dir)) break;
      visited.add(dir);
      const cfgRel = dir === stop ? 'tsconfig.json' : `${dir}/tsconfig.json`;
      const raw = readFile(cfgRel);
      if (raw !== null) {
        try {
          const stripped = raw
            .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
            .replace(/(^|[^:])\/\/[^\n]*/g, '$1') // line comments (avoid http://)
            .replace(/,(\s*[}\]])/g, '$1'); // trailing commas
          const parsed = JSON.parse(stripped) as {
            compilerOptions?: { paths?: Record<string, string[]>; baseUrl?: string };
          };
          const co = parsed.compilerOptions ?? {};
          if (co.paths && typeof co.paths === 'object') {
            const baseUrl = typeof co.baseUrl === 'string' ? co.baseUrl : '.';
            const cfgDir = dir === stop ? '' : dir;
            const out: Record<string, string[]> = {};
            for (const [pat, subs] of Object.entries(co.paths)) {
              if (!Array.isArray(subs)) continue;
              out[pat] = subs
                .filter((s): s is string => typeof s === 'string')
                .map((s) => path.posix.normalize(path.posix.join(cfgDir, baseUrl, s)));
            }
            return out;
          }
        } catch {
          // unparseable tsconfig → no aliases from here; keep walking up
        }
      }
      if (dir === stop) break;
      const parent = path.posix.dirname(dir);
      dir = parent === '' || parent === '.' ? stop : parent;
    }
    return {};
  };
  // Expand a tsconfig `paths` alias for `spec`. Supports the two TS forms: an
  // exact key (no '*') and a single-'*' prefix pattern ("@/*": ["./src/*"]). The
  // '*' capture is substituted into each target; we probe targets in declared
  // order and return the first that resolves. Non-matching → null.
  const resolveTsconfigAlias = (fromRel: string, spec: string): string | null => {
    const paths = tsconfigPathsFor(fromRel);
    for (const [pat, subs] of Object.entries(paths)) {
      const star = pat.indexOf('*');
      if (star === -1) {
        if (pat !== spec) continue;
        for (const sub of subs) {
          const hit = probeBase(sub);
          if (hit) return hit;
        }
        continue;
      }
      const prefix = pat.slice(0, star);
      const suffix = pat.slice(star + 1);
      if (!spec.startsWith(prefix) || !spec.endsWith(suffix)) continue;
      const captured = spec.slice(prefix.length, spec.length - suffix.length);
      for (const sub of subs) {
        const target = path.posix.normalize(sub.replace('*', captured));
        const hit = probeBase(target);
        if (hit) return hit;
      }
    }
    return null;
  };
  const resolveRelImport = (fromRel: string, spec: string): string | null => {
    if (!spec.startsWith('.')) {
      // NON-'.' specifier. Was green-by-skip (return null). Now: try tsconfig
      // path-alias resolution (red class #6) BEFORE giving up. Two sources:
      //   (1) the nearest tsconfig.json's compilerOptions.paths — the general,
      //       config-driven truth (handles any project's alias, not just '@/').
      //   (2) KLOEL's '@/*' -> '<package>/src/*' convention — applied when tsconfig
      //       paths did not resolve it (backend/worker use '@/' by convention with
      //       no explicit `paths` entry). Keyed off the importing file's package.
      // If neither expands+probes to a real file, fall through to null. null now
      // means BOTH "bare package specifier (supply-chain's concern)" AND "alias
      // that expands to nothing (dangling — the connection gate will red it)". The
      // caller distinguishes by whether the spec is alias-shaped; here we only
      // state the resolution fact: an alias to a real file resolves, else null.
      const viaTsconfig = resolveTsconfigAlias(fromRel, spec);
      if (viaTsconfig !== null) return viaTsconfig;
      if (spec.startsWith('@/')) {
        const pkg = kloelPkgRoot(norm(fromRel));
        const rest = spec.slice(2);
        // Inside a package → that package's src. Outside (e.g. a script) → try all
        // three packages' src (sound: the '@/' could legitimately mean any of them
        // depending on which tsconfig governs the file's compilation).
        const roots = pkg ? [`${pkg}/src`] : ['frontend/src', 'backend/src', 'worker/src'];
        for (const r of roots) {
          const hit = probeBase(path.posix.normalize(`${r}/${rest}`));
          if (hit) return hit;
        }
      }
      return null; // bare specifier OR unresolvable alias → not a resolved relative fact
    }
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(norm(fromRel)), spec));
    return probeBase(base);
  };
  return { repoRoot, overlay, changedFiles, lensMode, existsInTree, readFile, resolveRelImport, priorOf };
}
