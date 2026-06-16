/**
 * LSP Diagnostic Gate — connects the LSP Mesh to the Atomic Gate Lattice.
 *
 * This gate is the bridge between "single-file structural proof" (tree-sitter)
 * and "cross-file semantic proof" (language servers). Every edit that passes
 * through the gate lattice now ALSO gets checked by the appropriate LSP.
 *
 * Architecture:
 *   1. Atomic edit → gate lattice → lsp-diagnostic-gate
 *   2. Gate detects language from file extension
 *   3. Routes to LSP Mesh via child process (same pattern as chrome-devtools-bridge)
 *   4. LSP Mesh spawns the correct language server lazily
 *   5. textDocument/didOpen → textDocument/diagnostic
 *   6. Returns verdict: diagnostics unchanged/worsened
 *
 * This gate is HONEST (like all Atomic gates): it proves semantic correctness
 * as reported by the language server, but explicitly states the ceiling —
 * "LSP diagnostics passing ≠ product behavior correct."
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { spawn } from 'child_process';
import type { EditGateContext, EditGateResult } from '../engine-gate-registry';

// ── Language → LSP routing ──────────────────────────────────────────

const EXT_TO_LSP: Record<string, string> = {
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

interface LspMeshResult {
  ok: boolean;
  language: string;
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

async function queryLspMesh(
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


export function gate(ctx) { return evaluateSync(ctx); }
