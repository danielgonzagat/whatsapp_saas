/**
 * native-bridge.ts -- the universal (multi-language) engine, in pure JS on
 * web-tree-sitter (WASM). ZERO native binary, ZERO external engine: tree-sitter
 * is compiled to WebAssembly and runs in-process, sandboxed -- it cannot segfault
 * the host, so no fork isolation is needed. Grammars are the canonical
 * `tree-sitter-<lang>` npm packages (each ships a .wasm); nothing here depends on
 * any private/native addon (no @oh-my-pi/pi-natives, no PI).
 *
 * FIREWALL LAW: this layer is PERCEPTION + CHANGE-COMPUTATION only. astEditDry
 * returns computed spans (it never writes). Persistence happens exclusively
 * through the atomic Mutation Firewall in the tool handlers.
 *
 * Degrades gracefully: if web-tree-sitter or a grammar can't load, the universal
 * tools report unavailable and every TS/ts-morph tool keeps working fully.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
// web-tree-sitter is ESM; imported lazily in ensureReady to keep startup cheap.

export type AstMatchStrictness = 'cst' | 'smart' | 'ast' | 'relaxed' | 'signature' | 'template';

export interface AstFindOptions { patterns?: string[]; lang?: string; path?: string; glob?: string; selector?: string; strictness?: AstMatchStrictness; limit?: number; offset?: number; includeMeta?: boolean; timeoutMs?: number; }
export interface AstFindMatch { path: string; text?: string; byteStart: number; byteEnd: number; startLine: number; startColumn: number; endLine: number; endColumn: number; metaVariables?: Record<string, unknown>; }
export interface AstFindResult { matches: AstFindMatch[]; totalMatches: number; filesWithMatches: number; filesSearched: number; limitReached: boolean; parseErrors?: string[]; }
export interface AstReplaceOptions { rewrites?: Record<string, string>; lang?: string; path?: string; glob?: string; selector?: string; strictness?: AstMatchStrictness; maxReplacements?: number; maxFiles?: number; failOnParseError?: boolean; timeoutMs?: number; }
export interface AstReplaceChange { path: string; before: string; after: string; byteStart: number; byteEnd: number; deletedLength: number; startLine: number; startColumn: number; endLine: number; endColumn: number; }
export interface AstReplaceResult { changes: AstReplaceChange[]; fileChanges: { path: string; count: number }[]; totalReplacements: number; filesTouched: number; filesSearched: number; applied: boolean; limitReached: boolean; parseErrors?: string[]; }
export interface GrepMatch { path: string; lineNumber: number; line: string; }
export interface GrepResult { matches: GrepMatch[]; totalMatches: number; filesWithMatches: number; filesSearched: number; limitReached: boolean; }
export interface GlobMatch { path: string; fileType: number; }
export interface GlobResult { matches: GlobMatch[]; totalMatches: number; }

// --------------------------- grammar registry ---------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
// lang -> [npm package dir name, wasm file name]
const GRAMMARS: Record<string, [string, string]> = {
  python: ['tree-sitter-python', 'tree-sitter-python.wasm'],
  javascript: ['tree-sitter-javascript', 'tree-sitter-javascript.wasm'],
  typescript: ['tree-sitter-typescript', 'tree-sitter-typescript.wasm'],
  tsx: ['tree-sitter-typescript', 'tree-sitter-tsx.wasm'],
  go: ['tree-sitter-go', 'tree-sitter-go.wasm'],
  ruby: ['tree-sitter-ruby', 'tree-sitter-ruby.wasm'],
  rust: ['tree-sitter-rust', 'tree-sitter-rust.wasm'],
  java: ['tree-sitter-java', 'tree-sitter-java.wasm'],
  c: ['tree-sitter-c', 'tree-sitter-c.wasm'],
  cpp: ['tree-sitter-cpp', 'tree-sitter-cpp.wasm'],
  bash: ['tree-sitter-bash', 'tree-sitter-bash.wasm'],
  json: ['tree-sitter-json', 'tree-sitter-json.wasm'],
};
const EXT: Record<string, string> = {
  '.py': 'python', '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.ts': 'typescript', '.tsx': 'tsx', '.go': 'go', '.rb': 'ruby', '.rs': 'rust', '.java': 'java',
  '.c': 'c', '.h': 'c', '.cc': 'cpp', '.cpp': 'cpp', '.hpp': 'cpp', '.sh': 'bash', '.bash': 'bash', '.json': 'json',
};

function findWasm(pkg: string, file: string): string | null {
  let d = HERE;
  for (let i = 0; i < 10; i += 1) {
    const cand = path.join(d, 'node_modules', pkg, file);
    if (fs.existsSync(cand)) return cand;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return null;
}
function extLang(p?: string): string | undefined { if (!p) return undefined; return EXT[path.extname(p).toLowerCase()]; }

// web-tree-sitter handles (loaded lazily)
interface TsPoint {
  row: number;
  column: number;
}
interface TsNode {
  type: string;
  text: string;
  isMissing: boolean;
  namedChildren: TsNode[];
  namedChildCount: number;
  childCount: number;
  startIndex: number;
  endIndex: number;
  startPosition: TsPoint;
  endPosition: TsPoint;
  child(i: number): TsNode;
  childForFieldName?(name: string): TsNode | null;
}
interface TsTree {
  rootNode: TsNode;
}
interface TsParser {
  setLanguage(lang: unknown): void;
  parse(code: string): TsTree;
}
interface TsParserCtor {
  new (): TsParser;
  init(): Promise<void>;
}
interface TsLanguageStatic {
  load(wasm: string): Promise<unknown>;
}
interface TsModule {
  Parser: TsParserCtor;
  Language: TsLanguageStatic;
}
let TS: TsModule | null = null;
let inited = false;
const loadedLangs = new Map<string, unknown>();

export async function ensureReady(_timeoutMs = 8000): Promise<boolean> {
  if (inited) return TS !== null;
  inited = true;
  try {
    const mod = (await import('web-tree-sitter')) as {
      Parser?: TsParserCtor;
      Language?: TsLanguageStatic;
      default?: { Parser?: TsParserCtor; Language?: TsLanguageStatic } & Partial<TsParserCtor>;
    };
    const Parser = (mod.Parser ?? mod.default?.Parser ?? mod.default) as TsParserCtor;
    const Language = (mod.Language ?? mod.default?.Language) as TsLanguageStatic;
    await Parser.init();
    TS = { Parser, Language };
    return true;
  } catch {
    TS = null;
    return false;
  }
}
export function nativeAvailable(): boolean { return TS !== null; }
export function nativeLanguages(): string[] { return Object.keys(GRAMMARS); }

async function parserFor(alias?: string): Promise<TsParser | null> {
  if (!TS || !alias || !(alias in GRAMMARS)) return null;
  if (!loadedLangs.has(alias)) {
    const [pkg, file] = GRAMMARS[alias];
    const wasm = findWasm(pkg, file);
    if (!wasm) return null;
    loadedLangs.set(alias, await TS.Language.load(wasm));
  }
  const p = new TS.Parser();
  p.setLanguage(loadedLangs.get(alias));
  return p;
}

// --------------------------- ast-grep matcher ---------------------------

const PFX = 'ZZMV';
const toIdent = (s: string): string => s.replace(/\$([A-Z][A-Z0-9_]*)/g, PFX + '$1');
const metaName = (t: string): string | null => (typeof t === 'string' && t.startsWith(PFX) ? t.slice(PFX.length) : null);
const UNWRAP = new Set(['module', 'program', 'source_file', 'expression_statement', 'simple_statements']);
const u16ToByte = (s: string, i: number): number => Buffer.byteLength(s.slice(0, i), 'utf8');

function compilePattern(parser: TsParser, src: string): TsNode {
  const t = parser.parse(toIdent(src));
  let n = t.rootNode;
  while (UNWRAP.has(n.type)) {
    const k = n.namedChildren.find((c: TsNode) => c.type !== 'ERROR' && !c.isMissing);
    if (!k) break;
    n = k;
  }
  return n;
}
function match(P: TsNode, S: TsNode, b: Record<string, { text: string }>): boolean {
  const mn = metaName(P.text);
  if (mn !== null && P.namedChildCount === 0) { b[mn] = { text: S.text }; return true; }
  if (P.type !== S.type) return false;
  const pc = P.namedChildren, sc = S.namedChildren;
  if (pc.length === 0) return P.text === S.text;
  if (pc.length !== sc.length) return false;
  for (let i = 0; i < pc.length; i += 1) if (!match(pc[i], sc[i], b)) return false;
  return true;
}

// --------------------------- file resolution ---------------------------

function listFiles(target: string, glob?: string): string[] {
  let st: fs.Stats;
  try { st = fs.statSync(target); } catch { return []; }
  if (st.isFile()) return [target];
  const out: string[] = [];
  const re = glob ? globToRe(glob) : null;
  const walk = (dir: string) => {
    let ents: fs.Dirent[];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) { if (!re || re.test(e.name)) out.push(full); }
    }
  };
  walk(target);
  return out;
}
function globToRe(glob: string): RegExp {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, ' ').replace(/\*/g, '[^/]*').replace(/ /g, '.*');
  return new RegExp('^' + esc + '$');
}

