/**
 * Atomic Engine — Remaining Topology Operations
 * 
 * Completes the 25-topology taxonomy from the Atomic Action Principle.
 * All operations are language-agnostic with syntax validation.
 */

import { validate, type ValidationResult, type EditZones, computeZones, EMPTY_ZONES, type Position } from './engine.js';
export type { EditZones } from './engine.js';
export { EMPTY_ZONES, computeZones } from './engine.js';
import { replaceText } from './engine.js';

// ─────────────────────────── helpers ───────────────────────────

function posToOffset(text: string, pos: Position): number {
  let off = 0;
  for (let l = 1; l < pos.line; l++) {
    const nl = text.indexOf('\n', off);
    if (nl === -1) throw new Error(`line ${pos.line} out of range`);
    off = nl + 1;
  }
  return off + (pos.column - 1);
}

function offsetToPos(text: string, offset: number): Position {
  let line = 1, col = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') { line++; col = 1; }
    else col++;
  }
  return { line, column: col };
}

// ═══════════════════════ 5: replace_operator ═══════════════════════

const OPERATORS = new Set([
  '<', '<=', '>', '>=', '==', '===', '!=', '!==',
  '&&', '||', '??', '&', '|', '^', '<<', '>>',
  '+', '-', '*', '/', '%', '**', '//',
  '=', '+=', '-=', '*=', '/=', '%=',
  'and', 'or', 'not', 'in', 'is',
]);

export interface OperatorReplaceResult {
  newText: string;
  oldOp: string;
  newOp: string;
  validation: ValidationResult;
  zones: EditZones;
}

/**
 * Replace a binary/logical/assignment operator at line:column, preserving operands.
 * Works on any language. Matches the operator token at the given position.
 * Example: `if (count < limit)` → `if (count <= limit)` with cursor on `<`.
 */
export function replaceOperator(
  file: string, original: string, line: number, column: number, newOp: string,
): OperatorReplaceResult {
  const offset = posToOffset(original, { line, column });

  // Scan left for operator start
  let start = offset;
  while (start > 0 && /[<>=!&|^+\-*/%?.a-zA-Z]/.test(original[start - 1])) start--;
  // Scan right for operator end
  let end = offset;
  while (end < original.length && /[<>=!&|^+\-*/%?.a-zA-Z]/.test(original[end])) end++;

  const oldOp = original.slice(start, end).trim();
  if (!oldOp) throw new Error(`no operator found at ${line}:${column}`);
  if (oldOp === newOp) {
    return { newText: original, oldOp, newOp, validation: validate(file, original, original), zones: EMPTY_ZONES };
  }

  const newText = original.slice(0, start) + newOp + original.slice(end);
  return { newText, oldOp, newOp, validation: validate(file, original, newText), zones: computeZones(original, newText) };
}

// ═══════════════════════ 10: reorder_list_items ═══════════════════

export interface ReorderResult {
  newText: string;
  moved: string;
  fromIndex: number;
  toIndex: number;
  validation: ValidationResult;
  zones: EditZones;
}

/**
 * Move item at fromIndex (0-based) to toIndex (0-based) in a comma-separated list.
 * Handles import lists, array items, argument lists, enum members.
 * The trace records this as MOVEMENT, not deletion+creation.
 * 
 * Works by locating the list starting at line:column, parsing comma-separated items,
 * and rearranging. Items are identified by comma boundaries with depth tracking.
 */
