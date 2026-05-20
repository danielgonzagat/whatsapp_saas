/**
 * Universal rename — scope-correct for TS/JS via ts-morph, 
 * identifier-based for all other languages via tree-sitter or regex.
 *
 * Extends engine.ts renameSymbol() past the TS-only limitation.
 */

import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { extOf, TS_EXT } from './engine.js';
import type { Position, ValidationResult, EditZones } from './engine.js';
export { EMPTY_ZONES, computeZones } from './engine.js';
import { EMPTY_ZONES, computeZones } from './engine.js';
import { validate } from './engine.js';

export interface UniversalRenameResult {
  newText: string;
  occurrences: number;
  oldName: string;
  newName: string;
  validation: ValidationResult;
  zones: EditZones;
  /** 'ts-morph' | 'tree-sitter' | 'regex' */
  method: 'ts-morph' | 'tree-sitter' | 'regex';
}

/**
 * Rename a symbol at (line,column) across all occurrences in the file.
 * For TS/JS: uses ts-morph (scope-correct).
 * For others: uses identifier-based matching with word-boundary regex.
 */
export async function universalRename(
  file: string,
  original: string,
  pos: Position,
  newName: string,
): Promise<UniversalRenameResult> {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(newName)) {
    throw new Error(`invalid identifier: ${JSON.stringify(newName)}`);
  }

  const ext = extOf(file);

  // TS/JS: use ts-morph (existing scope-correct rename)
  if (TS_EXT.has(ext)) {
    const { renameSymbol } = await import('./engine.js');
    const r = await renameSymbol(file, original, pos, newName);
    return {
      newText: r.newText,
      occurrences: r.occurrences,
      oldName: r.symbol.split(' -> ')[0],
      newName: r.symbol.split(' -> ')[1] || newName,
      validation: r.validation,
      zones: r.zones,
      method: 'ts-morph',
    };
  }

  // Non-TS: find the identifier at position, then replace all occurrences
  const offset = posToOffset(original, pos);
  const oldName = extractIdentifierAt(original, offset);
  if (!oldName) {
    throw new Error(`no identifier at ${pos.line}:${pos.column}`);
  }
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(oldName)) {
    throw new Error(`not a valid identifier at ${pos.line}:${pos.column}: "${oldName}"`);
  }
  if (oldName === newName) {
    return {
      newText: original,
      occurrences: 0,
      oldName,
      newName,
      validation: validate(file, original, original),
      zones: EMPTY_ZONES,
      method: 'regex',
    };
  }

  // Try tree-sitter scope-aware rename via Python script
  const tsResult = tryTreeSitterRename(file, original, pos.line, pos.column, oldName, newName);
  if (tsResult) {
    return {
      newText: tsResult.newText,
      occurrences: tsResult.occurrences,
      oldName,
      newName,
      validation: validate(file, original, tsResult.newText),
      zones: computeZones(original, tsResult.newText),
      method: 'tree-sitter',
    };
  }

  // Fallback: regex-based word-boundary rename (replaces all occurrences)
  const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'g');
  const matches = original.match(regex);
  const newText = original.replace(regex, newName);
  const occurrences = matches ? matches.length : 0;

  return {
    newText,
    occurrences,
    oldName,
    newName,
    validation: validate(file, original, newText),
    zones: computeZones(original, newText),
    method: 'regex',
  };
}

/**
 * Try tree-sitter scope-aware rename via Python script.
 * Returns null if tree-sitter is not available or fails.
 */
function tryTreeSitterRename(
  file: string,
  text: string,
  line: number,
  column: number,
  oldName: string,
  newName: string,
): { newText: string; occurrences: number } | null {
  // Tree-sitter rename requires the Python helper script
  const scriptPath = path.join(
    path.dirname(path.dirname(new URL(import.meta.url).pathname)),
    'lang-rename.py',
  );

  // Check if script exists
  if (!fs.existsSync(scriptPath)) return null;

  const ext = extOf(file);
  const lang = extToTsLang(ext);
  if (!lang) return null;

  const tmpDir = os.tmpdir();
  const tmpPath = path.join(tmpDir, `.atomic-rename-${process.pid}-${Date.now()}${ext}`);
  try {
    fs.writeFileSync(tmpPath, text, 'utf8');
    const r = childProcess.spawnSync('python3', [
      scriptPath, tmpPath, lang, String(line), String(column), oldName, newName,
    ], {
      timeout: 15000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (r.error || r.status !== 0) return null;
    const out = (r.stdout ?? '').trim();
    if (!out) return null;
    const parsed = JSON.parse(out);
    if (!parsed.ok) return null;
    return {
      newText: parsed.text,
      occurrences: parsed.occurrences ?? 0,
    };
  } catch {
    return null;
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* cleanup */ }
  }
}

function extToTsLang(ext: string): string | null {
  const map: Record<string, string> = {
    '.py': 'python',
    '.java': 'java',
    '.c': 'c', '.h': 'c',
    '.cc': 'cpp', '.cpp': 'cpp', '.hpp': 'cpp',
    '.go': 'go',
    '.rs': 'rust',
    '.js': 'javascript', '.jsx': 'javascript',
    '.ts': 'typescript', '.tsx': 'tsx',
  };
  return map[ext] || null;
}

/** Convert 1-based (line,column) to absolute UTF-16 offset. */
function posToOffset(text: string, pos: Position): number {
  if (pos.line < 1 || pos.column < 1) {
    throw new Error(`position out of range: ${pos.line}:${pos.column}`);
  }
  let offset = 0;
  let line = 1;
  while (line < pos.line) {
    const nl = text.indexOf('\n', offset);
    if (nl === -1) {
      throw new Error(`line ${pos.line} does not exist`);
    }
    offset = nl + 1;
    line++;
  }
  return offset + (pos.column - 1);
}

/** Extract the identifier at a given offset. */
function extractIdentifierAt(text: string, offset: number): string | null {
  // Find start of identifier (backward)
  let start = offset;
  while (start > 0 && /[A-Za-z0-9_$]/.test(text[start - 1])) {
    start--;
  }
  // Find end of identifier (forward)
  let end = offset;
  while (end < text.length && /[A-Za-z0-9_$]/.test(text[end])) {
    end++;
  }
  const id = text.slice(start, end);
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(id)) return null;
  return id;
}
