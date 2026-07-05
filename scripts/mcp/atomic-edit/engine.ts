/**
 * Atomic-edit engine — the sub-line action space the blunt built-in editors lack.
 *
 * Thesis (Daniel, 2026-05-15): contemporary coding-agent CLIs expose only
 * coarse line/block/hunk operators, so microscopic intentions become
 * macroscopic patches. This engine implements the missing primitives —
 * range / insert / delete / batched-TextEdit / scoped-rename / literal-swap —
 * each STRUCTURALLY VALIDATED before any byte is written. It is the engine;
 * `server.ts` exposes it to the agent as first-class MCP tools.
 *
 * Invariants this engine enforces (which a raw line-rewrite does not):
 *  - No edit is committed if it introduces a NEW syntactic error into a
 *    TS/JS/JSON file (pre-existing errors are tolerated; we only forbid
 *    regression — surgical, never "make it worse").
 *  - Writes are atomic (temp file + rename) — no torn/partial files.
 *  - Multi-edit / multi-file operations are all-or-nothing.
 *  - Edits outside the repo root, or to governance-protected files, are refused.
 *
 * Pure functions here; all I/O and process concerns live in server.ts so this
 * module stays unit-testable.
 */


import { validateLanguage } from './lang-bridge.js';
import * as ts from 'typescript';
import { structuralErrors } from './engine-structural.js';
export type { EditZones } from './engine-zones.js';
import type { EditZones } from './engine-zones.js';
export { EMPTY_ZONES, computeZones } from './engine-zones.js';
import { EMPTY_ZONES, computeZones } from './engine-zones.js';

export interface Position {
  /** 1-based line. */
  line: number;
  /** 1-based column (UTF-16 code units within the line). */
  column: number;
}

export interface TextEditSpec {
  start: Position;
  end: Position;
  newText: string;
}

export interface ValidationResult {
  language: 'ts' | 'json' | 'structural' | 'generic' | 'python' | 'go' | 'rust' | 'ruby' | 'shell' | 'java' | 'c' | 'cpp' | 'javascript' | 'css' | 'sql' | 'html';
  /** Syntactic-diagnostic count before the edit. */
  before: number;
  /** Syntactic-diagnostic count after the edit. */
  after: number;
  ok: boolean;
  /** Human-readable first introduced error, when ok === false. */
  introduced?: string;
}

export interface ApplyResult {
  newText: string;
  validation: ValidationResult;
  /** chars actually mutated (the real intention size). */
  changedChars: number;
  /** chars on the lines a blunt line-rewrite would have touched. */
  lineSurfaceChars: number;
  /** lineSurfaceChars / max(changedChars,1) — the thesis Expansion Factor. */
  expansionFactor: number;
  /** Exact byte-level zones of preservation, modification, and movement. */
  zones: EditZones;
}

const TS_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
export { TS_EXT };

export function extOf(file: string): string {
  const i = file.lastIndexOf('.');
  return i < 0 ? '' : file.slice(i).toLowerCase();
}

