import { extractFallbackTopic as extractFallbackTopicValue } from '../whatsapp-normalization.util';

const PRE_C__O_QUANTO_VALOR_C_RE = /(pre[cç]o|quanto|valor|custa|comprar|boleto|pix|pagamento)/i;
const AGENDAR_AGENDA_REUNI_A_RE = /(agendar|agenda|reuni[aã]o|hor[aá]rio|marcar)/i;
const OL__A__BOM_DIA_BOA_TARD_RE = /(ol[áa]|bom dia|boa tarde|boa noite|oi\b)/i;

export function hasOutboundAction(
  actions: Array<{ tool?: string; result?: unknown }> = [],
): boolean {
  const outboundTools = new Set([
    'send_message',
    'send_product_info',
    'create_payment_link',
    'send_media',
    'send_document',
    'send_voice_note',
    'send_audio',
  ]);

  return actions.some((action) => {
    if (!outboundTools.has(String(action?.tool || ''))) {
      return false;
    }

    const result =
      action?.result && typeof action.result === 'object'
        ? (action.result as Record<string, unknown>)
        : {};

    return result.sent === true || result.success === true || Boolean(result.messageId);
  });
}

export function buildInlineFallbackReply(messageContent: string): string {
  const normalized = String(messageContent || '')
    .trim()
    .toLowerCase();
  const topic = extractFallbackTopicValue(messageContent);

  if (PRE_C__O_QUANTO_VALOR_C_RE.test(normalized)) {
    return topic
      ? `Boa, você foi direto ao ponto. Posso confirmar preço, pagamento e disponibilidade de ${topic}. Quer que eu siga por aí?`
      : 'Boa, sem rodeio fica melhor. Posso confirmar preço, pagamento e disponibilidade. Me diz o produto ou procedimento.';
  }

  if (AGENDAR_AGENDA_REUNI_A_RE.test(normalized)) {
    return 'Perfeito, organização ainda existe. Me diz o dia ou horário e eu organizo isso com você.';
  }

  if (OL__A__BOM_DIA_BOA_TARD_RE.test(normalized)) {
    return 'Oi. Vamos pular a cerimônia: me diz o produto ou a dúvida e eu sigo com você.';
  }

  return topic
    ? `Entendi. Você falou de ${topic}. Me diz o que quer confirmar e eu te respondo sem enrolação.`
    : 'Entendi. Me diz o produto, exame ou objetivo e eu sigo com a informação certa, sem teatro.';
}

export function isAutonomousEnabled(
  settings: any,
  ingestMode?: string,
  shouldForceLiveAutonomyFallback?: (settings: any, ingestMode?: string) => boolean,
): boolean {
  const mode = String(settings?.autonomy?.mode || '')
    .trim()
    .toUpperCase();

  if (mode === 'LIVE' || mode === 'BACKLOG' || mode === 'FULL') {
    return true;
  }

  if (mode === 'HUMAN_ONLY' || mode === 'SUSPENDED') {
    return false;
  }

  if (mode === 'OFF') {
    return settings?.autopilot?.enabled === true;
  }

  if (mode) {
    return mode === 'LIVE' || mode === 'BACKLOG' || mode === 'FULL';
  }

  if (ingestMode === 'live' && shouldForceLiveAutonomyFallback?.(settings, ingestMode)) {
    return true;
  }

  return settings?.autopilot?.enabled === true;
}

export function shouldUseInlineReactiveProcessing(settings: any, ingestMode?: string): boolean {
  if (ingestMode !== 'live') {
    return false;
  }

  const override = String(process.env.AUTOPILOT_INLINE_REACTIVE || 'true')
    .trim()
    .toLowerCase();

  if (['false', '0', 'off', 'no'].includes(override)) {
    return false;
  }

  if (['true', '1', 'on', 'yes'].includes(override)) {
    return true;
  }

  return settings?.autopilot?.enabled === true;
}

export function shouldBypassHumanLock(settings?: any): boolean {
  const override = String(process.env.AUTOPILOT_BYPASS_HUMAN_LOCK || '')
    .trim()
    .toLowerCase();

  if (['true', '1', 'on', 'yes'].includes(override)) {
    return true;
  }

  if (['false', '0', 'off', 'no'].includes(override)) {
    return false;
  }

  return (
    String(settings?.autonomy?.mode || '')
      .trim()
      .toUpperCase() === 'FULL'
  );
}

export function shouldForceLiveAutonomyFallback(settings: any, ingestMode?: string): boolean {
  if (ingestMode !== 'live') {
    return false;
  }

  const mode = String(settings?.autonomy?.mode || '')
    .trim()
    .toUpperCase();
  if (mode) {
    return false;
  }

  const provider = String(settings?.whatsappProvider || '')
    .trim()
    .toLowerCase();
  const sessionStatus = String(
    settings?.whatsappWebSession?.status ||
      settings?.whatsappApiSession?.status ||
      settings?.connectionStatus ||
      '',
  )
    .trim()
    .toLowerCase();
  const runtimeState = String(settings?.ciaRuntime?.state || '')
    .trim()
    .toUpperCase();

  const wahaWorkspace =
    provider === 'whatsapp-api' ||
    provider === 'whatsapp-web-agent' ||
    Boolean(settings?.whatsappApiSession) ||
    Boolean(settings?.whatsappWebSession);
  const connectedSession =
    sessionStatus === 'connected' ||
    runtimeState === 'LIVE_READY' ||
    runtimeState === 'LIVE_AUTONOMY' ||
    runtimeState === 'EXECUTING_IMMEDIATELY' ||
    runtimeState === 'EXECUTING_BACKLOG';

  return wahaWorkspace && connectedSession;
}

export function shouldAutoReclaimHumanLock(
  settings: any,
  conversation?: {
    mode?: string | null;
    status?: string | null;
    assignedAgentId?: string | null;
    messages?: Array<{
      direction?: string | null;
      createdAt?: Date | string | null;
    }>;
  } | null,
): boolean {
  const override = String(process.env.AUTOPILOT_RECLAIM_HUMAN_LOCK_ON_INBOUND || 'true')
    .trim()
    .toLowerCase();

  if (['false', '0', 'off', 'no'].includes(override)) {
    return false;
  }

  const autonomyMode = String(settings?.autonomy?.mode || '')
    .trim()
    .toUpperCase();
  if (autonomyMode === 'HUMAN_ONLY' || autonomyMode === 'SUSPENDED') {
    return false;
  }

  const conversationMode = String(conversation?.mode || '')
    .trim()
    .toUpperCase();
  if (!conversation || conversationMode === 'PAUSED') {
    return false;
  }

  const latestMessage = (conversation.messages || [])[0];
  const latestDirection = String(latestMessage?.direction || '')
    .trim()
    .toUpperCase();

  if (latestDirection !== 'INBOUND') {
    return false;
  }

  return conversationMode === 'HUMAN' || Boolean(conversation.assignedAgentId);
}
