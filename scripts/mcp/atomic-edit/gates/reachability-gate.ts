/**
 * gates/reachability-gate.ts — the exoneration-free REACHABILITY fact, at the
 * import-edge floor (LCOV static half).
 *
 * connection-gate asks "does the wire this file SENDS resolve?". This gate asks
 * the dual, INBOUND question: "is this file REACHED by any wire from a root?".
 * A source file that no entrypoint, route, test, or index can reach over the
 * import (+ best-effort call) edge set is an ORPHAN island — dead static weight
 * that LCOV's static half (structuralGraphCoverage = connected/relevant,
 * orphanFiles = the residue) flags before any line is ever hit.
 *
 * The fact is a directed-edge fact, not a heuristic — built ONLY from real
 * relative-import edges resolved through the shared resolveRelImport (so "reaches"
 * means identically the same thing here as everywhere in the crivo). No language
 * server, no daemon, no guess.
 *
 * Semantics (universal, language-agnostic, both directions):
 *  - Only SOURCE files are judged (.ts/.tsx/.js/.jsx/.mjs/.cjs). Non-source has no
 *    import-reachability fact → not judged.
 *  - ROOTS are self-justifying reach origins: entrypoints (index/main/server),
 *    route files (Next app/pages, NestJS *.controller / *.module), and the test
 *    surface (*.spec / *.test / *.proof / *.e2e). A root is reachable by fiat —
 *    it is how the program (or its harness) is entered. Reachability is the
 *    forward-import closure of the root set.
 *  - WRITE direction (the only claim a write makes): a write is RED only if it
 *    NEWLY orphans a file — i.e. THIS write removes the last inbound edge that
 *    kept a changed non-root file reachable, or it introduces a brand-new
 *    non-root file that nothing in the resolvable tree reaches. A file that was
 *    ALREADY an orphan before the write never blocks an unrelated edit (exactly
 *    mirrors connection-gate's "only NEW wires are this write's claim").
 *  - If the gate cannot see enough of the tree to decide an inbound edge exists
 *    (e.g. the only importer would be a file outside overlay+disk), it returns
 *    unjudged for that file rather than red-by-guess.
 *
 * Ceiling (brutal): reachable ≠ exercised ≠ correct. A file can be import-reached
 * yet never run a line (dead branch, never-instantiated class) — that is the
 * DYNAMIC line-hit gate's job, not this one. This gate proves the STATIC half of
 * LCOV only: the file is on the import graph, period.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  type GateModule,
  type GateContext,
  type GateResult,
  type GateRed,
} from './contract.js';
import { importSpecs } from './perception.js';

const SOURCE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const ROOT_BASENAME_RE = /^(index|main|server|app|cli|bootstrap|setup)\.(ts|tsx|js|jsx|mjs|cjs)$/;
const TEST_SURFACE_RE = /\.(spec|test|proof|e2e|stories|bench)\.(ts|tsx|js|jsx|mjs|cjs)$/;
const NEST_ROOT_RE = /\.(controller|module|gateway|resolver|processor|consumer|cron|command|seed)\.(ts|tsx|js|jsx|mjs|cjs)$/;
const OPERATIONAL_SCRIPT_DIR_RE = /(^|\/)(scripts|bin|tools)\//;
const OPERATIONAL_SCRIPT_BASENAME_RE = /^(build|smoke(?:[-.].*)?|benchmark|bench|operational-use|demo(?:[-.].*)?|trace-coverage-audit|worker-scope-check|audit-atomicity|bypass-report|.*(?:-hook|-launcher|-broker)(?:[-.].*)?)\.(ts|tsx|js|jsx|mjs|cjs)$/;
// Next.js routing roots: a segment file that the framework loads by convention.
const NEXT_ROUTE_BASENAME_RE = /^(page|layout|route|loading|error|not-found|template|default|middleware|head|sitemap|robots|opengraph-image|icon|apple-icon|manifest)\.(ts|tsx|js|jsx|mjs)$/;
const NEXT_ROUTE_DIR_RE = /(^|\/)(app|pages)\//;

function isOperationalScriptRoot(norm: string, base: string): boolean {
  return OPERATIONAL_SCRIPT_DIR_RE.test(norm) && OPERATIONAL_SCRIPT_BASENAME_RE.test(base);
}

/** A source file is a ROOT iff the program/harness enters it by convention, not via an import. */
function isRoot(rel: string): boolean {
  const norm = rel.replaceAll('\\', '/');
  const base = norm.slice(norm.lastIndexOf('/') + 1);
  if (TEST_SURFACE_RE.test(base)) return true; // the test/proof harness IS a root
  if (ROOT_BASENAME_RE.test(base)) return true; // index/main/server/app entrypoints
  if (isOperationalScriptRoot(norm, base)) return true; // scripts/bin/tools operational roots
  if (NEST_ROOT_RE.test(base)) return true; // NestJS DI roots (loaded by the framework, never imported by app code)
  if (NEXT_ROUTE_DIR_RE.test(norm) && NEXT_ROUTE_BASENAME_RE.test(base)) return true; // Next.js file-system routes
  return false;
}

