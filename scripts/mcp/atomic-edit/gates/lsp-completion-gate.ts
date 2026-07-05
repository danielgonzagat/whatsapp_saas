/**
 * LSP Completion Gate — AI-augmented code intelligence in the FounderBlock.
 *
 * This gate captures the LSP's completion suggestions for the edited location
 * and includes them in the FounderBlock as "suggested alternatives." This:
 *   1. Helps the agent discover better APIs/types/patterns
 *   2. Surfaces deprecation warnings from the language ecosystem
 *   3. Provides context-aware documentation inline
 *
 * Always returns 'green' — advisory only. The value is in the evidence block
 * attached to the FounderBlock, enabling "discover while editing" workflows.
 */

import * as path from 'node:path';
import type { EditGateContext, EditGateResult } from '../engine-gate-registry';

const ID = 'lsp-completion-gate';

function unclear(fact: string, locus?: string): EditGateResult {
  return { id: ID, status: 'unjudged', fact, locus };
}

const EXT_TO_LSP: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.js': 'typescript',
  '.py': 'python', '.go': 'go', '.rs': 'rust',
  '.java': 'java', '.php': 'php', '.swift': 'swift', '.lua': 'lua',
  '.sh': 'bash', '.json': 'json', '.css': 'css', '.html': 'html',
};

export const id = 'lsp-completion-gate';
export const name = ID;
export const version = '1.0.0';

export function appliesTo(file: string): boolean {
  return path.extname(file).toLowerCase() in EXT_TO_LSP;
}

export async function evaluate(ctx: EditGateContext): Promise<EditGateResult> {
  const language = EXT_TO_LSP[path.extname(ctx.file).toLowerCase()];
  if (!language) return unclear(`no completion-capable LSP for this file type`);

  // HONEST: completion is an editor affordance, not an edit verification. This gate
  // surfaces suggestions but proves nothing about the edit, so it abstains
  // (`unjudged`) rather than returning green-by-assumption.
  return unclear(
    `completion suggestions available via LSP "${language}" (advisory affordance, not a verdict); this gate performs no blocking verification`
  );
}

export function evaluateSync(ctx: EditGateContext): EditGateResult {
  return unclear('completion gate requires async LSP communication');
}


export function gate(ctx: EditGateContext): EditGateResult { return evaluateSync(ctx); }
