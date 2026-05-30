/**
 * gates/supply-chain-gate.ts — the exoneration-free SUPPLY-CHAIN fact.
 *
 * connection-gate.ts judges the RELATIVE half of every import edge and explicitly
 * leaves the bare half out (`if (!spec.startsWith('.')) return true`). This gate
 * is the missing half: it judges the BARE specifiers — packages and builtins —
 * by the same byte floor.
 *
 * THE FACT (no language server, no daemon, no version solving, no lockfile parse):
 *   A bare specifier terminates at a real installed part, or it dangles.
 *   - A Node builtin (`node:fs`, `fs`, `fs/promises`, …) terminates — true.
 *   - A package X terminates iff Node's own walk-up resolution finds a
 *     byte-existing `node_modules/X/package.json` (X = first segment, or the
 *     `@scope/name` pair; subpaths `X/sub` resolve at the package root). This is
 *     exactly the algorithm `node` uses (validated against the real installed
 *     tree: web-tree-sitter resolves in the MCP's own node_modules, zod resolves
 *     at the repo root via walk-up, a fabricated name resolves to null).
 *   - A tsconfig path-alias (`@/...`, `~/...`) is NOT a node_modules package —
 *     it is the relative/alias gate's concern — so it is skipped, never reddened.
 *
 * NEW-bare-import-only semantics (mirrors connection-gate / the byte-write floor):
 *   only specifiers present in the candidate's NEW content but absent from its
 *   prior on-disk content are this write's claim. A pre-existing unresolved import
 *   in a legacy file never blocks an unrelated edit — but no write may INTRODUCE
 *   an import of a package not present in the installed tree.
 *
 * Mutation Firewall: perception LOCATES (the import-specifier spans, byte-existence
 * of package.json); this gate only ASSERTS a fact. It never writes. Pure
 * node:fs/node:path + node:module.isBuiltin, zero heavy deps — same shape as the
 * connection-gate seed so it composes into convergeStatic and the byte floor.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isBuiltin } from 'node:module';
import {
  type GateModule,
  type GateContext,
  type GateResult,
  type GateRed,
} from './contract.js';

const SOURCE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/**
 * Extract every import specifier (the `from '...'`, `require('...')`,
 * bare `import '...'` string). Identical shape to connection-gate's extractor so
 * the two halves of the import edge are read the same way.
 */
