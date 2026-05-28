// Wave 68 Phase 2 — self-awareness intent dispatch.
// See docs/architecture/WAVE_60_GUEST_CHAT_ACTION_INTENT_DECOMP_PLAN.md.
// Order invariant: explain → gaps → health → capabilities (keep as-is).

export type ActionIntent = { tool: string; args: Record<string, unknown> } | null;

export function detectSelfAwarenessIntent(msg: string): ActionIntent {
  // ── SELF-AWARENESS / P1 ──
  const explainCapabilityMatch = msg.match(
    /expli(?:ca|que|car|cando).*(?:capacidade|capability|tool|ferramenta)\s+([a-z0-9_.:-]+)/,
  );
  if (explainCapabilityMatch?.[1]) {
    return { tool: 'self.explain', args: { capabilityId: explainCapabilityMatch[1] } };
  }
  if (/(capacidade|tool|ferramenta|a[cç][aã]o).*(quebrad|ausent|lacuna|falt|falh)/.test(msg)) {
    return { tool: 'self.gaps', args: {} };
  }
  if (
    /(sa[uú]de|health|status).*(kloel|sistema|integra|fila|banco|pagamento|checkout|whatsapp)/.test(
      msg,
    ) ||
    /qual integra[cç][aã]o.*erro/.test(msg)
  ) {
    return { tool: 'self.health', args: {} };
  }
  if (
    /(o que|quais?).*(consegue|sabe|capacidades|fazer)/.test(msg) ||
    /capacidades?.*(dispon[ií]veis|atuais|agora)/.test(msg)
  ) {
    return { tool: 'self.capabilities', args: {} };
  }
  return null;
}
