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
  /** true = could not decide from the available bytes (honest); neither red nor green-by-assumption */
  unjudged?: boolean;
}

export type GateKind = 'static' | 'dynamic';

export interface GateContext {
  repoRoot: string;
  /** candidate contents (relPath -> newText): the write-direction mutation set (read direction = whole repo) */
  overlay: Map<string, string>;
  /** relPaths being judged this run */
  changedFiles: string[];
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
  const resolveRelImport = (fromRel: string, spec: string): string | null => {
    if (!spec.startsWith('.')) return null; // bare specifier → supply-chain gate's concern, not a relative fact
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(norm(fromRel)), spec));
    const cands = [
      base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, `${base}.mjs`,
      `${base}.cjs`, `${base}.json`, `${base}/index.ts`, `${base}/index.tsx`, `${base}/index.js`,
    ];
    if (base.endsWith('.js')) cands.push(`${base.slice(0, -3)}.ts`, `${base.slice(0, -3)}.tsx`);
    return cands.find((c) => existsInTree(c)) ?? null;
  };
  return { repoRoot, overlay, changedFiles, existsInTree, readFile, resolveRelImport, priorOf };
}
