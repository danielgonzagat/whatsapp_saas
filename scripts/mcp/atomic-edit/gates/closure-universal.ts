/**
 * gates/closure-universal.ts — the UNIVERSAL resolution-closure provider.
 *
 * algebra.ts's `closureOf` over-approximates the loci a verified edit's gate-facts
 * READ, but only for TypeScript/JavaScript relative + `@/`-alias imports. The
 * commute theorem is language-agnostic in its statement — `commute(P₁,P₂) ⟺
 * spans disjoint ∧ neither span hits the other's closure Cl(·)` — but the closure
 * is only as universal as its import resolver. This file generalises Cl along TWO
 * axes so the SAME algebra works on any language and any gate, satisfying the
 * frozen `ClosureProvider` contract (algebra.ts) the integrator injects into
 * `commute`:
 *
 *   (a) ACROSS LANGUAGES. A per-language import extractor (py `import`/`from … import`,
 *       go `import "…"`, ruby `require`/`require_relative`, rust `mod`, java/c/cpp
 *       includes, plus the TS/JS forms algebra already knew) resolves a relative /
 *       sibling specifier to a repo-relative file with the right extension family.
 *       A token-correct AST variant (read-only `native-bridge.astNodes`) drops
 *       specifiers that live inside a string/comment; a regex variant is the
 *       always-available fallback when no grammar is loaded.
 *
 *   (b) ACROSS GATES. A per-gate closure adds NON-FILE loci to the set — an HTTP
 *       route string for the contract-edge gate, an event name for the telemetry
 *       gate. Two edits in DIFFERENT files that both touch route `POST /checkout`
 *       (or emit/consume the same event) couple at that virtual locus, which a
 *       file-only closure cannot express. The virtual locus is namespaced
 *       (`route:…`, `event:…`) so it can never collide with a real file path.
 *
 * SOUNDNESS — the SAME direction algebra.ts proves. Every generalisation here is an
 * OVER-approximation of the true read set:
 *   • The regex extractor matches a superset of real import specifiers (it can match
 *     a specifier-shaped token in an unparsed context), so it can only ADD coupling
 *     edges, never hide one. The AST extractor is token-correct (tighter) but still
 *     conservative: when no grammar is available it RETURNS NULL so the caller falls
 *     back to regex — it never silently returns a smaller-than-true set.
 *   • An UNKNOWN language yields the reflexive closure `{rel}` plus an `unjudged`
 *     note. This is the honest floor: we do not pretend to know its imports (a
 *     wrong-but-confident `{}` would let commute() falsely call two coupled edits
 *     independent). Reflexive-only means commute() couples such an edit ONLY with
 *     another edit to the very same file (always correct) and treats it as
 *     independent of all others — the conservative cost being paid, again, at
 *     per-file granularity, exactly as algebra.ts documents for unresolved edges.
 *   • A capped transitive walk sets `capped: true`, so the set is a LOWER bound and
 *     commute computed against it is an UPPER bound — the conservative pole the
 *     theorem requires (capped ⇒ may refuse a safe merge, never admit an unsafe one).
 *
 * HONESTY CEILING. This provides the CLOSURE (which loci an edit's gate-facts could
 * read), not a proof that any gate actually read them. It can be too coarse (refuse a
 * safe merge) but never too fine (admit an unsafe merge). For an unknown language it
 * is explicitly UNJUDGED beyond reflexivity — never red-by-guess, never green-by-
 * assumption. It does not parse semantics (a dynamic `require(variable)`, a
 * reflective route registration) — those edges are simply absent, and the absence is
 * conservative because per-file granularity is strictly coarser than per-symbol truth.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ClosureProvider } from './algebra.js';
import { astNodes } from '../native-bridge.js';

// ── language detection (mirrors native-bridge.ts EXT, kept local so this file has
//    no dependency on a hot engine surface) ───────────────────────────────────────
const EXT_LANG: Record<string, string> = {
  '.py': 'python',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.ts': 'typescript', '.tsx': 'tsx',
  '.go': 'go', '.rb': 'ruby', '.rs': 'rust', '.java': 'java',
  '.c': 'c', '.h': 'c', '.cc': 'cpp', '.cpp': 'cpp', '.hpp': 'cpp', '.hh': 'cpp',
};

/** The language alias for a repo-relative path, or null if the extension is unknown. */
export function langOf(rel: string): string | null {
  return EXT_LANG[path.extname(rel).toLowerCase()] ?? null;
}

