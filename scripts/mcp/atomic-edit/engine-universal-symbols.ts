/**
 * Universal (multi-language) symbol editing — the tree-sitter counterpart of the
 * ts-morph edit_symbol, so a named definition (function / class / method / type)
 * can be replaced, inserted-after, or removed in ALL first-class grammars, not
 * just TS/JS. CST-correct by construction: the target is a real definition node
 * located by its `name` field, so a `def greet` written inside a string literal
 * is a `string` node and is never matched.
 */
import { astNodes } from './native-bridge.js';
import { validate, type ValidationResult } from './engine.js';
import { extToGrammar } from './engine-universal.js';

export type UniversalSymbolOp = 'replace' | 'insert_after' | 'remove';

export interface UniversalSymbolResult {
  newText: string;
  validation: ValidationResult;
  selector: string;
  op: UniversalSymbolOp;
  startLine: number;
  endLine: number;
  method: 'cst-correct';
}

/** Named-definition node types per grammar; each exposes childForFieldName('name'). */
export const DEF_TYPES: Record<string, Set<string>> = {
  python: new Set(['function_definition', 'class_definition']),
  javascript: new Set(['function_declaration', 'generator_function_declaration', 'class_declaration', 'method_definition']),
  typescript: new Set(['function_declaration', 'generator_function_declaration', 'class_declaration', 'abstract_class_declaration', 'method_definition', 'interface_declaration', 'type_alias_declaration', 'enum_declaration']),
  tsx: new Set(['function_declaration', 'generator_function_declaration', 'class_declaration', 'abstract_class_declaration', 'method_definition', 'interface_declaration', 'type_alias_declaration', 'enum_declaration']),
  go: new Set(['function_declaration', 'method_declaration', 'type_declaration']),
  ruby: new Set(['method', 'singleton_method', 'class', 'module']),
  rust: new Set(['function_item', 'struct_item', 'enum_item', 'trait_item', 'mod_item']),
  java: new Set(['method_declaration', 'constructor_declaration', 'class_declaration', 'interface_declaration', 'enum_declaration']),
  c: new Set(['function_definition']),
  cpp: new Set(['function_definition', 'class_specifier', 'namespace_definition']),
  bash: new Set(['function_definition']),
};

/**
 * Edit a named definition in any grammar-backed language. Throws (clean refusal)
 * when the language has no symbol grammar, the symbol is not found, or it is
 * ambiguous — never guesses, never silently corrupts.
 */
export async function universalEditSymbol(
  file: string,
  original: string,
  selector: string,
  op: UniversalSymbolOp,
  code: string | undefined,
  ext: string,
): Promise<UniversalSymbolResult> {
  const grammar = extToGrammar(ext);
  if (!grammar || grammar === 'json') {
    throw new Error(`edit_symbol: no symbol grammar for ${ext || '(none)'} — use atomic_replace_at / atomic_replace_between_anchors for this file.`);
  }
  const types = DEF_TYPES[grammar];
  if (!types) throw new Error(`edit_symbol: unsupported grammar "${grammar}"`);
  const nodes = await astNodes(original, grammar, types);
  if (!nodes) throw new Error(`edit_symbol: ${grammar} parser unavailable (universal engine not loaded)`);
  const matches = nodes.filter((n) => n.name === selector);
  if (matches.length === 0) throw new Error(`edit_symbol: no ${grammar} definition named "${selector}" found`);
  if (matches.length > 1) throw new Error(`edit_symbol: "${selector}" is ambiguous — ${matches.length} definitions; narrow the selector`);
  const node = matches[0];

  // astNodes byte offsets are UTF-8 byte positions; index the JS (UTF-16) string by
  // the node's exact text. A named definition's text is unique — refuse if it is not,
  // so the edit stays byte-correct under multibyte content.
  const at = original.indexOf(node.text);
  if (at < 0 || original.indexOf(node.text, at + 1) >= 0) {
    throw new Error(`edit_symbol: could not uniquely locate the body of "${selector}" for a byte-correct edit`);
  }
  const end = at + node.text.length;

  let newText: string;
  if (op === 'remove') {
    let s = at;
    while (s > 0 && (original[s - 1] === ' ' || original[s - 1] === '\t')) s -= 1;
    let e = end;
    if (original[e] === '\n') e += 1;
    newText = original.slice(0, s) + original.slice(e);
  } else if (op === 'replace') {
    if (code == null) throw new Error('edit_symbol op "replace" requires code');
    newText = original.slice(0, at) + code + original.slice(end);
  } else {
    if (code == null) throw new Error('edit_symbol op "insert_after" requires code');
    newText = `${original.slice(0, end)}\n\n${code}${original.slice(end)}`;
  }

  return { newText, validation: validate(file, original, newText), selector, op, startLine: node.line, endLine: node.line, method: 'cst-correct' };
}
