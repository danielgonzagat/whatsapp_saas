/**
 * gates/perception.ts — the ONE perception organ (the frozen read-side contract).
 *
 * The Mutation Firewall law is "perception LOCATES, the engine SPLICES". Every gate
 * must read its facts through THIS organ, never by raw-regex over the whole file —
 * regex matches a `from './x'` in a comment or a `@OnEvent('x')` in a template
 * literal; the AST does not. Each accessor SELECTS nodes by their real tree-sitter
 * TYPE (so a token inside a string/comment is a `string`/`comment` node, never the
 * type it textually resembles) and then reads the specifier/name from THAT node's
 * own text — code, never prose. That is token-correctness by construction.
 *
 * Every accessor returns `null` when no grammar is available for the language, so
 * the caller degrades honestly (→ unjudged) rather than guessing. Positions are
 * 1-based line/column at the node's start.
 */
import { astNodes } from '../native-bridge.js';

export interface DecoratorFact {
  name: string; // e.g. 'OnEvent' for @OnEvent('user.created')
  arg: string | null; // first string-literal argument, unquoted, or null
  line: number;
  column: number;
}
export interface CallFact {
  callee: string; // full callee text: 'apiFetch', 'this.logger.warn', 'tracer.startSpan'
  arg0: string | null; // first string-literal argument, unquoted, or null
  line: number;
  column: number;
}
export interface RefFact {
  name: string;
  line: number;
  column: number;
}

/** Map a repo-relative path to the native-bridge language alias, or undefined. */
export function langOf(rel: string): string | undefined {
  const ext = /\.([a-z0-9]+)$/i.exec(rel)?.[1]?.toLowerCase();
  switch (ext) {
    case 'ts':
      return 'typescript';
    case 'tsx':
      return 'tsx';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'py':
      return 'python';
    case 'go':
      return 'go';
    case 'rb':
      return 'ruby';
    case 'rs':
      return 'rust';
    case 'java':
      return 'java';
    case 'c':
      return 'c';
    case 'cc':
    case 'cpp':
      return 'cpp';
    case 'json':
      return 'json';
    default:
      return undefined; // unknown → caller degrades / unjudged
  }
}

const unquote = (s: string): string | null => {
  const t = s.trim();
  if (t.length >= 2 && (t[0] === "'" || t[0] === '"' || t[0] === '`') && t[t.length - 1] === t[0]) {
    return t.slice(1, -1);
  }
  return null;
};

/**
 * Relative + bare import specifiers, read from real import/require nodes only. A
 * `from './x'` written inside a comment or string is NOT an import_statement node,
 * so it is never returned. Returns null when the grammar is unavailable.
 */
export async function importSpecs(content: string, rel: string): Promise<string[] | null> {
  const lang = langOf(rel);
  const nodes = await astNodes(content, lang, new Set(['import_statement', 'export_statement', 'call_expression']));
  if (nodes === null) return null;
  const specs: string[] = [];
  for (const n of nodes) {
    if (n.type === 'import_statement') {
      // import { x } from 'spec' | import 'spec'
      const m = /\bfrom\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/.exec(n.text);
      if (m) specs.push((m[1] ?? m[2]) as string);
    } else if (n.type === 'export_statement') {
      // export { x } from 'spec' | export type { X } from 'spec' | export * from 'spec'
      const m = /^\s*export\s+(?:type\s+)?(?:\*|\{[\s\S]*?\})\s+from\s+['"]([^'"]+)['"]/.exec(n.text);
      if (m) specs.push(m[1]);
    } else {
      // call_expression: ONLY a require(...)/import(...) whose callee STARTS the node text.
      // Anchoring at ^ stops `it('… from "X" …')` / `foo('require("y")')` — a `from`/`require`
      // appearing inside a STRING ARGUMENT of any other call — from being read as a specifier.
      const m = /^(?:require|import)\s*\(\s*['"]([^'"]+)['"]/.exec(n.text.trimStart());
      if (m) specs.push(m[1]);
    }
  }
  return specs;
}

/** Decorators (`@Name(...)`) read from real `decorator` nodes only. */
export async function decorators(content: string, rel: string): Promise<DecoratorFact[] | null> {
  const lang = langOf(rel);
  const nodes = await astNodes(content, lang, new Set(['decorator']));
  if (nodes === null) return null;
  const out: DecoratorFact[] = [];
  for (const n of nodes) {
    const m = /@\s*([A-Za-z_$][\w$]*)\s*(?:\(\s*(['"`][^'"`]*['"`]))?/.exec(n.text);
    if (m) out.push({ name: m[1], arg: m[2] ? unquote(m[2]) : null, line: n.line, column: n.column });
  }
  return out;
}

/** Call expressions read from real `call_expression` nodes only (member callees kept whole). */
export async function calls(content: string, rel: string): Promise<CallFact[] | null> {
  const lang = langOf(rel);
  const nodes = await astNodes(content, lang, new Set(['call_expression']));
  if (nodes === null) return null;
  const out: CallFact[] = [];
  for (const n of nodes) {
    const open = n.text.indexOf('(');
    if (open <= 0) continue;
    const callee = n.text.slice(0, open).trim();
    if (!/^[A-Za-z_$][\w$.]*$/.test(callee)) continue; // skip computed/complex callees
    const argm = /\(\s*(['"`][^'"`]*['"`])/.exec(n.text);
    out.push({ callee, arg0: argm ? unquote(argm[1]) : null, line: n.line, column: n.column });
  }
  return out;
}

/** Value-position identifier nodes (NOT property names, NOT inside strings/comments). */
export async function identifiers(content: string, rel: string): Promise<RefFact[] | null> {
  const lang = langOf(rel);
  const nodes = await astNodes(content, lang, new Set(['identifier']));
  if (nodes === null) return null;
  return nodes.map((n) => ({ name: n.text, line: n.line, column: n.column }));
}