function scriptKindFor(file: string): ts.ScriptKind {
  switch (extOf(file)) {
    case '.tsx':
      return ts.ScriptKind.TSX;
    case '.jsx':
      return ts.ScriptKind.JSX;
    case '.js':
    case '.mjs':
    case '.cjs':
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

/**
 * Count syntactic parse diagnostics. `parseDiagnostics` is TypeScript-internal
 * but is the standard fast syntactic check used across the ecosystem (prettier,
 * eslint TS parsers). We deliberately avoid a full Program: we want "did this
 * edit break the grammar", not type-checking.
 */
function syntacticErrorCount(file: string, text: string): number {
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    scriptKindFor(file),
  );
  const diags = (sf as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics;
  return Array.isArray(diags) ? diags.length : 0;
}

function firstIntroducedError(file: string, text: string): string | undefined {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKindFor(file));
  const diags = (sf as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics;
  if (!Array.isArray(diags) || diags.length === 0) return undefined;
  const d = diags[0];
  const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n');
  if (typeof d.start === 'number') {
    const { line, character } = ts.getLineAndCharacterOfPosition(sf, d.start);
    return `${msg} (at ${line + 1}:${character + 1})`;
  }
  return msg;
}

/** Validate that `after` did not regress relative to `before`. */
export function validate(file: string, before: string, after: string): ValidationResult {
  const ext = extOf(file);
  if (TS_EXT.has(ext)) {
    const b = syntacticErrorCount(file, before);
    const a = syntacticErrorCount(file, after);
    return {
      language: 'ts',
      before: b,
      after: a,
      ok: a <= b,
      introduced: a > b ? firstIntroducedError(file, after) : undefined,
    };
  }
  if (ext === '.json') {
    const safe = (s: string): boolean => {
      try {
        JSON.parse(s);
        return true;
      } catch {
        return false;
      }
    };
    const bOk = safe(before);
    const aOk = safe(after);
    return {
      language: 'json',
      before: bOk ? 0 : 1,
      after: aOk ? 0 : 1,
      ok: aOk || !bOk, // only forbid breaking a previously-valid JSON
      introduced: !aOk && bOk ? 'edit produced invalid JSON' : undefined,
    };
  }
  // Try real language parser before falling back to structural balance
  const langResult = validateLanguage(file, after);
  if (langResult.realParser || langResult.language !== 'generic') {
    if (langResult.realParser) {
      // Parser was available and ran — use its result
      // We need the BEFORE state too — parse the original
      const beforeResult = validateLanguage(file, before);
      const b = beforeResult.realParser ? beforeResult.errorCount : 0;
      const a = langResult.errorCount;
      return {
        language: langResult.language as ValidationResult['language'],
        before: b,
        after: a,
        ok: a <= b,
        introduced: a > b ? langResult.firstError : undefined,
      };
    }
    // Parser not available — fall through to structural
  }
  if (STRUCTURAL_EXT.has(ext)) {
    const b = structuralErrors(ext, before);
    const a = structuralErrors(ext, after);
    return {
      language: 'structural',
      before: b.length,
      after: a.length,
      ok: a.length <= b.length, // only forbid regressing structural balance
      introduced: a.length > b.length ? a[0] : undefined,
    };
  }
  return { language: 'generic', before: 0, after: 0, ok: true };
}

/**
 * Languages with no TS-grade parser available here. We do NOT fake a full
 * parse (that would be dishonest). We do a delimiter/string-aware structural
 * balance — the single check that catches the overwhelmingly most common
 * atomic-edit breakage (a deleted `)`, an unterminated string, a stray
 * `}`), is language-agnostic, and produces no false positives on valid
 * code. Indentation/semantic correctness is explicitly out of scope and
 * declared so (`language: "structural"`, not the language name).
 */
const STRUCTURAL_EXT = new Set([
  '.py',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.c',
  '.h',
  '.cc',
  '.cpp',
  '.hpp',
  '.cs',
  '.rb',
  '.php',
  '.swift',
  '.scala',
  '.sh',
  '.bash',
  '.zsh',
  '.css',
  '.scss',
  '.less',
  '.sql',
  '.yaml',
  '.yml',
  '.toml',
]);


/** Quote chars that start a string per family. Hash-comment langs use #;
 * C-family use // and /​* *​/. We stay conservative: only well-known forms,
 * never guessing, so valid code never trips. */

/** Convert a 1-based (line,column) to an absolute UTF-16 offset. */
export function posToOffset(text: string, pos: Position): number {
  if (pos.line < 1 || pos.column < 1) {
    throw new Error(`position out of range: ${pos.line}:${pos.column} (1-based required)`);
  }
  let offset = 0;
  let line = 1;
  while (line < pos.line) {
    const nl = text.indexOf('\n', offset);
    if (nl === -1) {
      throw new Error(`line ${pos.line} does not exist (file has ${line} line(s))`);
    }
    offset = nl + 1;
    line++;
  }
  const lineEnd = text.indexOf('\n', offset);
  const lineLen = (lineEnd === -1 ? text.length : lineEnd) - offset;
  // column may equal lineLen + 1 (one past the last char = end-of-line insert).
  if (pos.column - 1 > lineLen) {
    throw new Error(
      `column ${pos.column} out of range on line ${pos.line} (line has ${lineLen} char(s))`,
    );
  }
  return offset + (pos.column - 1);
}

function offsetToLine(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}

function lineSurface(text: string, startOff: number, endOff: number): number {
  const firstNl = text.lastIndexOf('\n', startOff - 1);
  const lineStart = firstNl === -1 ? 0 : firstNl + 1;
  let lineEnd = text.indexOf('\n', endOff);
  if (lineEnd === -1) lineEnd = text.length;
  return lineEnd - lineStart;
}

/**
 * Apply one or more non-overlapping TextEdits atomically (LSP semantics).
 * Edits are validated against each other (no overlap) and applied
 * right-to-left so earlier offsets stay valid. Returns the new text plus
 * structural validation and Expansion-Factor metrics; the caller decides
 * whether to persist (it must NOT persist when validation.ok === false).
 */
export function applyEdits(file: string, original: string, edits: TextEditSpec[]): ApplyResult {
  if (edits.length === 0) throw new Error('no edits provided');

  const resolved = edits
    .map((e) => {
      const start = posToOffset(original, e.start);
      const end = posToOffset(original, e.end);
      if (end < start) {
        throw new Error(
          `edit end before start: ${e.start.line}:${e.start.column} -> ${e.end.line}:${e.end.column}`,
        );
      }
      return { start, end, newText: e.newText };
    })
    .sort((a, b) => a.start - b.start);

  for (let i = 1; i < resolved.length; i++) {
    if (resolved[i].start < resolved[i - 1].end) {
      throw new Error('overlapping edits are not allowed in a single atomic batch');
    }
  }

  let next = original;
  let changedChars = 0;
  let surfaceMin = Number.POSITIVE_INFINITY;
  let surfaceMax = 0;
  for (let i = resolved.length - 1; i >= 0; i--) {
    const { start, end, newText } = resolved[i];
    next = next.slice(0, start) + newText + next.slice(end);
    changedChars += Math.max(end - start, newText.length);
    const s = lineSurface(original, start, end);
    surfaceMin = Math.min(surfaceMin, s);
    surfaceMax = Math.max(surfaceMax, s);
  }

  const validation = validate(file, original, next);
  const lineSurfaceChars = Number.isFinite(surfaceMin) ? surfaceMax : 0;
  return {
    newText: next,
    validation,
    changedChars,
    lineSurfaceChars,
    expansionFactor: Number((lineSurfaceChars / Math.max(changedChars, 1)).toFixed(2)),
    zones: computeZones(original, next),
  };
}

export type WrapKind = 'try-catch' | 'block' | 'if';

/**
 * Lever #4 — semantic refactor: wrap an exact range in a try/catch, a bare
 * block, or an `if (condition)`. One intention ("make this resilient" /
 * "guard this") expressed as ONE validated atomic op instead of a hand
 * line-rewrite. Re-indents the wrapped body, preserves the base indent, and
 * routes through the same no-syntax-regression validate(). `if` REQUIRES an
 * explicit condition (no behaviour invented).
 */
export function wrapRange(
  file: string,
  original: string,
  start: Position,
  end: Position,
  kind: WrapKind,
  condition?: string,
): ApplyResult {
  const s = posToOffset(original, start);
  const e = posToOffset(original, end);
  if (e < s) throw new Error(`wrap end before start`);
  if (kind === 'if' && !condition) throw new Error(`'if' wrap requires an explicit condition`);
  const lineStartOff = original.lastIndexOf('\n', s - 1) + 1;
  const baseIndentMatch = /^[ \t]*/.exec(original.slice(lineStartOff, s));
  const indent = baseIndentMatch ? baseIndentMatch[0] : '';
  const body = original.slice(s, e);
  const reindented = body
    .split('\n')
    .map((ln, i) => (i === 0 ? ln : ln.length ? `  ${ln}` : ln))
    .join('\n');
  const open = kind === 'try-catch' ? 'try {' : kind === 'if' ? `if (${condition}) {` : '{';
  const close =
    kind === 'try-catch' ? `} catch (error) {\n${indent}  throw error;\n${indent}}` : '}';
  const wrapped = `${open}\n${indent}  ${reindented}\n${indent}${close}`;
  const next = original.slice(0, s) + wrapped + original.slice(e);
  const validation = validate(file, original, next);
  const changedChars = Math.max(e - s, wrapped.length);
  const firstNl = original.lastIndexOf('\n', s - 1);
  const ls = firstNl === -1 ? 0 : firstNl + 1;
  let le = original.indexOf('\n', e);
  if (le === -1) le = original.length;
  const lineSurfaceChars = le - ls;
  return {
    newText: next,
    validation,
    changedChars,
    lineSurfaceChars,
    expansionFactor: Number((lineSurfaceChars / Math.max(changedChars, 1)).toFixed(2)),
    zones: computeZones(original, next),
  };
}

export interface RenameResult {
  newText: string;
  occurrences: number;
  symbol: string;
  validation: ValidationResult;
  zones: EditZones;
}

/**
 * Scope-correct, single-file rename of the identifier at (line,column).
 * Uses ts-morph so binding/shadowing is respected — this is the
 * "one intention, not N text rewrites" semantic operator from the thesis.
 * Cross-file rename is intentionally out of scope v1 (keeps blast radius
 * surgical and reviewable; documented honestly, not silently).
 */
export async function renameSymbol(
  file: string,
  original: string,
  pos: Position,
  newName: string,
): Promise<RenameResult> {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(newName)) {
    throw new Error(`invalid identifier: ${JSON.stringify(newName)}`);
  }
  if (!TS_EXT.has(extOf(file))) {
    throw new Error(`rename_symbol only supports TS/JS files, got ${extOf(file) || '(none)'}`);
  }
  const { Project } = await import('ts-morph');
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { allowJs: true, jsx: ts.JsxEmit.Preserve, noEmit: true },
  });
  const sf = project.createSourceFile(file, original, { overwrite: true });
  const offset = posToOffset(original, pos);
  const node = sf.getDescendantAtPos(offset);
  if (!node) throw new Error(`no AST node at ${pos.line}:${pos.column}`);
  const id =
    node.getKindName() === 'Identifier'
      ? node
      : node.getFirstAncestorByKind?.(ts.SyntaxKind.Identifier);
  if (!id || id.getKindName() !== 'Identifier') {
    throw new Error(
      `position ${pos.line}:${pos.column} is not on an identifier (got ${node.getKindName()})`,
    );
  }
  const oldName = id.getText();
  const renameable = id.asKindOrThrow(ts.SyntaxKind.Identifier);
  // count references before mutating
  const refs = renameable.findReferences().reduce((n, r) => n + r.getReferences().length, 0);
  renameable.rename(newName);
  const next = sf.getFullText();
  return {
    newText: next,
    occurrences: refs,
    symbol: `${oldName} -> ${newName}`,
    validation: validate(file, original, next),
    zones: computeZones(original, next),
  };
}