function isSource(rel: string): boolean {
  return SOURCE_RE.test(rel);
}

/**
 * Pull every import/require specifier out of source text through the FROZEN
 * perception organ. perception.importSpecs reads ONLY real `import_statement` /
 * `call_expression` AST nodes, so a `from './x'` that lives inside a comment, a
 * string literal, or a template literal is a `comment`/`string`/`template_string`
 * node — never an import node — and is never returned. That is the string/comment
 * false-positive (which the old whole-file regex extracted as a phantom inbound
 * edge, hiding a real orphan) removed by construction.
 *
 * Returns `null` when no grammar is available for the file's language — the caller
 * then degrades honestly to `unjudged` instead of treating the file as
 * import-less (which would falsely orphan everything it actually imports).
 */
async function importSpecifiers(content: string, rel: string): Promise<string[] | null> {
  return importSpecs(content, rel);
}

/**
 * Enumerate every source file currently in the tree under repoRoot that the gate
 * can SEE (overlay wins per-path, disk fills the rest), bounded so a giant repo
 * never wedges the gate. This is the universe whose inbound edges we scan to ask
 * "does anything reach `target`?". Bounded ⇒ on a cap we report unjudged, never a
 * false orphan.
 */
function normalizeSourceRoot(rel: string): string {
  const normalized = rel.replaceAll('\\', '/').replace(/\/+$/g, '');
  return normalized === '.' ? '' : normalized;
}

function isWithinSourceRoot(rel: string, root: string): boolean {
  const file = rel.replaceAll('\\', '/');
  const scope = normalizeSourceRoot(root);
  return scope === '' || file === scope || file.startsWith(`${scope}/`);
}

function lensScopedSourceRoots(changedFiles: string[]): string[] {
  const sourceFiles = changedFiles.map((rel) => rel.replaceAll('\\', '/')).filter(isSource);
  if (sourceFiles.length === 0) return [''];
  const knownRoots = ['scripts/mcp/atomic-edit', 'backend', 'frontend', 'worker'];
  for (const root of knownRoots) {
    if (sourceFiles.every((rel) => isWithinSourceRoot(rel, root))) return [root];
  }
  return [''];
}

