/**
 * Universal (multi-language) read-side navigation — the tree-sitter counterpart
 * of the ts-morph outline/read_symbol, so `code_outline` and `code_read_symbol`
 * enumerate and read named definitions in ALL first-class grammars, not just
 * TS/JS. Read-only; CST-correct (a def is a real definition node, matched by its
 * `name` field).
 */
import { astNodes } from './native-bridge.js';
import { extToGrammar } from './engine-universal.js';
import { DEF_TYPES } from './engine-universal-symbols.js';

export interface UniversalSymbolInfo {
  selector: string;
  kind: string;
  startLine: number;
  endLine: number;
  signature: string;
}

export interface UniversalReadResult {
  selector: string;
  kind: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  code: string;
}

function endLineOf(startLine: number, text: string): number {
  return startLine + (text.split('\n').length - 1);
}

/** Enumerate named definitions for any grammar-backed language; null when unsupported. */
export async function universalOutline(text: string, ext: string): Promise<UniversalSymbolInfo[] | null> {
  const grammar = extToGrammar(ext);
  if (!grammar || grammar === 'json') return null;
  const types = DEF_TYPES[grammar];
  if (!types) return null;
  const nodes = await astNodes(text, grammar, types);
  if (!nodes) return null;
  return nodes
    .filter((n) => typeof n.name === 'string' && n.name.length > 0)
    .map((n) => ({
      selector: n.name as string,
      kind: n.type,
      startLine: n.line,
      endLine: endLineOf(n.line, n.text),
      signature: (n.text.split('\n')[0] ?? '').trim().slice(0, 120),
    }))
    .sort((a, b) => a.startLine - b.startLine);
}

/** Read a named definition's full syntactic unit + range for any grammar-backed language. */
export async function universalReadSymbol(text: string, selector: string, ext: string): Promise<UniversalReadResult> {
  const grammar = extToGrammar(ext);
  if (!grammar || grammar === 'json') throw new Error(`read_symbol: no symbol grammar for ${ext || '(none)'}`);
  const types = DEF_TYPES[grammar];
  if (!types) throw new Error(`read_symbol: unsupported grammar "${grammar}"`);
  const nodes = await astNodes(text, grammar, types);
  if (!nodes) throw new Error(`read_symbol: ${grammar} parser unavailable (universal engine not loaded)`);
  const matches = nodes.filter((n) => n.name === selector);
  if (matches.length === 0) throw new Error(`read_symbol: no ${grammar} definition named "${selector}" found`);
  if (matches.length > 1) throw new Error(`read_symbol: "${selector}" is ambiguous — ${matches.length} definitions`);
  const n = matches[0];
  const lines = n.text.split('\n');
  return {
    selector,
    kind: n.type,
    startLine: n.line,
    startColumn: n.column,
    endLine: endLineOf(n.line, n.text),
    endColumn: (lines[lines.length - 1]?.length ?? 0) + 1,
    code: n.text,
  };
}