function extractImportSpecifiers(content: string): string[] {
  const specs: string[] = [];
  const re =
    /\bfrom\s+['"]([^'"]+)['"]|\brequire\s*\(\s*['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) specs.push(m[1] ?? m[2] ?? m[3]);
  return specs;
}

/**
 * The package root a bare specifier resolves against:
 *   - `@scope/name/sub` → `@scope/name`
 *   - `name/sub`        → `name`
 * Returns null for an empty-scope alias (`@/...`) — that is NOT a real scoped
 * package, it is a tsconfig path alias, so it has no supply-chain fact.
 */
function packageRoot(spec: string): string | null {
  if (spec.startsWith('@')) {
    const parts = spec.split('/');
    const scope = parts[0]; // "@scope" — for "@/..." this is exactly "@"
    if (scope === '@' || scope.length < 2) return null; // empty scope → path alias
    if (parts.length < 2 || parts[1] === '') return null; // "@scope" with no name
    return `${parts[0]}/${parts[1]}`;
  }
  return spec.split('/')[0];
}

/** Strip a path-alias pattern's trailing wildcard: "@/*" → "@/", "~/*" → "~/". */
function aliasPrefix(pattern: string): string {
  return pattern.endsWith('/*') ? pattern.slice(0, -1) : pattern;
}

/**
 * Best-effort tsconfig `paths` alias check, walking up from the importing file to
 * the repo root. A spec that matches a configured alias prefix is NOT a
 * node_modules package, so this gate must not redden it. Lenient by design: the
 * keys are extracted by regex so JSON-with-comments tsconfigs still parse; an
 * unreadable tsconfig simply yields no alias info (the empty-scope check already
 * covers this repo's `@/*` alias on its own).
 */
function matchesTsconfigAlias(ctx: GateContext, fromRel: string, spec: string): boolean {
  const norm = (p: string): string => p.replaceAll('\\', '/');
  let dir = path.posix.dirname(norm(fromRel));
  for (;;) {
    const tsconfigRel = dir === '' || dir === '.' ? 'tsconfig.json' : `${dir}/tsconfig.json`;
    const text = ctx.readFile(tsconfigRel);
    if (text !== null) {
      // grab the "paths" block, then every quoted key inside it
      const block = /"paths"\s*:\s*\{([\s\S]*?)\}/.exec(text);
      if (block) {
        const keyRe = /"([^"]+)"\s*:/g;
        let km: RegExpExecArray | null;
        while ((km = keyRe.exec(block[1])) !== null) {
          const pre = aliasPrefix(km[1]);
          if (spec === km[1].replace(/\/\*$/, '') || spec === pre || spec.startsWith(pre)) {
            return true;
          }
        }
      }
    }
    if (dir === '' || dir === '.') break;
    const parent = path.posix.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return false;
}

/**
 * Node's bare-import walk-up resolution, in repo-relative space, by BYTE existence
 * of `<dir>/node_modules/<pkg>/package.json`. Overlay-aware via ctx.existsInTree
 * so a package.json created in the same atomic transaction also resolves — the
 * shared meaning of "exists" never diverges from the other gates.
 */
function resolvesBare(ctx: GateContext, fromRel: string, pkg: string): boolean {
  const norm = (p: string): string => p.replaceAll('\\', '/');
  let dir = path.posix.dirname(norm(fromRel));
  for (;;) {
    const base = dir === '' || dir === '.' ? 'node_modules' : `${dir}/node_modules`;
    if (ctx.existsInTree(`${base}/${pkg}/package.json`)) return true;
    if (dir === '' || dir === '.') break;
    const parent = path.posix.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return false;
}

/** The prior on-disk content of a changed file ('' if brand new) — overlay is the NEW text, disk is the BEFORE. */
function priorDiskContent(repoRoot: string, rel: string): string {
  try {
    return fs.readFileSync(path.join(repoRoot, rel.replaceAll('\\', '/')), 'utf8');
  } catch {
    return '';
  }
}

const supplyChainGate: GateModule = {
  name: 'supply-chain',
  kind: 'static',
  appliesTo(rel: string): boolean {
    return SOURCE_RE.test(rel);
  },
  run(ctx: GateContext): GateResult {
    const reds: GateRed[] = [];
    const note =
      'every NEW bare import resolves to a Node builtin or an installed node_modules/<pkg>/package.json';
    for (const rel of ctx.changedFiles) {
      if (!SOURCE_RE.test(rel)) continue;
      const newText = ctx.overlay.get(rel.replaceAll('\\', '/')) ?? ctx.readFile(rel);
      if (newText === null) continue;
      const before = new Set(extractImportSpecifiers(priorDiskContent(ctx.repoRoot, rel)));
      for (const spec of extractImportSpecifiers(newText)) {
        if (before.has(spec)) continue; // unchanged wire — not this write's claim
        if (spec.startsWith('.')) continue; // relative half — connection-gate's fact
        if (isBuiltin(spec)) continue; // builtin terminates
        const pkg = packageRoot(spec);
        if (pkg === null) continue; // empty-scope alias (@/...) — not a node_modules package
        if (matchesTsconfigAlias(ctx, rel, spec)) continue; // configured path alias — not ours
        if (resolvesBare(ctx, rel, pkg)) continue; // installed part exists on disk/overlay
        reds.push({
          file: rel,
          locus: `bare:${spec}`,
          fact: `bare import '${spec}' resolves to no installed node_modules/${pkg}/package.json (would introduce a dangling dependency edge)`,
        });
      }
    }
    return { gate: this.name, green: reds.length === 0, reds, note };
  },
};

export default supplyChainGate;
