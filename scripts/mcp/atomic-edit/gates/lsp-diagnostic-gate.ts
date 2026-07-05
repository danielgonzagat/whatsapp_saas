/**
 * LSP Diagnostic Gate — bridges the LSP Mesh toward the Atomic Gate Lattice.
 *
 * This gate is the bridge between "single-file structural proof" (tree-sitter)
 * and "cross-file semantic proof" (language servers).
 *
 * STATUS (be honest about the ceiling — the doctrine demands it): this is an
 * OPT-IN, ASYNC capability, NOT yet a member of the synchronous WRITE lattice
 * (`gates/registry.ts` → WRITE_GATES). The synchronous `gate(ctx)`/`evaluateSync`
 * entry the floor calls ABSTAINS (`unjudged`) by design — real LSP verification
 * needs an installed language server and an async round-trip, which the per-write
 * floor neither has nor awaits. Use the async `evaluate(ctx)` path explicitly to
 * route an edit through a live server. Until a gate is listed in WRITE_GATES it
 * does not run on every edit, and this file does not claim it does.
 *
 * Async architecture (when invoked via `evaluate`):
 *   1. Gate detects language from file extension
 *   2. Routes to LSP Mesh via child process (same pattern as chrome-devtools-bridge)
 *   3. LSP Mesh spawns the correct language server lazily
 *   4. textDocument/didOpen → textDocument/diagnostic
 *   5. Returns verdict: diagnostics unchanged/worsened
 *
 * This gate is HONEST (like all Atomic gates): when it does run, it proves semantic
 * correctness as reported by the language server, but explicitly states the ceiling —
 * "LSP diagnostics passing ≠ product behavior correct."
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { spawn } from 'child_process';
import type { EditGateContext, EditGateResult } from '../engine-gate-registry';

// ── Language → LSP routing ──────────────────────────────────────────

export const EXT_TO_LSP: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.js': 'typescript',
  '.jsx': 'typescript', '.mjs': 'typescript', '.cjs': 'typescript',
  '.mts': 'typescript', '.cts': 'typescript',
  '.py': 'python', '.pyi': 'python', '.pyx': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.c': 'clangd', '.h': 'clangd', '.cpp': 'clangd', '.hpp': 'clangd',
  '.cc': 'clangd', '.cxx': 'clangd', '.hh': 'clangd', '.hxx': 'clangd',
  '.java': 'java',
  '.kt': 'kotlin', '.kts': 'kotlin',
  '.php': 'php',
  '.swift': 'swift',
  '.lua': 'lua',
  '.graphql': 'graphql', '.gql': 'graphql',
  '.sh': 'bash', '.bash': 'bash', '.zsh': 'bash',
  '.json': 'json',
  '.yaml': 'yaml', '.yml': 'yaml',
  '.md': 'markdown', '.markdown': 'markdown',
  '.toml': 'toml',
  '.sql': 'sql',
  '.prisma': 'prisma',
  '.css': 'css',
  '.html': 'html', '.htm': 'html',
};

const GATE_NAME = 'lsp-diagnostic-gate';
const GATE_VERSION = '1.0.0';

// ── LSP Mesh communication ──────────────────────────────────────────

export interface LspMeshResult {
  ok: boolean;
  language: string;
  /** which workspace the mesh resolved the file into ('auto' when inferred). */
  workspace?: string;
  diagnostics?: Array<{
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
    severity: number;
    message: string;
    source?: string;
    code?: number;
  }>;
  error?: string;
}

const LSP_MESH_ROUTER = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  'lsp-router.mjs'
);

