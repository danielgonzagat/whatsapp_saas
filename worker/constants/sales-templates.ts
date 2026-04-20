const CALENDAR_LINK_RE = /\{\{calendarLink\}\}/g;
/**
 * Sales/autopilot message templates and helpers (PR P4-1).
 *
 * Before P4-1 these templates were duplicated in worker/processor.ts
 * (`generateTemplate`) and backend/src/autopilot/autopilot.service.ts
 * (inline strings in the action switch). The worker copy hardcoded
 * `https://cal.com/danielpenin` as the calendar link, which shipped
 * to every customer's leads as if Daniel were their salesperson.
 *
 * After P4-1:
 *   - All templates live in this file in TWO byte-identical copies:
 *       backend/src/common/sales-templates.ts
 *       worker/constants/sales-templates.ts
 *     enforced by scripts/ops/check-constants-sync.mjs in CI
 *   - The calendar link is a `{{calendarLink}}` placeholder resolved
 *     at runtime from workspace.providerSettings.calendarLink, with
 *     a fallback to process.env.DEFAULT_CALENDAR_LINK or empty
 *   - shouldUseUnifiedAgent (worker) is fixed in this PR to no
 *     longer fall through to "always true" for any non-empty message
 *
 * The templates here are pure data with no business logic. The
 * `renderTemplate` function performs simple {{placeholder}}
 * substitution at use-site.
 */

export const SALES_TEMPLATES: Readonly<Record<string, string>> = Object.freeze({
  SEND_PRICE: 'Posso te passar os valores e opções agora. Quer que eu envie o preço detalhado?',
  FOLLOW_UP:
    'Vi que não conseguimos concluir. Posso te ajudar em algo ou enviar uma condição especial?',
  FOLLOW_UP_SOFT:
    'Oi! Só checando se posso te ajudar com algo ou se prefere que eu volte mais tarde. 🙂',
  FOLLOW_UP_STRONG:
    'Última chamada: reservei uma condição especial pra você hoje. Quer fechar agora?',
  SEND_CALENDAR: 'Aqui está meu link de agenda para marcarmos rápido: {{calendarLink}}',
  QUALIFY: 'Para te ajudar melhor, qual é a sua necessidade principal e prazo?',
  FILTER:
    'Só para confirmar: você realmente está avaliando contratar agora ou é apenas curiosidade?',
  TRANSFER_AGENT: 'Vou chamar um especialista humano para te atender em instantes.',
  OFFER:
    'Tenho uma condição especial hoje. Podemos fechar agora com um bônus exclusivo. Posso enviar?',
  GHOST_CLOSER: 'Notei que a gente parou antes de finalizar. Quer que eu reserve sua vaga agora?',
  NIGHT_SOFT:
    'Vi seu interesse! Estou fora do horário agora, mas já deixei separado pra você. Amanhã cedo te chamo. Tudo bem?',
  HANDLE_OBJECTION:
    'Entendo sua preocupação. Posso ajustar a proposta para encaixar no que você precisa e caber no bolso. Que tal eu te mandar uma condição mais leve agora?',
  ANTI_CHURN:
    'Quero garantir que você tenha resultado. Posso ajustar plano, oferecer bônus ou suporte extra. O que faria você ficar 100% satisfeito?',
  UPSELL:
    'Como você já usa nosso serviço, há um upgrade que libera mais resultados. Quer que eu te mostre a opção que mais compensa?',
  AUTO_REPLY_NIGHT:
    'Opa! Agora estou offline, mas já anotei sua dúvida. Amanhã 8h te respondo sem falta!',
  SOFT_CLOSE_NIGHT:
    'Oi! Vi seu interesse. Já deixei tudo preparado para você. Amanhã cedo eu retomo para concluirmos, tudo bem?',
});

export interface TemplateVars {
  calendarLink?: string;
  // Reserved for future placeholders (e.g. agentName, productName).
  // Keep the interface narrow so misuse is caught at compile time.
}

/**
 * Render a template string by substituting `{{placeholder}}` markers.
 *
 * Resolution order for `{{calendarLink}}`:
 *   1. `vars.calendarLink` (caller-supplied, usually from workspace
 *      provider settings)
 *   2. `process.env.DEFAULT_CALENDAR_LINK` (deployment-wide default)
 *   3. empty string (the template still renders, but the placeholder
 *      is removed; callers should detect this and avoid sending if
 *      a calendar link is essential to the action)
 */
export function renderTemplate(key: keyof typeof SALES_TEMPLATES, vars: TemplateVars = {}): string {
  const raw = SALES_TEMPLATES[key];
  if (!raw) {
    return '';
  }
  const calendarLink = vars.calendarLink ?? process.env.DEFAULT_CALENDAR_LINK ?? '';
  return raw.replace(CALENDAR_LINK_RE, calendarLink);
}
