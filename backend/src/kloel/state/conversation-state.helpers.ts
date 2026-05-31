/**
 * Verbalization helpers for {@link ConversationState}.
 *
 * The LLM is a verbalizer of the REAL State (Y-4 / X §2.6/3.4): these
 * helpers turn the structured, data-sourced State into a compact textual
 * block the model can read. They NEVER invent fields — every line maps to
 * a real source resolved by StateBuilderService.
 */

import type { ConversationState } from './conversation-state.types';

/**
 * Render a compact, prompt-injectable summary of the real ConversationState.
 * Returns an empty string when the State carries no usable signal so the
 * caller can omit the block entirely (honest absence, not filler).
 */
export function summarizeConversationState(state: ConversationState): string {
  const lines: string[] = [];

  if (state.workspace) {
    lines.push(`Workspace: ${state.workspace.name} (${state.workspace.id})`);
  }
  if (state.actor) {
    lines.push(`Ator: ${state.actor.name} [${state.actor.role}]`);
  }
  if (state.contact) {
    lines.push(
      `Contato: ${state.contact.name ?? state.contact.phone} · lead=${state.contact.leadScore} · ` +
        `sentimento=${state.contact.sentiment} · prob_compra=${state.contact.purchaseProbability}`,
    );
  }
  if (state.recentEvents.length > 0) {
    const recent = state.recentEvents
      .slice(0, 5)
      .map((event) => `${event.action}:${event.resource}`)
      .join(', ');
    lines.push(`Eventos recentes (${state.recentEvents.length}): ${recent}`);
  }
  if (state.memory.shortTerm.length > 0) {
    lines.push(`Memória curta: ${state.memory.shortTerm.length} turnos persistidos`);
  }
  if (state.capabilities.length > 0) {
    lines.push(`Capacidades disponíveis: ${state.capabilities.length}`);
  }

  if (lines.length === 0) {
    return '';
  }

  return ['ESTADO REAL DA CONVERSA:', ...lines].join('\n');
}
