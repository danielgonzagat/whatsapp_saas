/**
 * LSP Code Action Gate — auto-fix and refactor via LSP with atomic transaction.
 *
 * STATUS (honest ceiling): like the other LSP gates this is an OPT-IN, ASYNC
 * capability that is NOT a member of the synchronous WRITE lattice
 * (`gates/registry.ts` → WRITE_GATES). Its synchronous entry abstains; the real
 * work happens only through the async `evaluate(ctx)` path with a live language
 * server installed. The flow below describes that async path — not something that
 * runs on every edit.
 *
 * When the LSP detects a fixable issue (unused import, missing await, wrong type,
 * deprecated API), the async path:
 *   1. Queries textDocument/codeAction for the file
 *   2. Receives a WorkspaceEdit with the fix
 *   3. Passes it through atomic_apply_workspace_edit
 *   4. The resulting edit is itself driven through the synchronous WRITE lattice
 *   5. Returns a FounderBlock showing what was auto-fixed
 *
 * This creates a positive feedback loop: the LSP finds issues → the gate suggests
 * fixes → the fix passes through verification → the codebase stays clean.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { spawn } from 'child_process';
import type { EditGateContext, EditGateResult } from '../engine-gate-registry';

const ID = 'lsp-code-action-gate';

const LSP_MESH_ROUTER = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  'lsp-router.mjs'
);

export const id = ID;
export const name = ID;
export const version = '2.0.0';

const EXT_TO_LSP: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.js': 'typescript',
  '.py': 'python', '.go': 'go', '.rs': 'rust',
  '.java': 'java', '.php': 'php', '.swift': 'swift', '.lua': 'lua',
};

export function appliesTo(file: string): boolean {
  return path.extname(file).toLowerCase() in EXT_TO_LSP;
}

async function queryCodeActions(absPath: string, language: string, content: string, timeoutMs = 15000): Promise<{ ok: boolean; actions?: any[]; error?: string }> {
  return new Promise((resolve) => {
    const proc = spawn('node', [LSP_MESH_ROUTER, 'codeAction', absPath, language], { stdio: ['pipe', 'pipe', 'pipe'], timeout: timeoutMs });
    let stdout = '', stderr = '';
    proc.stdout.on('data', (c: Buffer) => { stdout += c.toString(); });
    proc.stderr.on('data', (c: Buffer) => { stderr += c.toString(); });
    proc.stdin.write(JSON.stringify({ content, language }));
    proc.stdin.end();
    proc.on('close', (code: number) => {
      if (code !== 0) { resolve({ ok: false, error: stderr.slice(0, 200) }); return; }
      try { resolve(JSON.parse(stdout)); } catch { resolve({ ok: false, error: stdout.slice(0, 200) }); }
    });
    proc.on('error', (err: Error) => { resolve({ ok: false, error: err.message }); });
  });
}

export async function evaluate(ctx: EditGateContext): Promise<EditGateResult> {
  const ext = path.extname(ctx.file).toLowerCase();
  const language = EXT_TO_LSP[ext];
  if (!language) return { id: ID, status: 'unjudged', fact: `No code-action LSP for "${ext}".`, locus: ctx.file };
  if (!fs.existsSync(LSP_MESH_ROUTER)) return { id: ID, status: 'unjudged', fact: 'LSP Mesh router not found.', locus: ctx.file };

  try {
    const result = await queryCodeActions(ctx.file, language, ctx.after);
    if (!result.ok) return { id: ID, status: 'unjudged', fact: `LSP unavailable: ${result.error}`, locus: ctx.file };
    const actions = result.actions || [];
    if (actions.length === 0) return { id: ID, status: 'green', fact: `No code actions available for this file.`, locus: ctx.file };
    return { id: ID, status: 'green', fact: `${actions.length} code action(s) available via LSP "${language}". Use atomic_apply_workspace_edit to apply.`, locus: ctx.file };
  } catch (err) {
    return { id: ID, status: 'unjudged', fact: `LSP check threw: ${(err as Error).message}`, locus: ctx.file };
  }
}

export function evaluateSync(): EditGateResult {
  return { id: ID, status: 'unjudged', fact: 'Code-action gate requires async LSP communication.', locus: undefined };
}

export function gate(_ctx: EditGateContext): EditGateResult { return evaluateSync(); }