/** The set of languages this universal closure can resolve relative imports for. */
export function supportedLanguages(): string[] {
  return Array.from(new Set(Object.values(EXT_LANG))).sort();
}

// ── per-language relative-specifier extraction (regex layer — always available) ──
//
// Each entry yields the RAW specifier strings a file references. We only keep
// relative/sibling forms here; resolveSpec decides which resolve to a real file.
// Patterns are deliberately permissive supersets (the conservative SOUNDNESS pole).
const SPEC_RES: Record<string, RegExp[]> = {
  // JS/TS — same forms algebra.ts knows, restated so this file is self-contained.
  typescript: [/(?:from\s*|require\(\s*|import\(\s*|import\s+)['"]([^'"]+)['"]/g],
  tsx: [/(?:from\s*|require\(\s*|import\(\s*|import\s+)['"]([^'"]+)['"]/g],
  javascript: [/(?:from\s*|require\(\s*|import\(\s*|import\s+)['"]([^'"]+)['"]/g],
  // Python — `import a.b`, `from a.b import x`, `from . import x`, `from .pkg import x`.
  python: [
    /^\s*from\s+([.\w][.\w]*)\s+import\b/gm,
    /^\s*import\s+([.\w][.\w]*)/gm,
  ],
  // Go — `import "path"` and grouped `import ( "a" \n "b" )`.
  go: [/import\s+(?:[\w.]+\s+)?["`]([^"`]+)["`]/g, /^\s*(?:[\w.]+\s+)?["`]([./][^"`]+)["`]\s*$/gm],
  // Ruby — `require_relative 'x'`, `require 'x'`, `autoload :X, 'x'`.
  ruby: [/\brequire_relative\s+['"]([^'"]+)['"]/g, /\brequire\s+['"]([^'"]+)['"]/g],
  // Rust — `mod foo;` (sibling file) and `use crate::a::b;` / `use super::x;`.
  rust: [/^\s*(?:pub\s+)?mod\s+([A-Za-z_]\w*)\s*;/gm, /\buse\s+((?:crate|super|self)::[\w:]+)/g],
  // Java — `import a.b.C;`.
  java: [/^\s*import\s+(?:static\s+)?([\w.]+)\s*;/gm],
  // C/C++ — `#include "rel.h"` (quoted = local) only; `<system>` is not a repo edge.
  c: [/^\s*#\s*include\s+"([^"]+)"/gm],
  cpp: [/^\s*#\s*include\s+"([^"]+)"/gm],
};

/** AST node types that CONTAIN an import/require statement, per language alias. */
const IMPORT_NODE_TYPES: Record<string, Set<string>> = {
  typescript: new Set(['import_statement', 'import_clause', 'call_expression']),
  tsx: new Set(['import_statement', 'import_clause', 'call_expression']),
  javascript: new Set(['import_statement', 'import_clause', 'call_expression']),
  python: new Set(['import_statement', 'import_from_statement']),
  go: new Set(['import_spec', 'import_declaration']),
  ruby: new Set(['call']),
  rust: new Set(['use_declaration', 'mod_item']),
  java: new Set(['import_declaration']),
  c: new Set(['preproc_include']),
  cpp: new Set(['preproc_include']),
};

function extractSpecsRegex(lang: string, txt: string): string[] {
  const out: string[] = [];
  for (const re of SPEC_RES[lang] ?? []) {
    re.lastIndex = 0;
    for (const m of txt.matchAll(re)) if (m[1]) out.push(m[1]);
  }
  return out;
}

// ── per-language resolution of a specifier to a repo-relative file ───────────────

function tryFile(repoRoot: string, base: string): string | null {
  const b = base.replaceAll('\\', '/');
  const cands = [
    b, `${b}.ts`, `${b}.tsx`, `${b}.js`, `${b}.jsx`, `${b}.mjs`, `${b}.cjs`, `${b}.json`,
    `${b}.py`, `${b}.go`, `${b}.rb`, `${b}.rs`, `${b}.java`, `${b}.c`, `${b}.h`, `${b}.cc`, `${b}.cpp`, `${b}.hpp`, `${b}.hh`,
    `${b}/index.ts`, `${b}/index.tsx`, `${b}/index.js`, `${b}/__init__.py`, `${b}/mod.rs`,
  ];
  if (b.endsWith('.js')) cands.push(`${b.slice(0, -3)}.ts`, `${b.slice(0, -3)}.tsx`);
  return cands.find((c) => fs.existsSync(path.join(repoRoot, c))) ?? null;
}

/**
 * Resolve one specifier to a repo-relative file, per language. Returns null for a
 * specifier that does not name an in-repo SIBLING/relative file (bare/system/external
 * specifiers are not closure edges — same stance as algebra.ts and the connection
 * gate). The conservative direction holds: a miss simply omits an edge.
 */
export function resolveSpec(repoRoot: string, fromRel: string, lang: string, spec: string): string | null {
  const dir = path.posix.dirname(fromRel.replaceAll('\\', '/'));
  const join = (rel: string): string => path.posix.normalize(path.posix.join(dir, rel));

  if (lang === 'typescript' || lang === 'tsx' || lang === 'javascript') {
    if (spec.startsWith('@/')) {
      const rest = spec.slice(2);
      const roots = fromRel.startsWith('frontend/') ? ['frontend/src/']
        : fromRel.startsWith('backend/') ? ['backend/src/']
          : fromRel.startsWith('worker/') ? ['worker/src/']
            : ['frontend/src/', 'backend/src/', 'worker/src/'];
      for (const r of roots) { const hit = tryFile(repoRoot, r + rest); if (hit) return hit; }
      return null;
    }
    return spec.startsWith('.') ? tryFile(repoRoot, join(spec)) : null;
  }

  if (lang === 'python') {
    // `from . import x` → spec '.', `.pkg` / `..pkg.mod` are relative; `a.b` is absolute-ish.
    if (spec.startsWith('.')) {
      let s = spec;
      let up = '';
      while (s.startsWith('.')) { up += '../'; s = s.slice(1); }
      // a single leading dot means "current package", so the first dot is NOT a parent hop.
      const upFixed = up.replace('../', './');
      const modPath = s.replaceAll('.', '/');
      return tryFile(repoRoot, join((upFixed || './') + modPath)) ?? null;
    }
    return null; // dotted absolute module — needs project root config; omit (conservative)
  }

  if (lang === 'go') {
    // Only intra-repo relative-looking imports resolve; module-path imports need go.mod.
    return spec.startsWith('.') ? tryFile(repoRoot, join(spec)) : null;
  }

  if (lang === 'ruby') {
    // require_relative resolves against the file dir; require may be relative too.
    return tryFile(repoRoot, join(spec));
  }

  if (lang === 'rust') {
    if (spec.startsWith('crate::') || spec.startsWith('super::') || spec.startsWith('self::')) return null; // crate-graph, not file-relative
    // bare `mod foo;` → sibling foo.rs or foo/mod.rs
    return tryFile(repoRoot, join(spec));
  }

  if (lang === 'java') {
    // package.Class → package/Class.java relative to a source root; resolve from common roots.
    const asPath = spec.replaceAll('.', '/');
    const roots = ['', 'src/main/java/', 'src/'];
    for (const r of roots) { const hit = tryFile(repoRoot, r + asPath); if (hit) return hit; }
    return null;
  }

  if (lang === 'c' || lang === 'cpp') {
    return tryFile(repoRoot, join(spec));
  }

  return null;
}

// ── one-file specifier extraction (AST-preferred, regex-fallback) ────────────────

/** A specifier-extraction outcome carrying the honest perception note. */
export interface SpecExtraction {
  specs: string[];
  /** 'ast' = token-correct grammar parse; 'regex' = permissive fallback; 'unjudged' = unknown language */
  perception: 'ast' | 'regex' | 'unjudged';
  /** human-readable note (always set; states which layer judged this file) */
  note: string;
}

/**
 * Token-correct extraction via read-only `native-bridge.astNodes` when a grammar is
 * available (an import-shaped token inside a string/comment is NOT a child of an
 * import node, so it is excluded by construction), falling back to the permissive
 * regex superset when no grammar loads. Unknown extension → unjudged + empty specs.
 */
export async function extractSpecs(rel: string, txt: string): Promise<SpecExtraction> {
  const lang = langOf(rel);
  if (!lang) {
    return { specs: [], perception: 'unjudged', note: `unknown language for ${path.extname(rel) || '(no ext)'} — closure is reflexive-only (UNJUDGED beyond the file itself)` };
  }
  const nodeTypes = IMPORT_NODE_TYPES[lang];
  if (nodeTypes) {
    try {
      const nodes = await astNodes(txt, lang, nodeTypes);
      if (nodes) {
        // Re-run the per-language regex over only the import-node text, so the
        // string-literal token of an import is captured but a same-shaped token in a
        // body/comment (not inside an import node) is excluded — token-correct.
        const specs: string[] = [];
        for (const n of nodes) for (const s of extractSpecsRegex(lang, n.text)) specs.push(s);
        return { specs, perception: 'ast', note: `token-correct AST extraction (${nodes.length} import nodes, ${lang})` };
      }
    } catch {
      /* grammar unavailable / parse error → fall through to regex (conservative) */
    }
  }
  return { specs: extractSpecsRegex(lang, txt), perception: 'regex', note: `regex superset extraction (${lang}, no grammar) — conservative over-approximation` };
}

/** Synchronous regex-only extraction — the layer the sync ClosureProvider needs. */
export function extractSpecsSync(rel: string, txt: string): SpecExtraction {
  const lang = langOf(rel);
  if (!lang) {
    return { specs: [], perception: 'unjudged', note: `unknown language for ${path.extname(rel) || '(no ext)'} — closure is reflexive-only (UNJUDGED beyond the file itself)` };
  }
  return { specs: extractSpecsRegex(lang, txt), perception: 'regex', note: `regex superset extraction (${lang})` };
}

// ── the transitive universal closure (sync, regex-backed → ClosureProvider) ──────

function readFileSafe(repoRoot: string, rel: string): string | null {
  try {
    const abs = path.join(repoRoot, rel);
    return fs.existsSync(abs) && fs.statSync(abs).isFile() ? fs.readFileSync(abs, 'utf8') : null;
  } catch {
    return null;
  }
}

/**
 * Universal transitive resolution closure of `rel`, across all supported languages,
 * capped at `maxNodes`. SYNCHRONOUS (regex perception) so it satisfies the frozen
 * `ClosureProvider` signature verbatim. Reflexive on `rel` (the anchor is always in
 * its own closure). Unknown-language anchors return `{rel}` only — the honest floor.
 */
export function universalClosureOf(
  repoRoot: string,
  rel: string,
  cache: Map<string, Set<string>> = new Map(),
  maxNodes = 2000,
): { set: Set<string>; capped: boolean } {
  const start = rel.replaceAll('\\', '/');
  const seen = new Set<string>([start]);
  const stack = [start];
  let capped = false;
  while (stack.length) {
    const cur = stack.pop() as string;
    let neigh = cache.get(cur);
    if (!neigh) {
      neigh = new Set<string>();
      const txt = readFileSafe(repoRoot, cur);
      const lang = langOf(cur);
      if (txt !== null && lang !== null) {
        for (const spec of extractSpecsRegex(lang, txt)) {
          const t = resolveSpec(repoRoot, cur, lang, spec);
          if (t) neigh.add(t);
        }
      }
      cache.set(cur, neigh);
    }
    for (const t of neigh) {
      if (!seen.has(t)) {
        if (seen.size >= maxNodes) { capped = true; break; }
        seen.add(t);
        stack.push(t);
      }
    }
    if (capped) break;
  }
  return { set: seen, capped };
}

/**
 * The injectable provider the integrator passes to `commute` — a curried
 * `universalClosureOf` over a shared cache. Matches `ClosureProvider` exactly:
 * `(repoRoot, rel) => { set, capped }`. Replacing algebra.ts's TS-only `closureOf`
 * with this makes the commute algebra language-agnostic with NO change to commute's
 * logic (the contract type was designed for exactly this substitution).
 */
export function makeUniversalClosureProvider(): ClosureProvider {
  const cache = new Map<string, Set<string>>();
  return (repoRoot: string, rel: string) => universalClosureOf(repoRoot, rel, cache);
}

// ── PER-GATE closures: non-file virtual loci (route strings, event names) ────────
//
// A gate's read set is sometimes NOT a file but a SHARED NAMESPACE token. Two edits
// in different files that both bind route `POST /checkout`, or both touch event
// `order.created`, couple at that token even though no import edge connects them.
// We model the token as a namespaced virtual locus added to the closure set; the
// namespace prefix (`route:` / `event:`) guarantees it can never alias a real path.

const ROUTE_DECORATOR_RE = /@(?:Get|Post|Put|Patch|Delete|All|Options|Head)\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g;
const EVENT_NAME_RE = /@(?:OnEvent|EventPattern|MessagePattern)\(\s*['"`]([^'"`]+)['"`]/g;
const EVENT_EMIT_RE = /\.(?:emit|emitAsync)\(\s*['"`]([^'"`]+)['"`]/g;

/** Virtual route loci a file binds (HTTP-method decorators), namespaced `route:`. */
export function routeLoci(txt: string): string[] {
  const out: string[] = [];
  ROUTE_DECORATOR_RE.lastIndex = 0;
  for (const m of txt.matchAll(ROUTE_DECORATOR_RE)) out.push(`route:${(m[1] ?? '').replace(/^\/+/, '')}`);
  return out;
}

/** Virtual event loci a file emits/consumes, namespaced `event:`. */
export function eventLoci(txt: string): string[] {
  const out = new Set<string>();
  EVENT_NAME_RE.lastIndex = 0;
  for (const m of txt.matchAll(EVENT_NAME_RE)) if (m[1]) out.add(`event:${m[1]}`);
  EVENT_EMIT_RE.lastIndex = 0;
  for (const m of txt.matchAll(EVENT_EMIT_RE)) if (m[1]) out.add(`event:${m[1]}`);
  return Array.from(out);
}

/**
 * A per-GATE closure provider: the universal file closure PLUS the gate's virtual
 * loci for the anchor file (route strings for a contract-edge gate, event names for a
 * telemetry gate). Returned as a `ClosureProvider` so it slots into `commute` exactly
 * like the file-only one; the virtual loci sit alongside file paths in the same set,
 * so commute()'s `closure.has(file)` test naturally also catches a route/event shared
 * between two edits when BOTH facts carry the matching virtual locus in their span/file
 * model (the integrator threads that through the EditFact's file/closure as it wires).
 *
 * `gate: 'route'` adds route loci; `gate: 'event'` adds event loci; `gate: 'file'`
 * (default) is the plain universal file closure. Unknown gate name → file-only +
 * an unjudged stance (never a wrong virtual locus).
 */
export function makeGateClosureProvider(gate: 'file' | 'route' | 'event' = 'file'): ClosureProvider {
  const cache = new Map<string, Set<string>>();
  return (repoRoot: string, rel: string) => {
    const base = universalClosureOf(repoRoot, rel, cache);
    if (gate === 'file') return base;
    const txt = readFileSafe(repoRoot, rel);
    if (txt === null) return base; // cannot read → no virtual loci (conservative: file-only)
    const set = new Set(base.set);
    const loci = gate === 'route' ? routeLoci(txt) : gate === 'event' ? eventLoci(txt) : [];
    for (const l of loci) set.add(l);
    return { set, capped: base.capped };
  };
}