export interface LiteralSwapResult {
  newText: string;
  matched: { line: number; column: number; old: string }[];
  validation: ValidationResult;
  zones: EditZones;
}

/**
 * Replace a string/numeric/boolean/null literal whose source text equals
 * `currentText`, optionally constrained to `onLine`. This is the direct
 * answer to the thesis worked example: `'5511999999999'` -> `null` as a
 * single AST-targeted intention, not a line rewrite. Refuses ambiguous
 * matches (>1) unless a line is given that disambiguates to exactly one.
 */
export async function replaceLiteral(
  file: string,
  original: string,
  currentText: string,
  newText: string,
  onLine?: number,
): Promise<LiteralSwapResult> {
  if (!TS_EXT.has(extOf(file))) {
    throw new Error(`replace_literal only supports TS/JS files, got ${extOf(file) || '(none)'}`);
  }
  const { Project, SyntaxKind } = await import('ts-morph');
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { allowJs: true, jsx: ts.JsxEmit.Preserve, noEmit: true },
  });
  const sf = project.createSourceFile(file, original, { overwrite: true });
  const literalKinds = new Set<number>([
    SyntaxKind.StringLiteral,
    SyntaxKind.NumericLiteral,
    SyntaxKind.NoSubstitutionTemplateLiteral,
    SyntaxKind.TrueKeyword,
    SyntaxKind.FalseKeyword,
    SyntaxKind.NullKeyword,
  ]);
  const hits = sf
    .getDescendants()
    .filter((d) => literalKinds.has(d.getKind()) && d.getText() === currentText)
    .filter((d) => {
      if (onLine == null) return true;
      return d.getStartLineNumber() === onLine;
    });
  if (hits.length === 0) {
    throw new Error(
      `no literal with text ${JSON.stringify(currentText)}${onLine ? ` on line ${onLine}` : ''}`,
    );
  }
  if (hits.length > 1) {
    const lines = hits.map((h) => h.getStartLineNumber()).join(', ');
    throw new Error(
      `ambiguous: ${hits.length} literals match (lines ${lines}); pass onLine to disambiguate`,
    );
  }
  const target = hits[0];
  const matched = [
    {
      line: target.getStartLineNumber(),
      column: target.getStart() - target.getStartLinePos() + 1,
      old: target.getText(),
    },
  ];
  target.replaceWithText(newText);
  const next = sf.getFullText();
  return { newText: next, matched, validation: validate(file, original, next), zones: computeZones(original, next) };
}

