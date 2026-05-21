/**
 * Universal structural operations — call, argument, and expression manipulation
 * that work across ALL languages with syntax validation.
 *
 * These implement the topology operations from the Atomic Action Principle:
 * replace_callee_keep_args, replace_arg_keep_callee, insert_arg, remove_arg.
 */

import { validate, type ValidationResult, type EditZones, computeZones, EMPTY_ZONES, type Position } from './engine.js';
export type { EditZones } from './engine.js';
export { EMPTY_ZONES, computeZones } from './engine.js';

// ─────────────────────────── shared helpers ───────────────────────────

/** Convert 1-based (line,column) to absolute offset. */
function posToOffset(text: string, pos: Position): number {
  let offset = 0;
  let line = 1;
  while (line < pos.line) {
    const nl = text.indexOf('\n', offset);
    if (nl === -1) throw new Error(`line ${pos.line} does not exist`);
    offset = nl + 1;
    line++;
  }
  return offset + (pos.column - 1);
}

// ─────────────────────────── replace_callee_keep_args ─────────────────

export interface CalleeReplaceResult {
  newText: string;
  oldCallee: string;
  newCallee: string;
  validation: ValidationResult;
  zones: EditZones;
}

/**
 * Replace function/method name at a call site, preserving all arguments exactly.
 * Works on any language: finds the callee identifier before the opening paren.
 * 
 * Example: sendMessage(phone, content) → sendTemplateMessage(phone, content)
 */
export function replaceCalleeKeepArgs(
  file: string,
  original: string,
  callLine: number,
  callColumn: number,
  newCallee: string,
): CalleeReplaceResult {
  const offset = posToOffset(original, { line: callLine, column: callColumn });

  // Find the identifier at this position
  let start = offset;
  while (start > 0 && /[A-Za-z0-9_$.]/.test(original[start - 1])) start--;
  let end = offset;
  while (end < original.length && /[A-Za-z0-9_$]/.test(original[end])) end++;

  const oldCallee = original.slice(start, end);
  if (!oldCallee || oldCallee === newCallee) {
    return {
      newText: original,
      oldCallee,
      newCallee,
      validation: validate(file, original, original),
      zones: EMPTY_ZONES,
    };
  }

  // Verify there's an opening paren after the callee (skip whitespace)
  let after = end;
  while (after < original.length && /\s/.test(original[after])) after++;
  if (original[after] !== '(') {
    throw new Error(`no opening parenthesis after "${oldCallee}" at ${callLine}:${callColumn}`);
  }

  // Replace just the callee name
  const newText = original.slice(0, start) + newCallee + original.slice(end);

  return {
    newText,
    oldCallee,
    newCallee,
    validation: validate(file, original, newText),
    zones: computeZones(original, newText),
  };
}

// ─────────────────────────── argument operations ──────────────────────

export interface ArgEditResult {
  newText: string;
  validation: ValidationResult;
  zones: EditZones;
}

/**
 * Find the Nth argument inside a function call's parentheses.
 * Returns {start, end} offsets of the argument (excluding leading/trailing whitespace),
 * or null if the argument doesn't exist.
 */
function findArgRange(
  text: string,
  openParenOffset: number,
  argIndex: number, // 0-based
): { start: number; end: number } | null {
  let depth = 1;
  let i = openParenOffset + 1;
  let currentArg = 0;
  let argStart = i;

  // Skip leading whitespace before first arg
  while (i < text.length && /\s/.test(text[i])) i++;
  argStart = i;

  while (i < text.length && depth > 0) {
    const c = text[i];
    if (c === '(' || c === '[' || c === '{') {
      depth++;
    } else if (c === ')' || c === ']' || c === '}') {
      depth--;
      if (depth === 0) {
        // End of args — check if we're looking for the last arg
        if (currentArg === argIndex) {
          // Trim trailing whitespace
          let argEnd = i;
          while (argEnd > argStart && /\s/.test(text[argEnd - 1])) argEnd--;
          return argStart < argEnd ? { start: argStart, end: argEnd } : null;
        }
        return null;
      }
      if (depth < 0) return null;
    } else if (c === ',' && depth === 1) {
      if (currentArg === argIndex) {
        let argEnd = i;
        while (argEnd > argStart && /\s/.test(text[argEnd - 1])) argEnd--;
        return argStart < argEnd ? { start: argStart, end: argEnd } : null;
      }
      currentArg++;
      i++;
      // Skip whitespace before next arg
      while (i < text.length && /\s/.test(text[i])) i++;
      argStart = i;
      continue;
    }
    i++;
  }

  // Last argument (no trailing comma)
  if (currentArg === argIndex && depth === 0) {
    let argEnd = i - 1; // before the closing paren
    while (argEnd > argStart && /\s/.test(text[argEnd - 1])) argEnd--;
    return argStart < argEnd ? { start: argStart, end: argEnd } : null;
  }

  return null;
}

