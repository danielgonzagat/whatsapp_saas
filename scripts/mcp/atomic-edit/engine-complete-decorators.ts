import { validate, type ValidationResult, type EditZones, computeZones, type Position } from './engine.js';
// ─────────────────────────── helpers ───────────────────────────

function posToOffset(text: string, pos: Position): number {
  let offset = 0;
  const lines = text.split('\n');
  for (let i = 0; i < pos.line; i++) {
    offset += lines[i].length + 1;
  }
  return offset + pos.column;
}

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