function enumerateSourceFiles(
  repoRoot: string,
  overlay: Map<string, string>,
  cap: number,
  roots: string[] = [''],
): { files: string[]; capped: boolean } {
  const SKIP = new Set(['node_modules', '.git', 'dist', '.next', 'build', 'coverage', '.atomic', '.turbo', 'vendor', '.cache']);
  const scopeRoots = roots.length > 0 ? roots.map(normalizeSourceRoot) : [''];
  const seen = new Set<string>();
  for (const rel of overlay.keys()) {
    const normalized = rel.replaceAll('\\', '/');
    if (isSource(normalized) && scopeRoots.some((root) => isWithinSourceRoot(normalized, root))) seen.add(normalized);
  }
  let capped = false;
  const walk = (dirRel: string): void => {
    if (seen.size >= cap) { capped = true; return; }
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(path.join(repoRoot, dirRel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (seen.size >= cap) { capped = true; return; }
      if (SKIP.has(e.name)) continue;
      const childRel = dirRel ? `${dirRel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        walk(childRel);
      } else if (e.isFile() && isSource(childRel)) {
        seen.add(childRel.replaceAll('\\', '/'));
      }
    }
  };
  for (const root of scopeRoots) walk(root);
  return { files: [...seen], capped };
}

/**
 * Build the forward import edge set (from → resolved-to) over a file universe,
 * using the FROZEN perception organ for extraction and ONLY the shared
 * resolveRelImport for resolution, so "reaches" is byte-identical to the rest of
 * the crivo. Returns adjacency (caller → set of resolved targets) AND the reverse
 * adjacency (target → set of files that import it) — the inbound view is what the
 * orphan fact needs.
 *
 * Every specifier comes from a real `import_statement` / `call_expression` AST
 * node (perception.importSpecs), so a `from './x'` sitting in a comment, a string,
 * or a template literal is NOT an edge — closing the string/comment phantom-edge
 * false-positive of the old whole-file regex.
 *
 * `unperceivable` is set true if ANY source file in the visible universe has no
 * grammar (perception returned null). When that happens the inbound surface is
 * incomplete (we cannot list a file's real imports), so we cannot prove the
 * absence of an inbound edge → the caller degrades the whole run to unjudged
 * rather than falsely orphaning files those unperceivable importers reference.
 */
async function buildEdges(
  ctx: GateContext,
  universe: string[],
): Promise<{
  forward: Map<string, Set<string>>;
  reverse: Map<string, Set<string>>;
  unperceivable: boolean;
}> {
  const forward = new Map<string, Set<string>>();
  const reverse = new Map<string, Set<string>>();
  let unperceivable = false;
  for (const from of universe) {
    const content = ctx.readFile(from);
    if (content === null) continue;
    const specs = await importSpecifiers(content, from);
    if (specs === null) {
      // No grammar for this language → we cannot read its real import edges. Mark
      // the surface incomplete; the run degrades to unjudged (never a false orphan).
      unperceivable = true;
      forward.set(from, forward.get(from) ?? new Set<string>());
      continue;
    }
    const outs = forward.get(from) ?? new Set<string>();
    for (const spec of specs) {
      const to = ctx.resolveRelImport(from, spec);
      if (to === null) continue; // bare specifier or dangling — not a reach edge here
      outs.add(to);
      const ins = reverse.get(to) ?? new Set<string>();
      ins.add(from);
      reverse.set(to, ins);
    }
    forward.set(from, outs);
  }
  return { forward, reverse, unperceivable };
}

/** BFS the forward-import closure of the ROOT set → the set of reachable source files. */
const BUILD_MANIFEST_BASENAME_RE = /^build\.(mjs|cjs|js|ts)$/;
const BUILD_ENTRY_LITERAL_RE = /['"]([^'"]+\.(?:ts|tsx|js|jsx|mjs|cjs))['"]/g;

function buildManifestCandidates(universe: string[], changedFiles: string[]): string[] {
  const candidates = new Set<string>();
  const add = (rel: string): void => {
    const norm = rel.replaceAll('\\', '/');
    const base = norm.slice(norm.lastIndexOf('/') + 1);
    if (BUILD_MANIFEST_BASENAME_RE.test(base)) candidates.add(norm);
  };
  for (const rel of universe) add(rel);
  for (const rel of changedFiles) {
    let dir = normalizeSourceRoot(rel);
    while (true) {
      for (const base of ['build.mjs', 'build.cjs', 'build.js', 'build.ts']) add(dir ? `${dir}/${base}` : base);
      const slash = dir.lastIndexOf('/');
      if (slash < 0) break;
      dir = dir.slice(0, slash);
    }
  }
  return [...candidates];
}

function buildDeclaredSourceRoots(ctx: GateContext, universe: string[]): Set<string> {
  const universeSet = new Set(universe);
  const roots = new Set<string>();
  for (const manifest of buildManifestCandidates(universe, ctx.changedFiles)) {
    const content = ctx.readFile(manifest);
    if (content === null || !/\bENTRY\b/.test(content)) continue;
    const dir = manifest.includes('/') ? manifest.slice(0, manifest.lastIndexOf('/')) : '';
    for (const match of content.matchAll(BUILD_ENTRY_LITERAL_RE)) {
      const spec = match[1].replaceAll('\\', '/');
      if (spec.startsWith('/') || spec.includes('://')) continue;
      const rel = path.posix.normalize(dir ? `${dir}/${spec}` : spec);
      if (universeSet.has(rel)) roots.add(rel);
    }
  }
  return roots;
}

function reachableFromRoots(universe: string[], forward: Map<string, Set<string>>, extraRoots = new Set<string>()): Set<string> {
  const reached = new Set<string>();
  const queue: string[] = [];
  for (const f of universe) {
    if (isRoot(f) || extraRoots.has(f)) {
      reached.add(f);
      queue.push(f);
    }
  }
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const next of forward.get(cur) ?? []) {
      if (!reached.has(next)) {
        reached.add(next);
        queue.push(next);
      }
    }
  }
  return reached;
}

const MAX_UNIVERSE = 12000;

const reachabilityGate: GateModule = {
  name: 'reachability',
  kind: 'static',
  appliesTo: (rel) => isSource(rel),

  async run(ctx: GateContext): Promise<GateResult> {
    const note =
      'every changed non-root source file is reachable from a root (entrypoint/route/test) over the import-edge closure';

    // 1. The file universe the gate can SEE (overlay + bounded disk walk).
    const sourceRoots = ctx.lensMode ? lensScopedSourceRoots(ctx.changedFiles) : [''];
    const scopeLabel = sourceRoots.length === 1 && sourceRoots[0] !== '' ? ` in source root '${sourceRoots[0]}'` : '';
    const { files: universe, capped } = enumerateSourceFiles(ctx.repoRoot, ctx.overlay, MAX_UNIVERSE, sourceRoots);
    if (capped) {
      // Cannot enumerate the full inbound surface ⇒ cannot prove an absence of
      // inbound edges ⇒ refuse to guess. Honest unjudged, never a false orphan.
      return {
        gate: this.name,
        green: true,
        reds: [],
        note,
        unjudged: true,
        unjudgedReason: `source universe${scopeLabel} exceeded ${MAX_UNIVERSE} files; cannot prove absence of inbound import edges`,
      };
    }

    // 2. Edge set + root-closure reachability over the WHOLE visible tree, built
    //    through the perception organ (token-correct: comment/string/template
    //    `from './x'` is never a phantom inbound edge).
    const { forward, reverse, unperceivable } = await buildEdges(ctx, universe);
    if (unperceivable) {
      // At least one visible source file has no grammar ⇒ its real import edges are
      // unreadable ⇒ we cannot prove the absence of an inbound edge for any target.
      // Honest unjudged, never a guessed orphan.
      return {
        gate: this.name,
        green: true,
        reds: [],
        note,
        unjudged: true,
        unjudgedReason: 'at least one visible source file has no grammar/perception; import edges are unreadable',
      };
    }
    const buildRoots = buildDeclaredSourceRoots(ctx, universe);
    const reachable = reachableFromRoots(universe, forward, buildRoots);

    // 3. WRITE-direction claim: judge ONLY the changed files, and only the ones
    //    THIS write could have orphaned — a pre-existing orphan never blocks an
    //    unrelated edit. A changed file is RED iff it is a non-root source file
    //    with ZERO inbound edges in the visible tree AND it is not reachable from
    //    any root. (Zero inbound + not-a-root ⇒ no path can possibly reach it.)
    const reds: GateRed[] = [];
    const targets = ctx.changedFiles.length > 0 ? ctx.changedFiles : universe;
    for (const rel of targets) {
      const f = rel.replaceAll('\\', '/');
      if (!isSource(f)) continue; // not a source file → no reachability fact
      if (isRoot(f)) continue; // a root is reachable by fiat (entry by convention)
      if (reachable.has(f)) continue; // reached from some root → connected, green
      const inbound = reverse.get(f);
      const inboundCount = inbound ? inbound.size : 0;
      if (inboundCount === 0) {
        // Nothing in the visible tree imports it and it is not a root → orphan
        // island. The exoneration-free fact: no edge reaches this file.
        reds.push({
          file: f,
          locus: f,
          fact: `orphan: no root (entrypoint/route/test) reaches '${f}' over the import-edge closure (0 inbound import edges)`,
        });
      } else {
        // It HAS inbound edges but the importer(s) are themselves unreachable from
        // any root (a dead subgraph). The static fact is still "not reachable from
        // a root", but proving the importer is truly dead can depend on files we
        // may not see (the only live importer could be outside our scope) ⇒ be
        // honest: this branch is a softer signal. We still flag it, because every
        // inbound edge is from a visible file and none of them is root-reachable.
        const importers = [...(inbound ?? [])].slice(0, 3).join(', ');
        reds.push({
          file: f,
          locus: f,
          fact: `orphan-subgraph: '${f}' is imported only by root-unreachable file(s) [${importers}] — no root reaches it over the import-edge closure`,
        });
      }
    }

    return { gate: this.name, green: reds.length === 0, reds, note };
  },
};

export default reachabilityGate;