// --------------------------- public engine ops ---------------------------

export async function astGrep(opts: AstFindOptions): Promise<AstFindResult> {
  await ensureReady();
  const files = opts.path ? listFiles(opts.path, opts.glob) : [];
  const matches: AstFindMatch[] = [];
  let filesWith = 0;
  const parseErrors: string[] = [];
  for (const f of files) {
    const alias = opts.lang || extLang(f);
    const parser = await parserFor(alias);
    if (!parser) continue;
    let code: string;
    try { code = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const t = parser.parse(code);
    let anyMatch = false;
    for (const pat of opts.patterns ?? []) {
      const P = compilePattern(parser, pat);
      const stack = [t.rootNode];
      while (stack.length) {
        const n = stack.pop() as TsNode;
        const b: Record<string, { text: string }> = {};
        if (match(P, n, b)) {
          anyMatch = true;
          matches.push({ path: f, text: code.slice(n.startIndex, n.endIndex), byteStart: u16ToByte(code, n.startIndex), byteEnd: u16ToByte(code, n.endIndex), startLine: n.startPosition.row + 1, startColumn: n.startPosition.column + 1, endLine: n.endPosition.row + 1, endColumn: n.endPosition.column + 1, metaVariables: opts.includeMeta ? b : undefined });
        }
        for (let i = 0; i < n.childCount; i += 1) stack.push(n.child(i));
      }
    }
    if (anyMatch) filesWith += 1;
  }
  const limit = opts.limit ?? matches.length;
  return { matches: matches.slice(0, limit), totalMatches: matches.length, filesWithMatches: filesWith, filesSearched: files.length, limitReached: matches.length > limit, parseErrors: parseErrors.length ? parseErrors : undefined };
}

export async function astEditDry(opts: AstReplaceOptions): Promise<AstReplaceResult> {
  await ensureReady();
  const files = opts.path ? listFiles(opts.path, opts.glob) : [];
  const changes: AstReplaceChange[] = [];
  const fileChanges: { path: string; count: number }[] = [];
  for (const f of files) {
    const alias = opts.lang || extLang(f);
    const parser = await parserFor(alias);
    if (!parser) continue;
    let code: string;
    try { code = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const t = parser.parse(code);
    let count = 0;
    for (const [pat, tmpl] of Object.entries(opts.rewrites ?? {})) {
      const P = compilePattern(parser, pat);
      const stack = [t.rootNode];
      while (stack.length) {
        const n = stack.pop() as TsNode;
        const b: Record<string, { text: string }> = {};
        if (match(P, n, b)) {
          let after = tmpl;
          for (const [k, v] of Object.entries(b)) after = after.replaceAll('$' + k, v.text);
          const bs = u16ToByte(code, n.startIndex), be = u16ToByte(code, n.endIndex);
          changes.push({ path: f, before: code.slice(n.startIndex, n.endIndex), after, byteStart: bs, byteEnd: be, deletedLength: be - bs, startLine: n.startPosition.row + 1, startColumn: n.startPosition.column + 1, endLine: n.endPosition.row + 1, endColumn: n.endPosition.column + 1 });
          count += 1;
        }
        for (let i = 0; i < n.childCount; i += 1) stack.push(n.child(i));
      }
    }
    if (count) fileChanges.push({ path: f, count });
  }
  return { changes, fileChanges, totalReplacements: changes.length, filesTouched: fileChanges.length, filesSearched: files.length, applied: false, limitReached: false };
}

export async function summarize(opts: Record<string, unknown>): Promise<Record<string, unknown>> {
  await ensureReady();
  const code = String(opts.code ?? '');
  const alias = (opts.lang as string) || extLang(opts.path as string);
  const parser = await parserFor(alias);
  if (!parser) return { parsed: false, language: alias ?? 'generic', totalLines: code.split('\n').length, segments: [] };
  const t = parser.parse(code);
  const DEF = new Set(['function_definition', 'class_definition', 'method', 'function_declaration', 'method_declaration', 'type_declaration', 'class']);
  const segments: unknown[] = [];
  let errs = 0;
  const walk = (n: TsNode) => {
    if (n.type === 'ERROR' || n.isMissing) errs += 1;
    if (DEF.has(n.type)) segments.push({ kind: 'kept', startLine: n.startPosition.row + 1, endLine: n.endPosition.row + 1, name: n.childForFieldName?.('name')?.text });
    for (let i = 0; i < n.childCount; i += 1) walk(n.child(i));
  };
  walk(t.rootNode);
  return { parsed: errs === 0, language: alias, totalLines: code.split('\n').length, segments };
}

export async function nativeGrep(opts: Record<string, unknown>): Promise<GrepResult> {
  const target = String(opts.path ?? '.');
  const re = new RegExp(String(opts.pattern ?? ''), opts.ignoreCase ? 'i' : '');
  const maxCount = Number(opts.maxCount ?? 200);
  const files = listFiles(target, opts.glob as string | undefined);
  const matches: GrepMatch[] = [];
  const withMatch = new Set<string>();
  for (const f of files) {
    let lines: string[];
    try { lines = fs.readFileSync(f, 'utf8').split('\n'); } catch { continue; }
    for (let i = 0; i < lines.length; i += 1) {
      if (re.test(lines[i])) { matches.push({ path: f, lineNumber: i + 1, line: lines[i] }); withMatch.add(f); if (matches.length >= maxCount) return { matches, totalMatches: matches.length, filesWithMatches: withMatch.size, filesSearched: files.length, limitReached: true }; }
    }
  }
  return { matches, totalMatches: matches.length, filesWithMatches: withMatch.size, filesSearched: files.length, limitReached: false };
}

export async function nativeGlob(opts: Record<string, unknown>): Promise<GlobResult> {
  const target = String(opts.path ?? '.');
  const files = listFiles(target, String(opts.pattern ?? '*'));
  const maxResults = Number(opts.maxResults ?? 500);
  const matches: GlobMatch[] = files.slice(0, maxResults).map((p) => ({ path: p, fileType: 1 }));
  return { matches, totalMatches: files.length };
}

/** Syntax validity via web-tree-sitter. realParser:false means no grammar (cannot judge); parsed reflects zero ERROR/MISSING nodes. */
export async function validate(code: string, lang?: string): Promise<{ realParser: boolean; errorCount: number; parsed: boolean }> {
  await ensureReady();
  const parser = await parserFor(lang);
  if (!parser) return { realParser: false, errorCount: -1, parsed: false };
  const t = parser.parse(code);
  let e = 0;
  const w = (n: any): void => {
    if (n.type === 'ERROR' || n.isMissing) e += 1;
    for (let i = 0; i < n.childCount; i += 1) w(n.child(i));
  };
  w(t.rootNode);
  return { realParser: true, errorCount: e, parsed: e === 0 };
}

export interface AstNode {
  type: string;
  text: string;
  byteStart: number;
  byteEnd: number;
  line: number;
  column: number;
  /** the node's `name` field (childForFieldName('name')) when the grammar exposes one —
   * lets callers match a definition by identifier across languages, token-correctly. */
  name?: string;
}

/**
 * In-memory AST walk — the perception primitive. Parses `content` with the real
 * tree-sitter grammar and returns every node (optionally filtered to `types`) with
 * its exact source span. Because it is the PARSE tree, a token that lives inside a
 * string literal or a comment has node.type 'string' / 'comment' — never the type
 * of the thing it textually resembles. That is what makes extraction token-correct
 * by construction: a `@OnEvent('x')` written inside a template literal is a child of
 * a `template_string` node, not a `decorator` node, so a decorator query never sees
 * it. Returns null when no grammar is available (caller degrades / marks unjudged).
 */
export async function astNodes(
  content: string,
  lang?: string,
  types?: Set<string>,
): Promise<AstNode[] | null> {
  await ensureReady();
  const parser = await parserFor(lang);
  if (!parser) return null;
  const t = parser.parse(content);
  const out: AstNode[] = [];
  const stack: TsNode[] = [t.rootNode as TsNode];
  while (stack.length) {
    const n = stack.pop() as TsNode;
    if (!types || types.has(n.type)) {
      const nameNode = n.childForFieldName?.('name') ?? null;
      out.push({
        type: n.type,
        text: content.slice(n.startIndex, n.endIndex),
        byteStart: u16ToByte(content, n.startIndex),
        byteEnd: u16ToByte(content, n.endIndex),
        line: n.startPosition.row + 1,
        column: n.startPosition.column + 1,
        ...(nameNode ? { name: nameNode.text } : {}),
      });
    }
    for (let i = 0; i < n.childCount; i += 1) stack.push(n.child(i) as TsNode);
  }
  return out;
}

export function disposeNative(): void { /* in-process WASM -- nothing to dispose */ }