/**
 * Replace the argument at argIndex in the function call starting at callLine:callColumn.
 * argIndex is 0-based.
 */
export function replaceCallArg(
  file: string,
  original: string,
  callLine: number,
  callColumn: number,
  argIndex: number,
  newArgText: string,
): ArgEditResult {
  const offset = posToOffset(original, { line: callLine, column: callColumn });

  // Find the opening paren after the callee
  let paren = offset;
  while (paren < original.length && original[paren] !== '(') paren++;
  if (paren >= original.length) {
    throw new Error(`no opening parenthesis found at call site ${callLine}:${callColumn}`);
  }

  const range = findArgRange(original, paren, argIndex);
  if (!range) {
    throw new Error(`argument index ${argIndex} not found in call at ${callLine}:${callColumn}`);
  }

  const newText = original.slice(0, range.start) + newArgText + original.slice(range.end);
  return {
    newText,
    validation: validate(file, original, newText),
    zones: computeZones(original, newText),
  };
}

/**
 * Insert a new argument at argIndex in the function call.
 * argIndex is 0-based insertion position.
 */
export function insertCallArg(
  file: string,
  original: string,
  callLine: number,
  callColumn: number,
  argIndex: number,
  newArgText: string,
): ArgEditResult {
  const offset = posToOffset(original, { line: callLine, column: callColumn });

  let paren = offset;
  while (paren < original.length && original[paren] !== '(') paren++;
  if (paren >= original.length) {
    throw new Error(`no opening parenthesis found`);
  }

  // If inserting at position 0, insert right after opening paren
  if (argIndex === 0) {
    let insertPos = paren + 1;
    // Check if there are already args — insert before the first arg
    let after = insertPos;
    while (after < original.length && /\s/.test(original[after])) after++;
    if (original[after] === ')') {
      // Empty arg list: insert directly
      const newText = original.slice(0, after) + newArgText + original.slice(after);
      return { newText, validation: validate(file, original, newText), zones: computeZones(original, newText) };
    }
    // Insert before first arg with comma
    const newText = original.slice(0, after) + newArgText + ', ' + original.slice(after);
    return { newText, validation: validate(file, original, newText), zones: computeZones(original, newText) };
  }

  // Find the Nth comma to insert after
  let depth = 0;
  let commasFound = 0;
  let i = paren + 1;
  while (i < original.length) {
    const c = original[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) break;
      depth--;
    } else if (c === ',' && depth === 0) {
      commasFound++;
      if (commasFound === argIndex) {
        // Insert after this comma
        i++; // skip comma
        const insertText = ' ' + newArgText + ',';
        const newText = original.slice(0, i) + insertText + original.slice(i);
        return { newText, validation: validate(file, original, newText), zones: computeZones(original, newText) };
      }
    }
    i++;
  }

  // Append at end
  const closeParen = original.indexOf(')', paren);
  if (closeParen === -1) throw new Error('unclosed parentheses');
  // Check if there are existing args
  let before = closeParen - 1;
  while (before > paren && /\s/.test(original[before])) before--;
  const hasArgs = original[before] !== '(';
  const insertText = hasArgs ? ', ' + newArgText : newArgText;
  const newText = original.slice(0, closeParen) + insertText + original.slice(closeParen);
  return { newText, validation: validate(file, original, newText), zones: computeZones(original, newText) };
}

/**
 * Remove the argument at argIndex from the function call.
 */
export function removeCallArg(
  file: string,
  original: string,
  callLine: number,
  callColumn: number,
  argIndex: number,
): ArgEditResult {
  const offset = posToOffset(original, { line: callLine, column: callColumn });

  let paren = offset;
  while (paren < original.length && original[paren] !== '(') paren++;
  if (paren >= original.length) throw new Error(`no opening parenthesis found`);

  const range = findArgRange(original, paren, argIndex);
  if (!range) {
    throw new Error(`argument index ${argIndex} not found`);
  }

  // Remove the argument and clean up surrounding punctuation
  let start = range.start;
  let end = range.end;

  // If there's a comma after this arg, remove it too
  while (end < original.length && /\s/.test(original[end])) end++;
  if (original[end] === ',') {
    end++; // remove comma
    // If this was the first arg, also clean up whitespace before next arg
    if (argIndex === 0) {
      while (end < original.length && /\s/.test(original[end])) end++;
    }
  } else if (argIndex > 0) {
    // This is the last arg — remove preceding comma
    while (start > paren && /\s/.test(original[start - 1])) start--;
    if (original[start - 1] === ',') {
      start--; // remove preceding comma
      while (start > paren && /\s/.test(original[start - 1])) start--;
    }
  }

  const newText = original.slice(0, start) + original.slice(end);
  return {
    newText,
    validation: validate(file, original, newText),
    zones: computeZones(original, newText),
  };
}
