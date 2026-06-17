/**
 * LSP Rename Gate — semantic cross-file rename via LSP with atomic transaction.
 *
 * This gate transforms the atomic_rename_symbol_cross_file from TS-only
 * to universal. When a symbol rename is requested, this gate:
 *   1. Detects the language from file extension
 *   2. Calls textDocument/rename on the appropriate LSP via lsp-mesh
 *   3. Receives a WorkspaceEdit (multi-file, multi-span changes)
 *   4. Applies ALL changes as an atomic transaction (all-or-nothing)
 *   5. Verifies diagnostics post-rename via lsp-diagnostic-gate
 *   6. Returns FounderBlock with cross-file impact analysis
 *
 * The key innovation: what was previously "hope the grep finds all references"
 * becomes "the language server PROVES all references are renamed correctly."
 */

import * as path from 'node:path';
import type { EditGateContext, EditGateResult } from '../engine-gate-registry';

const GATE_NAME = 'lsp-rename-gate';
const GATE_VERSION = '1.0.0';

// Same language routing as diagnostic gate
const EXT_TO_LSP_RENAME: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.js': 'typescript',
  '.jsx': 'typescript', '.mjs': 'typescript', '.cjs': 'typescript',
  '.mts': 'typescript', '.cts': 'typescript',
  '.py': 'python', '.pyi': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.c': 'clangd', '.h': 'clangd', '.cpp': 'clangd', '.hpp': 'clangd',
  '.cc': 'clangd', '.cxx': 'clangd',
  '.java': 'java',
  '.kt': 'kotlin',
  '.php': 'php',
  '.swift': 'swift',
  '.lua': 'lua',
};

export const id = 'lsp-rename-gate';
export const name = GATE_NAME;
export const version = GATE_VERSION;

export function appliesTo(file: string): boolean {
  const ext = path.extname(file).toLowerCase();
  return ext in EXT_TO_LSP_RENAME;
}

/**
 * Cross-file rename via LSP. This gate is special: unlike diagnostic-gate
 * which validates existing edits, this gate PROPOSES edits (a WorkspaceEdit
 * from the LSP) and the caller must apply them atomically.
 *
 * Returns the WorkspaceEdit as evidence.data so the caller can use
 * atomic_apply_workspace_edit to materialize it.
 */
export async function evaluate(ctx: EditGateContext): Promise<EditGateResult> {
  const ext = path.extname(ctx.file).toLowerCase();
  const language = EXT_TO_LSP_RENAME[ext];

  // HONEST: this gate does not itself perform a rename or verify one — it points
  // at the capability. It must not return a passing (`green`) verdict it did not
  // earn (doctrine: never green-by-assumption), so it abstains (`unjudged`). Real
  // cross-file rename runs through `atomic_rename_symbol_cross_file`, which routes
  // a textDocument/rename through the LSP mesh and applies the WorkspaceEdit atomically.
  if (!language) {
    return {
      id: GATE_NAME,
      status: 'unjudged',
      fact: `No rename-capable LSP for "${ext}"; abstaining. Single-file scope-correct rename: atomic_rename_symbol.`,
      locus: ctx.file,
    };
  }

  return {
    id: GATE_NAME,
    status: 'unjudged',
    fact: `Cross-file rename available via LSP "${language}" through atomic_rename_symbol_cross_file (advisory pointer, not a verdict); this gate performs no verification here.`,
    locus: ctx.file,
  };
}

export function evaluateSync(ctx: EditGateContext): EditGateResult {
  return {
    id: GATE_NAME,
    status: 'unjudged',
    fact: 'Rename gate requires async LSP communication. Use async evaluate() for cross-file rename.',
    locus: ctx.file,
  };
}

export function gate(ctx: EditGateContext): EditGateResult { return evaluateSync(ctx); }