export async function queryLspMesh(
  absPath: string,
  language: string,
  content: string,
  timeoutMs = 15000
): Promise<LspMeshResult> {
  return new Promise((resolve) => {
    const proc = spawn('node', [LSP_MESH_ROUTER, 'diagnostics', absPath, language], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    // Send file content via stdin for didOpen
    proc.stdin.write(JSON.stringify({ content, language, uri: `file://${absPath}` }));
    proc.stdin.end();

    proc.on('close', (code: number) => {
      if (code !== 0) {
        resolve({
          ok: false,
          language,
          workspace: 'auto',
          error: `LSP Mesh exited ${code}: ${stderr.slice(0, 200)}`,
        });
        return;
      }
      try {
        const result = JSON.parse(stdout) as LspMeshResult;
        resolve(result);
      } catch {
        resolve({
          ok: false,
          language,
          workspace: 'auto',
          error: `Failed to parse LSP Mesh response: ${stdout.slice(0, 200)}`,
        });
      }
    });

    proc.on('error', (err: Error) => {
      resolve({
        ok: false,
        language,
        workspace: 'auto',
        error: `LSP Mesh spawn failed: ${err.message}`,
      });
    });
  });
}

// ── Gate implementation ─────────────────────────────────────────────

export const id = 'lsp-diagnostic-gate';
export const name = GATE_NAME;
export const version = GATE_VERSION;

/**
 * Which files this gate applies to. Broad — any file with a known LSP.
 */
export function appliesTo(file: string): boolean {
  const ext = path.extname(file).toLowerCase();
  return ext in EXT_TO_LSP;
}

/**
 * The gate's evaluation function — called by runRegistryGatesOverEdit.
 */
export async function evaluate(ctx: EditGateContext): Promise<EditGateResult> {
  const ext = path.extname(ctx.file).toLowerCase();
  const language = EXT_TO_LSP[ext];

  if (!language) {
    return { id: GATE_NAME, status: 'unjudged', fact: `No LSP configured for "${ext}".`, locus: ctx.file };
  }

  if (!fs.existsSync(LSP_MESH_ROUTER)) {
    return { id: GATE_NAME, status: 'unjudged', fact: `LSP Mesh router not found at ${LSP_MESH_ROUTER}. Install lsp-mesh to enable semantic checking.`, locus: ctx.file };
  }

  const startTime = Date.now();
  try {
    const result = await queryLspMesh(ctx.file, language, ctx.after);

    if (!result.ok) {
      return { id: GATE_NAME, status: 'unjudged', fact: `LSP "${language}" unavailable: ${result.error}`, locus: ctx.file };
    }

    const diagnostics = result.diagnostics ?? [];
    const errors = diagnostics.filter((d: any) => d.severity === 1);
    const warnings = diagnostics.filter((d: any) => d.severity === 2);
    const elapsedMs = Date.now() - startTime;

    if (errors.length > 0) {
      return { id: GATE_NAME, status: 'red', fact: `LSP "${language}" reports ${errors.length} error(s), ${warnings.length} warning(s). First: ${errors[0].message.slice(0, 120)}`, locus: ctx.file };
    }

    return { id: GATE_NAME, status: 'green', fact: `LSP "${language}" verified: 0 errors, ${warnings.length} warnings, ${diagnostics.length} diagnostics in ${elapsedMs}ms.`, locus: ctx.file };
  } catch (err) {
    return { id: GATE_NAME, status: 'unjudged', fact: `LSP "${language}" check threw: ${(err as Error).message}`, locus: ctx.file };
  }
}

/**
 * Synchronous version — for when the gate lattice runs sync.
 * In sync mode, we skip the LSP check entirely (it requires async I/O).
 * The async evaluate() above is the canonical path.
 */
export function evaluateSync(ctx: EditGateContext): EditGateResult {
  const ext = path.extname(ctx.file).toLowerCase();
  const language = EXT_TO_LSP[ext];

  if (!language) {
    return { id: GATE_NAME, status: 'unjudged', fact: `No LSP for "${ext}" — sync mode abstains.`, locus: ctx.file };
  }

  return { id: GATE_NAME, status: 'unjudged', fact: `LSP "${language}" check skipped in sync mode. Run async evaluate() for full semantic verification.`, locus: ctx.file };
}

// ── Export for registry ─────────────────────────────────────────────


export function gate(ctx: EditGateContext): EditGateResult { return evaluateSync(ctx); }
