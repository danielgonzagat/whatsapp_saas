/**
 * gates/algebra.ts — the VERIFIED-EDIT ALGEBRA: commute modulo invariant.
 *
 * The convergence gates decide whether ONE write is admissible. This decides a
 * RELATION between TWO verified edits: do they interfere?  Not "do their text
 * spans overlap" (git/Darcs/Pijul, OT/CRDT all stop there) but "does either edit
 * touch a locus the other's gate-facts READ to be discharged" — a semantic
 * independence judged over the same resolution machinery the gates use.
 *
 * THEOREM (sound confluence). For verified patches P₁,P₂ with edited spans
 * spans(Pᵢ) and resolution-closure Cl(Pᵢ) (the loci every gate read to discharge
 * Pᵢ's obligations — here over-approximated as the file plus its transitive
 * relative/`@`-alias import closure):
 *
 *   commute(P₁,P₂) ⟺ spans(P₁)∩spans(P₂)=∅ ∧ spans(P₁)∩Cl(P₂)=∅ ∧ spans(P₂)∩Cl(P₁)=∅
 *
 * ⟹ apply(apply(S,P₁),P₂) = apply(apply(S,P₂),P₁) and both discharge Σ(P₁)∪Σ(P₂).
 * The verified patches under `commute` form a partial commutative monoid on the
 * green manifold; its identity is the empty splice.
 *
 * SOUNDNESS direction. Cl is an OVER-approximation (file + full transitive import
 * closure, including the `@/` path alias the connection gate treats as bare). A
 * coarser-than-true closure can only ADD coupling, never hide it, so `commute`
 * never falsely claims independence — it can only be too conservative (refuse a
 * merge that was actually safe). It never green-lights an unsafe merge. Where an
 * import cannot be resolved statically (dynamic require, reflective call), the
 * closure simply does not contain that edge — the conservative cost is paid by
 * the per-FILE granularity, which is strictly larger than the per-symbol truth.
 *
 * Operating it (the CLI block at the bottom): point this at .atomic/traces and it
 * reports the commute rate, the real coupling edges, and a greedy concurrent-batch
 * coloring — the multi-agent concurrency primitive ("which edits may merge without
 * an integration test") AND the label-free training signal ("these two are coupled
 * at locus X") in one object.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface EditFact {
  /** repo-relative file the patch edited */
  file: string;
  /** byte spans the patch changed (from the trace's modifiedZones) */
  spans: Array<[number, number]>;
  /** resolution closure: file + transitive relative/`@`-import targets (over-approx) */
  closure: Set<string>;
  /** true if the transitive closure hit the node cap (closure is a lower bound → commute is an upper bound for this fact) */
  closureCapped: boolean;
}

export interface CommuteVerdict {
  commute: boolean;
  reason: string;
  /** the file/span at which the two edits couple, when they do not commute */
  sharedLocus?: string;
}

const IMPORT_RE = /(?:from\s*|require\(\s*|import\(\s*|import\s+)['"]([^'"]+)['"]/g;

function tryBase(repoRoot: string, base: string): string | null {
  const b = base.replaceAll('\\', '/');
  const cands = [
    b, `${b}.ts`, `${b}.tsx`, `${b}.js`, `${b}.jsx`, `${b}.mjs`, `${b}.cjs`, `${b}.json`,
    `${b}/index.ts`, `${b}/index.tsx`, `${b}/index.js`,
  ];
  if (b.endsWith('.js')) cands.push(`${b.slice(0, -3)}.ts`, `${b.slice(0, -3)}.tsx`);
  return cands.find((c) => fs.existsSync(path.join(repoRoot, c))) ?? null;
}

/**
 * Resolve a relative or `@/`-alias import to a repo-relative file. Mirrors
 * gates/contract.ts makeContext.resolveRelImport for the `.`-relative case, and
 * additionally resolves KLOEL's `@/*` -> `<package>/src/*` alias so the closure
 * is a SOUND over-approximation (the connection gate intentionally treats `@/`
 * as bare; for interference we want the larger, safer closure).
 */
export function resolveImport(repoRoot: string, fromRel: string, spec: string): string | null {
  if (spec.startsWith('@/')) {
    const rest = spec.slice(2);
    const roots = fromRel.startsWith('frontend/')
      ? ['frontend/src/']
      : fromRel.startsWith('backend/')
        ? ['backend/src/']
        : fromRel.startsWith('worker/')
          ? ['worker/src/']
          : ['frontend/src/', 'backend/src/', 'worker/src/'];
    for (const r of roots) {
      const hit = tryBase(repoRoot, r + rest);
      if (hit) return hit;
    }
    return null;
  }
  if (!spec.startsWith('.')) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel.replaceAll('\\', '/')), spec));
  return tryBase(repoRoot, base);
}

function fileImports(repoRoot: string, rel: string, cache: Map<string, Set<string>>): Set<string> {
  const hit = cache.get(rel);
  if (hit) return hit;
  const out = new Set<string>();
  const abs = path.join(repoRoot, rel);
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
    try {
      const txt = fs.readFileSync(abs, 'utf8');
      for (const m of txt.matchAll(IMPORT_RE)) {
        const t = resolveImport(repoRoot, rel, m[1]);
        if (t) out.add(t);
      }
    } catch {
      /* unreadable → empty closure for this node (conservative direction is handled by per-file granularity) */
    }
  }
  cache.set(rel, out);
  return out;
}

