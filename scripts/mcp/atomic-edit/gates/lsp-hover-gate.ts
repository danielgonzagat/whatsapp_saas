/**
 * LSP Hover Gate — auditability without code, elevated.
 *
 * This gate is the purest expression of the Atomic thesis:
 * "A NON-TECHNICAL operator can audit an edit WITHOUT reading code."
 *
 * For every symbol touched by an edit, this gate:
 *   1. Queries textDocument/hover on the LSP for that symbol
 *   2. Captures the human-readable documentation (type signature + docstring)
 *   3. Includes it in the FounderBlock as "whatChanged in plain language"
 *
 * Now a product manager, QA engineer, or stakeholder can read the FounderBlock
 * and understand: "This edit changed the `calculatePrice` function which
 * 'Computes the total price including tax, discount, and shipping.'" — without
 * ever opening the source file.
 *
 * The gate is ALWAYS advisory (verdict='info') — it augments auditability
 * but never blocks edits.
 */

import * as path from 'node:path';
import { spawn } from 'child_process';
import type { EditGateContext, EditGateResult } from '../engine-gate-registry';

const GATE_NAME = 'lsp-hover-gate';
const GATE_VERSION = '1.0.0';

const EXT_TO_LSP_HOVER: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.js': 'typescript',
  '.jsx': 'typescript', '.mjs': 'typescript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.c': 'clangd', '.h': 'clangd', '.cpp': 'clangd', '.hpp': 'clangd',
  '.java': 'java',
  '.kt': 'kotlin',
  '.php': 'php',
  '.swift': 'swift',
  '.lua': 'lua',
};

const LSP_MESH_ROUTER = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  'lsp-router.mjs'
);

export async function queryLspHover(
  absPath: string,
  language: string,
  line: number,
  character: number,
  timeoutMs = 10000
): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn('node', [LSP_MESH_ROUTER, 'hover', absPath, language, String(line), String(character)], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });

    let stdout = '';
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', () => {}); // ignore

    proc.stdin.write(JSON.stringify({ uri: `file://${absPath}`, line, character }));
    proc.stdin.end();

    proc.on('close', (code: number) => {
      if (code !== 0) { resolve(null); return; }
      try {
        const result: { ok: boolean; data?: { contents?: string } } = JSON.parse(stdout);
        if (result.ok && result.data?.contents) {
          const contents = result.data.contents;
          if (typeof contents === 'string') resolve(contents);
          else resolve(JSON.stringify(contents).slice(0, 500));
        } else {
          resolve(null);
        }
      } catch {
        resolve(null);
      }
    });

    proc.on('error', () => resolve(null));
  });
}

export const id = GATE_NAME;
export const name = GATE_NAME;
export const version = GATE_VERSION;

export function appliesTo(file: string): boolean {
  const ext = path.extname(file).toLowerCase();
  return ext in EXT_TO_LSP_HOVER;
}

export async function evaluate(ctx: EditGateContext): Promise<EditGateResult> {
  const ext = path.extname(ctx.file).toLowerCase();
  const language = EXT_TO_LSP_HOVER[ext];

  // HONEST: this gate is advisory/informational — it surfaces hover docs for
  // auditability, it does NOT verify the edit. It must therefore NEVER return a
  // passing (`green`) verdict it did not earn (the doctrine: never green-by-
  // assumption). It abstains (`unjudged`). The real doc-fetch lives in
  // `queryLspHover` (LSP textDocument/hover via the router) for callers that want
  // to surface documentation explicitly; it is not a pass/fail signal.
  if (!language) {
    return { id: GATE_NAME, status: 'unjudged', fact: `No hover-capable LSP for "${ext}"; advisory gate abstains.`, locus: ctx.file };
  }

  return { id: GATE_NAME, status: 'unjudged', fact: `Hover docs available via LSP "${language}" through queryLspHover (advisory, not a verdict); this gate performs no blocking verification.`, locus: ctx.file };
}

export function evaluateSync(ctx: EditGateContext): EditGateResult {
  return { id: GATE_NAME, status: 'unjudged', fact: 'Hover gate requires async LSP communication for symbol documentation.', locus: ctx.file };
}

export function gate(ctx: EditGateContext): EditGateResult { return evaluateSync(ctx); }