export function reorderListItem(
  file: string, original: string, line: number, column: number,
  fromIndex: number, toIndex: number,
): ReorderResult {
  // Find the enclosing brackets/parens/braces from the position
  const offset = posToOffset(original, { line, column });
  
  // Find list boundaries — search for enclosing { } ( ) [ ]
  const pairs: Record<string, string> = { '{': '}', '(': ')', '[': ']' };
  const closes: Record<string, string> = { '}': '{', ')': '(', ']': '[' };
  
  // Find the nearest enclosing pair
  let depth = 0;
  let listStart = -1, listEnd = -1;
  let openChar = '', closeChar = '';
  
  // Walk backward to find opening delimiter
  for (let i = offset; i >= 0; i--) {
    const c = original[i];
    if (c in closes) depth++;
    else if (c in pairs) {
      if (depth === 0) { listStart = i; openChar = c; closeChar = pairs[c]; break; }
      depth--;
    }
  }
  if (listStart < 0) throw new Error('no enclosing list found');
  
  // Walk forward to find closing delimiter
  depth = 0;
  for (let i = listStart + 1; i < original.length; i++) {
    const c = original[i];
    if (c === openChar) depth++;
    else if (c === closeChar) {
      if (depth === 0) { listEnd = i; break; }
      depth--;
    }
  }
  if (listEnd < 0) throw new Error('unclosed list');

  // Parse comma-separated items
  const listContent = original.slice(listStart + 1, listEnd);
  const items: { text: string; start: number; end: number }[] = [];
  let itemStart = listStart + 1;
  let depth2 = 0;
  
  for (let i = listStart + 1; i <= listEnd; i++) {
    const c = original[i];
    if (c === openChar || c === '(' || c === '[' || c === '{') depth2++;
    else if (c === closeChar || c === ')' || c === ']' || c === '}') {
      depth2--;
      if (depth2 < 0) {
        // End of list — capture last item
        const text = original.slice(itemStart, i).trim();
        if (text) items.push({ text, start: itemStart, end: i });
        break;
      }
    } else if (c === ',' && depth2 === 0) {
      const text = original.slice(itemStart, i).trim();
      if (text) items.push({ text, start: itemStart, end: i });
      itemStart = i + 1;
    }
  }

  if (fromIndex < 0 || fromIndex >= items.length) throw new Error(`fromIndex ${fromIndex} out of range (0-${items.length - 1})`);
  if (toIndex < 0 || toIndex >= items.length) throw new Error(`toIndex ${toIndex} out of range (0-${items.length - 1})`);
  if (fromIndex === toIndex) {
    return { newText: original, moved: items[fromIndex].text, fromIndex, toIndex, validation: validate(file, original, original), zones: EMPTY_ZONES };
  }

  // Move the item
  const moved = items.splice(fromIndex, 1)[0];
  items.splice(toIndex, 0, moved);

  // Reconstruct
  const before = original.slice(0, listStart + 1);
  const after = original.slice(listEnd);
  const reconstructed = items.map(i => original.slice(i.start, i.end)).join(',');
  const newText = before + reconstructed + after;

  return { newText, moved: moved.text, fromIndex, toIndex, validation: validate(file, original, newText), zones: computeZones(original, newText) };
}

// ═══════════════════ 12: change_signature ═══════════════════════

export interface SignatureChangeResult {
  newText: string;
  validation: ValidationResult;
  zones: EditZones;
}

/**
 * Change a function signature — rename parameters, add parameters, or change return type.
 * Preserves the function body exactly.
 * 
 * Modes:
 * - 'rename_param': rename parameter at paramIndex to newName
 * - 'add_param': add newParam after paramIndex (-1 = before first)
 * - 'remove_param': remove parameter at paramIndex
 * - 'add_return_type': add/change return type annotation
 */
