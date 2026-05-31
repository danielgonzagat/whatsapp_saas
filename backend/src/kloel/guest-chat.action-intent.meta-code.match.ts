// Wave 68 Phase 2 — Meta 1 self-code + codegraph intent dispatch.
// See docs/architecture/WAVE_60_GUEST_CHAT_ACTION_INTENT_DECOMP_PLAN.md.
// Order invariant: CÓDIGO block first, then CODEGRAPH block. No re-ordering
// within or across sections.

import type { ActionIntent } from './guest-chat.action-intent.self-awareness.match';

export function detectMetaCodeIntent(msg: string): ActionIntent {
  // ── CÓDIGO (Meta 1 — self-code consciousness) ──
  if (/git.status|git status|estado do git/.test(msg)) {
    return { tool: 'git_status', args: {} };
  }
  if (/git.log|git log|hist[oó]rico.*commit/.test(msg)) {
    return { tool: 'git_log', args: { count: 5 } };
  }
  if (/git.diff|git diff|mudan[cç]as.*c[oó]digo/.test(msg)) {
    return { tool: 'git_diff', args: {} };
  }
  if (/(?:lint|problema|erro|issue|bug).*(?:c[oó]digo|code)|detectar|analisar/.test(msg)) {
    return { tool: 'code_detect_issues', args: {} };
  }
  if (/c[oó]digo.*(fonte|source)|ler.*arquivo|read.*file|estrutura|arquivo.*codigo/.test(msg)) {
    const pathMatch = msg.match(
      /(?:arquivo|file|path|codigo|schema|prisma|fonte|source)\s+(?:de\s+)?['"]?([a-zA-Z0-9_\-/.]+(?:\.prisma|\.ts|\.tsx|\.js|\.json|\.md)?)/i,
    );
    const extracted = pathMatch?.[1] || '';
    const filePath = extracted.includes('.')
      ? extracted.startsWith('backend/') ||
        extracted.startsWith('frontend/') ||
        extracted.startsWith('worker/')
        ? extracted
        : `backend/src/${extracted.replace(/^src\//, '')}`
      : 'backend/src/kloel/guest-chat.action-intent.helpers.ts';
    return { tool: 'code_outline', args: { path: filePath } };
  }
  if (/build|compila[rç]|status.*build/.test(msg)) {
    return { tool: 'build_status', args: { scope: 'backend' } };
  }
  if (/teste|rodar test|executar test/.test(msg)) {
    return { tool: 'run_backend_tests', args: {} };
  }
  if (/schema|prisma|banco.*dados|database/.test(msg)) {
    return { tool: 'read_prisma_schema', args: {} };
  }
  if (/busca(r|ndo)?.*c[oó]digo|pesquisa(r|ndo)?.*c[oó]digo|grep/.test(msg)) {
    return {
      tool: 'search_codebase',
      args: { pattern: (msg.replace(/.*c[oó]digo\s*/, '').trim() || '.').replace(/^por\s+/i, '') },
    };
  }

  // ── CODEGRAPH (Meta 1 — knowledge-graph code intelligence) ──
  if (/codegraph\s+status|status\s+codegraph|estado.*codegraph/.test(msg)) {
    return { tool: 'codegraph_status', args: {} };
  }
  if (/codegraph\s+busca|codegraph\s+search|procura\s+no\s+codegraph/.test(msg)) {
    const qMatch = msg.match(
      /(?:busca|search|procura|por)\s+(?:no\s+codegraph\s+)?['"]?([A-Za-zÀ-ÿ0-9\s_\-.+]{2,60}?)(?:\s*$|\.|\?)/i,
    );
    return { tool: 'codegraph_search', args: { query: qMatch?.[1]?.trim() || msg } };
  }
  if (/codegraph\s+contexto|contexto\s+codegraph|codegraph\s+context/.test(msg)) {
    const qMatch = msg.match(
      /(?:contexto|context)\s*:?\s*['"]?([A-Za-zÀ-ÿ0-9\s_\-.+]{2,60}?)(?:\s*$)/i,
    );
    return { tool: 'codegraph_context', args: { task: qMatch?.[1]?.trim() || 'overview' } };
  }
  if (/codegraph\s+(quem\s+chama|callers|quem\s+usa)/.test(msg)) {
    const qMatch = msg.match(
      /(?:chama|callers|usa)\s+(?:o\s+|a\s+)?['"]?([A-Za-zÀ-ÿ0-9_\-.+]{2,40})/i,
    );
    return { tool: 'codegraph_callers', args: { symbol: qMatch?.[1]?.trim() || '' } };
  }
  if (/codegraph\s+(o\s+que\s+chama|callees|depend[eê]ncias)/.test(msg)) {
    const qMatch = msg.match(
      /(?:chama|callees|depend[eê]ncias\s+de)\s+(?:o\s+|a\s+)?['"]?([A-Za-zÀ-ÿ0-9_\-.+]{2,40})/i,
    );
    return { tool: 'codegraph_callees', args: { symbol: qMatch?.[1]?.trim() || '' } };
  }
  if (/codegraph\s+impacto|impacto\s+codegraph|codegraph\s+impact/.test(msg)) {
    const qMatch = msg.match(/(?:impacto|impact)\s+(?:de\s+)?['"]?([A-Za-zÀ-ÿ0-9_\-.+]{2,40})/i);
    return { tool: 'codegraph_impact', args: { symbol: qMatch?.[1]?.trim() || '' } };
  }
  if (/codegraph\s+(detalhes|node|info|mostra)/.test(msg)) {
    const qMatch = msg.match(
      /(?:detalhes|node|info|mostra)\s+(?:o\s+|a\s+)?['"]?([A-Za-zÀ-ÿ0-9_\-.+]{2,40})/i,
    );
    return { tool: 'codegraph_node', args: { symbol: qMatch?.[1]?.trim() || '' } };
  }
  if (/codegraph\s+(arquivos|files|[aá]rvore|estrutura)/.test(msg)) {
    return { tool: 'codegraph_files', args: {} };
  }

  return null;
}
