/**
 * connection-gate.ts — the exoneration-free CONNECTION fact, at the byte floor.
 *
 * A relative import resolves to a real file, or it dangles. That is a FACT, not a
 * heuristic — no language server, no gate config, no guessing, no language bias.
 * This module is the single source of that truth, consumed by BOTH the static
 * convergence engine (overlay-aware, pre-write) and the byte-write floor in
 * server-helpers-io (disk + pending-set aware, AT write). Pure fs+path: zero
 * heavy deps, so the leaf io module can import it without pulling the tree-sitter
 * engine into every write.
 *
 * Semantics (universal, works on any repo with or without gates):
 *  - Only SOURCE files are judged (.ts/.tsx/.js/.jsx/.mjs/.cjs). Everything else
 *    (json, locks, traces, css) has no relative-import fact to assert → green.
 *  - Only NEW wires are this write's claim: a specifier present in the new content
 *    but NOT in the file's prior content. A pre-existing dangling import in a
 *    legacy file never blocks an unrelated edit — but no write may INTRODUCE one.
 *  - Bare specifiers (packages/builtins) are out of scope: not a dangling-wire
 *    fact we can assert from the filesystem alone.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const SOURCE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/**
 * Files about to exist within the current multi-file atomic transaction. The
 * byte-floor gate consults this so a pre-approved set that wires A→B (e.g.
 * atomic_converge creating B and importing it from A) is not false-reddened by
 * the order the firewall happens to write them. Single-file writes leave it empty.
 */
const pending = new Set<string>();
export function registerPendingWrites(absPaths: string[]): void {
  for (const p of absPaths) pending.add(path.resolve(p));
}
export function clearPendingWrites(): void {
  pending.clear();
}

/**
 * Length-preserving blanking of // and block comments ONLY (never string literals —
 * import specifiers live in strings, so blanking those would erase real imports;
 * never `#` — it is a private-field / hashbang in JS/TS, not a comment). String
 * literals are SKIPPED OVER (preserved) so a `//` inside a URL string is not mistaken
 * for a comment. This removes comment-embedded false matches like a `from './x'`
 * written in a doc comment, the dominant cross-gate false-positive source the lens
 * exposed. Residual: a code-pattern embedded in a TEMPLATE/STRING literal (meta-code
 * that builds such strings) still matches — that needs token-correct parsing.
 */
export function blankComments(text: string): string {
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
      let j = i + 1; // skip OVER the string (preserve it — specifiers live here)
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

export function extractImportSpecifiers(content: string): string[] {
  const code = blankComments(content);
  const specs: string[] = [];
  const re = /\bfrom\s+['"]([^'"]+)['"]|\brequire\s*\(\s*['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) specs.push(m[1] ?? m[2] ?? m[3]);
  return specs;
}

function candidatesFor(baseAbs: string): string[] {
  const c = [
    baseAbs, `${baseAbs}.ts`, `${baseAbs}.tsx`, `${baseAbs}.js`, `${baseAbs}.jsx`,
    `${baseAbs}.mjs`, `${baseAbs}.cjs`, `${baseAbs}.json`,
    path.join(baseAbs, 'index.ts'), path.join(baseAbs, 'index.tsx'), path.join(baseAbs, 'index.js'),
  ];
  if (baseAbs.endsWith('.js')) c.push(`${baseAbs.slice(0, -3)}.ts`, `${baseAbs.slice(0, -3)}.tsx`);
  return c;
}

/** Resolve a RELATIVE specifier against dirname(fromAbs), consulting pending+disk. */
function relativeImportResolvesAbs(fromAbs: string, spec: string): boolean {
  if (!spec.startsWith('.')) return true; // bare specifier → package/builtin → not judged
  const baseAbs = path.resolve(path.dirname(fromAbs), spec);
  return candidatesFor(baseAbs).some((cand) => {
    const r = path.resolve(cand);
    return pending.has(r) || fs.existsSync(cand);
  });
}

export interface ConnectionVerdict {
  green: boolean;
  reds: string[];
}

/**
 * Byte-floor connection fact for a single file write. Reads the file's prior
 * content (if any) so only NEW relative imports are judged. A brand-new file is
 * all-new, so every relative import in it must resolve.
 */
export function checkConnectionByteFloor(absPath: string, content: string): ConnectionVerdict {
  if (!SOURCE_RE.test(absPath)) return { green: true, reds: [] };
  let beforeSpecs: Set<string>;
  try {
    beforeSpecs = new Set(extractImportSpecifiers(fs.readFileSync(absPath, 'utf8')));
  } catch {
    beforeSpecs = new Set(); // file does not exist yet → every wire is new
  }
  const reds: string[] = [];
  for (const spec of extractImportSpecifiers(content)) {
    if (beforeSpecs.has(spec)) continue; // unchanged wire — not this write's claim
    if (!relativeImportResolvesAbs(absPath, spec)) reds.push(spec);
  }
  return { green: reds.length === 0, reds };
}