/**
 * Exact-string replacement with the ergonomics of the blunt builtin `edit`
 * (oldText -> newText, uniqueness-checked) BUT routed through the same
 * no-syntax-regression validation + Expansion-Factor metric as every other
 * atomic op. This is the primitive whose absence made swarm agents abandon
 * the atomic suite and fall back to the unsafe builtin for multi-line edits.
 *
 * occurrence: 1-based. Omit → require exactly one match (refuse ambiguity,
 * exactly like builtin edit's uniqueness contract). Provide → target the Nth.
 */
export function replaceText(
  file: string,
  original: string,
  oldText: string,
  newText: string,
  occurrence?: number,
): ApplyResult {
  if (oldText.length === 0) throw new Error('oldText must be non-empty');
  if (oldText === newText) throw new Error('oldText and newText are identical');

  const offsets: number[] = [];
  for (let i = original.indexOf(oldText); i !== -1; i = original.indexOf(oldText, i + 1)) {
    offsets.push(i);
  }
  if (offsets.length === 0) {
    throw new Error(
      `oldText not found (verbatim, incl. whitespace): ${JSON.stringify(oldText.slice(0, 80))}`,
    );
  }
  let start: number;
  if (occurrence == null) {
    if (offsets.length > 1) {
      const candidates = offsets.map((o) => {
        const before = original.slice(0, o).split('\n');
        return `line ${before.length}`;
      });
      throw new Error(
        `ambiguous: ${offsets.length} occurrences of oldText. ` +
          `Candidates: [${candidates.join(', ')}]. ` +
          `Add surrounding context to make it unique, or pass occurrence (1-${offsets.length})`,
      );
    }
    start = offsets[0];
  } else {
    if (occurrence < 1 || occurrence > offsets.length) {
      throw new Error(`occurrence ${occurrence} out of range (1-${offsets.length})`);
    }
    start = offsets[occurrence - 1];
  }
  const end = start + oldText.length;
  const next = original.slice(0, start) + newText + original.slice(end);
  const lineSurfaceChars = lineSurface(original, start, end);
  const changedChars = Math.max(end - start, newText.length);
  return {
    newText: next,
    validation: validate(file, original, next),
    changedChars,
    lineSurfaceChars,
    expansionFactor: Number((lineSurfaceChars / Math.max(changedChars, 1)).toFixed(2)),
    zones: computeZones(original, next),
  };
}

export { offsetToLine };