export function changeSignature(
  file: string, original: string,
  fnLine: number, fnColumn: number,
  mode: 'rename_param' | 'add_param' | 'remove_param' | 'add_return_type',
  paramIndex: number,
  newValue: string,
): SignatureChangeResult {
  const offset = posToOffset(original, { line: fnLine, column: fnColumn });

  // Find the opening paren of the function
  let paren = offset;
  while (paren < original.length && original[paren] !== '(') paren++;
  if (paren >= original.length) throw new Error('no opening paren found');

  // Find the closing paren (depth-aware)
  let depth = 1;
  let closeParen = paren + 1;
  while (closeParen < original.length && depth > 0) {
    if (original[closeParen] === '(') depth++;
    else if (original[closeParen] === ')') depth--;
    closeParen++;
  }
  closeParen--; // point at the ')'

  if (mode === 'add_return_type') {
    // Insert return type after closing paren, before opening brace
    let after = closeParen + 1;
    while (after < original.length && /\s/.test(original[after])) after++;
    // Check for existing return type (colon notation)
    if (original[after] === ':') {
      // Replace existing return type
      let end = after + 1;
      while (end < original.length && /\s/.test(original[end])) end++;
      while (end < original.length && /[A-Za-z0-9_<>[\]|&.,\s]/.test(original[end])) end++;
      const newText = original.slice(0, after) + ': ' + newValue + original.slice(end);
      return { newText, validation: validate(file, original, newText), zones: computeZones(original, newText) };
    }
    // Add new return type
    const newText = original.slice(0, after) + ': ' + newValue + ' ' + original.slice(after);
    return { newText, validation: validate(file, original, newText), zones: computeZones(original, newText) };
  }

  // Parse parameters
  const paramsText = original.slice(paren + 1, closeParen);
  const params = parseParamList(paramsText);

  if (mode === 'rename_param') {
    if (paramIndex < 0 || paramIndex >= params.length) throw new Error(`paramIndex ${paramIndex} out of range`);
    const oldParam = params[paramIndex];
    // Replace just the parameter name in the param text
    const nameMatch = oldParam.trim().match(/^([A-Za-z_$][A-Za-z0-9_$]*)/);
    if (!nameMatch) throw new Error(`cannot identify parameter name in "${oldParam.trim()}"`);
    const oldName = nameMatch[1];
    params[paramIndex] = oldParam.replace(oldName, newValue);
  } else if (mode === 'add_param') {
    const insertAt = paramIndex < 0 || paramIndex >= params.length ? params.length : paramIndex;
    params.splice(insertAt, 0, newValue);
  } else if (mode === 'remove_param') {
    if (paramIndex < 0 || paramIndex >= params.length) throw new Error(`paramIndex ${paramIndex} out of range`);
    params.splice(paramIndex, 1);
  }

  const newParamsText = params.join(', ');
  const newText = original.slice(0, paren + 1) + newParamsText + original.slice(closeParen);
  return { newText, validation: validate(file, original, newText), zones: computeZones(original, newText) };
}

function parseParamList(text: string): string[] {
  if (!text.trim()) return [];
  const params: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '[' || c === '{' || c === '<') depth++;
    else if (c === ')' || c === ']' || c === '}' || c === '>') depth--;
    else if (c === ',' && depth === 0) {
      params.push(text.slice(start, i));
      start = i + 1;
    }
  }
  params.push(text.slice(start));
  return params;
}

// ═══════════════════ 13: replace_body_keep_signature ═════════════

export interface BodyReplaceResult {
  newText: string;
  validation: ValidationResult;
  zones: EditZones;
}

/**
 * Replace a function/method body while preserving the signature exactly.
 * Signature = everything from `function/def/fn/func` through the closing `)` 
 * (including return type annotation if present).
 * Body = everything between `{` and `}` (or indented block for Python).
 */