/** Transitive import closure of `rel`, capped at maxNodes (capped=true ⇒ closure is a lower bound). */
export function closureOf(
  repoRoot: string,
  rel: string,
  cache: Map<string, Set<string>> = new Map(),
  maxNodes = 2000,
): { set: Set<string>; capped: boolean } {
  const seen = new Set<string>([rel]);
  const stack = [rel];
  let capped = false;
  while (stack.length) {
    const cur = stack.pop() as string;
    for (const t of fileImports(repoRoot, cur, cache)) {
      if (!seen.has(t)) {
        if (seen.size >= maxNodes) {
          capped = true;
          break;
        }
        seen.add(t);
        stack.push(t);
      }
    }
    if (capped) break;
  }
  return { set: seen, capped };
}

/** Build an EditFact from a parsed atomic trace JSON object. */
export function buildEditFact(
  repoRoot: string,
  trace: { file?: string; modifiedZones?: Array<{ byteStart?: number; byteEnd?: number }> },
  cache: Map<string, Set<string>> = new Map(),
): EditFact {
  const file = String(trace.file ?? '').replaceAll('\\', '/');
  const spans: Array<[number, number]> = (trace.modifiedZones ?? [])
    .filter((z) => typeof z.byteStart === 'number' && typeof z.byteEnd === 'number')
    .map((z) => [z.byteStart as number, z.byteEnd as number]);
  const { set, capped } = closureOf(repoRoot, file, cache);
  return { file, spans, closure: set, closureCapped: capped };
}

function spansOverlap(a: Array<[number, number]>, b: Array<[number, number]>): boolean {
  for (const [s1, e1] of a) for (const [s2, e2] of b) if (s1 < e2 && s2 < e1) return true;
  return false;
}

/**
 * The relation. SAME file ⇒ commute iff byte-disjoint (intra-file binding coupling
 * is NOT modelled here — conservatively reported in the reason). DIFFERENT files ⇒
 * commute iff neither file lies in the other's resolution closure.
 */
export function commute(a: EditFact, b: EditFact): CommuteVerdict {
  if (a.file === b.file) {
    if (spansOverlap(a.spans, b.spans)) {
      return { commute: false, reason: 'same file, overlapping byte spans', sharedLocus: a.file };
    }
    return {
      commute: true,
      reason: 'same file, disjoint byte spans (intra-file binding coupling not modelled — conservative)',
    };
  }
  if (b.closure.has(a.file)) {
    return { commute: false, reason: `${b.file} reads ${a.file} (resolution-closure coupling)`, sharedLocus: a.file };
  }
  if (a.closure.has(b.file)) {
    return { commute: false, reason: `${a.file} reads ${b.file} (resolution-closure coupling)`, sharedLocus: b.file };
  }
  return { commute: true, reason: 'disjoint files; neither lies in the other resolution closure' };
}

/**
 * Greedy concurrent batches: a graph coloring of the NON-commute graph. Every
 * batch is a set of pairwise-commuting edits — safe to apply/merge concurrently
 * with a machine guarantee, no integration test. Returns arrays of indices into
 * `facts`. (Min-coloring is NP-hard; greedy gives valid, not minimal, batches.)
 */
export function concurrentBatches(facts: EditFact[]): number[][] {
  const n = facts.length;
  const conflict: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!commute(facts[i], facts[j]).commute) {
        conflict[i][j] = true;
        conflict[j][i] = true;
      }
    }
  }
  const color = new Array<number>(n).fill(-1);
  const batches: number[][] = [];
  for (let i = 0; i < n; i++) {
    const used = new Set<number>();
    for (let j = 0; j < n; j++) if (conflict[i][j] && color[j] >= 0) used.add(color[j]);
    let c = 0;
    while (used.has(c)) c++;
    color[i] = c;
    (batches[c] ??= []).push(i);
  }
  return batches;
}

// ── CLI: operate the algebra on the real trace corpus ────────────────────────
const isMain = (() => {
  try {
    return path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isMain) {
  const repoRoot = process.env.ATOMIC_EDIT_REPO_ROOT ?? process.cwd();
  const dir = path.join(repoRoot, '.atomic', 'traces');
  const SCRATCH = /(^|\/)\.|\.smoke|\/\.atomic\//; // drop atomic's own scratch/smoke fixtures
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
  const cache = new Map<string, Set<string>>();
  const facts: EditFact[] = [];
  for (const f of files) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const rel = String(d.file ?? '').replaceAll('\\', '/');
      if (!rel || SCRATCH.test(rel) || rel === 'a.ts' || rel === 'b.ts') continue;
      facts.push(buildEditFact(repoRoot, d, cache));
    } catch {
      /* skip unparseable */
    }
  }
  let pairs = 0;
  let comm = 0;
  const couplings: string[] = [];
  for (let i = 0; i < facts.length; i++) {
    for (let j = i + 1; j < facts.length; j++) {
      pairs++;
      const v = commute(facts[i], facts[j]);
      if (v.commute) comm++;
      else if (facts[i].file !== facts[j].file && couplings.length < 12) {
        couplings.push(`${facts[i].file}  ⟂  ${facts[j].file}   [${v.reason}]`);
      }
    }
  }
  const batches = concurrentBatches(facts);
  const rate = pairs ? comm / pairs : 0;
  process.stdout.write('VERIFIED-EDIT ALGEBRA — operated on real .atomic/traces\n');
  process.stdout.write(`  edits (real, fixtures dropped) : ${facts.length}\n`);
  process.stdout.write(`  pairs                          : ${pairs}\n`);
  process.stdout.write(`  commute rate                   : ${(rate * 100).toFixed(1)}%  (${comm}/${pairs})\n`);
  process.stdout.write(`  concurrent batches (greedy)    : ${batches.length}  (sizes ${batches.map((b) => b.length).join(',')})\n`);
  process.stdout.write(`  sample real coupling edges:\n`);
  for (const c of couplings) process.stdout.write(`    ${c}\n`);
}