export function replaceBodyKeepSignature(
  file: string, original: string, fnLine: number, fnColumn: number, newBody: string,
): BodyReplaceResult {
  const offset = posToOffset(original, { line: fnLine, column: fnColumn });
  const ext = file.slice(file.lastIndexOf('.')).toLowerCase();

  // Find closing paren (depth-aware)
  let paren = offset;
  while (paren < original.length && original[paren] !== '(') paren++;
  let depth = 1, closeParen = paren + 1;
  while (closeParen < original.length && depth > 0) {
    if (original[closeParen] === '(') depth++;
    else if (original[closeParen] === ')') depth--;
    closeParen++;
  }
  closeParen--;

  // Python: indented block
  if (ext === '.py') {
    // Skip return type annotation if present
    let bodyStart = closeParen + 1;
    while (bodyStart < original.length && /\s/.test(original[bodyStart])) bodyStart++;
    if (original[bodyStart] === ':') {
      bodyStart++;
      while (bodyStart < original.length && /\s/.test(original[bodyStart])) bodyStart++;
    }
    // Python body starts at `:` and is indented. Replace from bodyStart to end of indented block.
    // Find the dedent (next line at same or lower indent than function def)
    const defLine = original.slice(0, offset).split('\n').length;
    const lines = original.split('\n');
    const baseIndent = lines[defLine - 1].match(/^(\s*)/)?.[1]?.length || 0;
    let bodyEndLine = defLine;
    for (let i = defLine; i < lines.length; i++) {
      const lineIndent = lines[i].match(/^(\s*)/)?.[1]?.length || 0;
      if (lines[i].trim() && lineIndent <= baseIndent) { bodyEndLine = i; break; }
      bodyEndLine = i + 1;
    }
    const bodyEnd = lines.slice(0, bodyEndLine).join('\n').length;
    // Indent the new body
    const indentedBody = newBody.split('\n').map(l => '    ' + l).join('\n');
    const newText = original.slice(0, bodyStart) + '\n' + indentedBody + original.slice(bodyEnd);
    return { newText, validation: validate(file, original, newText), zones: computeZones(original, newText) };
  }

  // Braced languages: find opening {
  let afterSig = closeParen + 1;
  while (afterSig < original.length && /\s/.test(original[afterSig])) afterSig++;
  // Check for `:` return type annotation (TS, Swift, Kotlin, Rust)
  if (original[afterSig] === ':') {
    while (afterSig < original.length && original[afterSig] !== '{' && original[afterSig] !== '\n') afterSig++;
    while (afterSig < original.length && /\s/.test(original[afterSig])) afterSig++;
  }

  if (original[afterSig] !== '{') {
    throw new Error('no opening brace found after signature');
  }

  // Find matching closing brace
  depth = 1;
  let close = afterSig + 1;
  while (close < original.length && depth > 0) {
    if (original[close] === '{') depth++;
    else if (original[close] === '}') depth--;
    close++;
  }
  close--;

  const newText = original.slice(0, afterSig + 1) + '\n' + newBody + '\n' + original.slice(close);
  return { newText, validation: validate(file, original, newText), zones: computeZones(original, newText) };
}

// ═══════════════════ 18/19: decorator operations ════════════════

export interface DecoratorResult {
  newText: string;
  validation: ValidationResult;
  zones: EditZones;
}

/**
 * Add a decorator/annotation before a function/method/class.
 * Handles: Python @decorator, Java @Annotation, TS/JS @Decorator(), Rust #[attr], Go comments.
 */
export function addDecorator(
  file: string, original: string, targetLine: number, decorator: string,
): DecoratorResult {
  const lines = original.split('\n');
  const idx = targetLine - 1;
  if (idx < 0 || idx >= lines.length) throw new Error('line out of range');

  // Get the indentation of the target line
  const indent = lines[idx].match(/^(\s*)/)?.[1] || '';

  // Insert decorator on the line before, with same indentation
  const decoratorLine = indent + decorator;
  lines.splice(idx, 0, decoratorLine);

  const newText = lines.join('\n');
  return { newText, validation: validate(file, original, newText), zones: computeZones(original, newText) };
}

/**
 * Replace a decorator/annotation on the line before a target.
 * Finds the decorator (line matching pattern) immediately preceding targetLine.
 */
export function replaceDecorator(
  file: string, original: string, targetLine: number, oldDecorator: string, newDecorator: string,
): DecoratorResult {
  const lines = original.split('\n');
  const idx = targetLine - 1;
  if (idx < 1) throw new Error('target must have a preceding line');

  const indent = lines[idx].match(/^(\s*)/)?.[1] || '';

  // Look backward from targetLine-1 for the decorator
  for (let i = idx - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed === oldDecorator.trim() || trimmed.startsWith(oldDecorator.trim().replace(/\(.*/, '('))) {
      lines[i] = indent + newDecorator;
      break;
    }
    
    // Stop if we hit a non-decorator, non-comment, non-blank line
    if (trimmed && !trimmed.startsWith('@') && !trimmed.startsWith('#') && !trimmed.startsWith('//')) break;
  }

  const newText = lines.join('\n');
  return { newText, validation: validate(file, original, newText), zones: computeZones(original, newText) };
}

// ═══════════════════ 20: move_into_scope ═══════════════════════

export interface MoveScopeResult {
  newText: string;
  validation: ValidationResult;
  zones: EditZones;
}

/**
 * Move one or more lines of code into a new scope (if block, try/catch, with statement, etc).
 * This is "wrapper-preserves-content" — the lines are wrapped without modification.
 * 
 * @param scopeHeader — the opening line (e.g., "if (user != null) {", "try:", "with open(f) as f:")
 * @param scopeFooter — the closing line (e.g., "}", "" for Python dedent)
 * @param startLine — first line to move into scope
 * @param endLine — last line to move into scope (inclusive)
 */
export function moveIntoScope(
  file: string, original: string,
  startLine: number, endLine: number,
  scopeHeader: string, scopeFooter: string,
): MoveScopeResult {
  const lines = original.split('\n');
  const startIdx = startLine - 1;
  const endIdx = endLine - 1;
  
  if (startIdx < 0 || endIdx >= lines.length || startIdx > endIdx) {
    throw new Error('invalid line range');
  }

  const baseIndent = lines[startIdx].match(/^(\s*)/)?.[1] || '';
  
  // Extract the lines to move
  const movedLines = lines.slice(startIdx, endIdx + 1);
  
  // Remove them from original
  lines.splice(startIdx, endIdx - startIdx + 1);
  
  // Add scope header
  const headerLine = baseIndent + scopeHeader;
  
  // Indent the moved lines by 1 level
  const indentedLines = movedLines.map(l => {
    if (!l.trim()) return l;
    return '  ' + l;
  });
  
  // Build the new block
  const block = [headerLine, ...indentedLines];
  if (scopeFooter) {
    block.push(baseIndent + scopeFooter);
  }
  
  // Insert at original position
  lines.splice(startIdx, 0, ...block);
  
  const newText = lines.join('\n');
  return { newText, validation: validate(file, original, newText), zones: computeZones(original, newText) };
}

// ═══════════════════ cross-file rename (non-TS) ═════════════════

export interface CrossFileRenameResult {
  changes: Map<string, string>;  // relPath → newContent
  symbol: string;
  occurrences: number;
  filesTouched: number;
}

/**
 * Rename a symbol across multiple files (non-TS).
 * Uses regex word-boundary matching with per-file syntax validation.
 * All-or-nothing: if any file fails validation, nothing is written.
 * 
 * @param fileContents — Map<relPath, content> of files to process
 * @param file — the file where the symbol is declared
 * @param line, column — position of the symbol
 * @param newName — new name
 */
export function renameSymbolCrossFileUniversal(
  files: Map<string, string>,
  targetFile: string,
  line: number,
  column: number,
  newName: string,
): CrossFileRenameResult {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(newName)) {
    throw new Error(`invalid identifier: ${newName}`);
  }

  // Get the target file content
  const targetContent = files.get(targetFile);
  if (!targetContent) throw new Error(`target file not in map: ${targetFile}`);

  // Extract identifier at position
  const offset = posToOffset(targetContent, { line, column });
  const oldName = extractIdentifier(targetContent, offset);
  if (!oldName) throw new Error(`no identifier at ${line}:${column}`);
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(oldName)) throw new Error(`invalid identifier: "${oldName}"`);

  const changes = new Map<string, string>();
  let totalOccurrences = 0;

  const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'g');

  for (const [relPath, content] of files) {
    const matches = content.match(regex);
    if (!matches || matches.length === 0) continue;

    const newContent = content.replace(regex, newName);
    const v = validate(relPath, content, newContent);
    if (!v.ok) {
      throw new Error(`rename in ${relPath} would cause syntax regression: ${v.introduced ?? 'unknown'}`);
    }

    changes.set(relPath, newContent);
    totalOccurrences += matches.length;
  }

  return {
    changes,
    symbol: `${oldName} → ${newName}`,
    occurrences: totalOccurrences,
    filesTouched: changes.size,
  };
}

function extractIdentifier(text: string, offset: number): string | null {
  let start = offset;
  while (start > 0 && /[A-Za-z0-9_$]/.test(text[start - 1])) start--;
  let end = offset;
  while (end < text.length && /[A-Za-z0-9_$]/.test(text[end])) end++;
  const id = text.slice(start, end);
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(id) ? id : null;
}
