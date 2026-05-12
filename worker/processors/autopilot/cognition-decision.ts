import { AIProvider } from '../../providers/ai-provider';
import { prisma } from '../../db';
import { computeDemandState } from '../../providers/commercial-intelligence';
import {
  log,
  type UnknownRecord,
  type AutopilotDecision,
  CONVERSATION_HISTORY_LIMIT,
  JSON_FENCE_G_RE,
  CODE_FENCE_RE,
  normalizeAction,
} from './shared';
import { buildConversationLedger } from './identity';
import {
  type CustomerCognitiveState,
  buildSeedCognitiveState,
  loadCustomerCognitiveState,
  persistCustomerCognitiveState,
} from '../cia/cognitive-state';
import {
  fetchConversationHistory,
  fetchCompressedContactContext,
  getKbContext,
} from './cognition-context';

export async function generatePitchSafe(messageContent: string, settings: UnknownRecord) {
  const apiKey = settings?.openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return 'Tem interesse? Consigo te fazer uma oferta especial se fecharmos ainda hoje.';
  }
  try {
    const ai = new AIProvider(apiKey);
    const pitchPrompt = `Generate a short, high-converting offer message for a lead who said: "${messageContent}". Be direct.`;
    return await ai.generateResponse(
      'You are a concise sales copywriter. Return plain text.',
      pitchPrompt,
    );
  } catch (err: unknown) {
    const errInstanceofError =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    log.warn('autopilot_pitch_fallback', { error: errInstanceofError.message });
    return 'Posso te fazer uma oferta exclusiva. Quer fechar agora?';
  }
}

export async function computePersistentCognitiveState(input: {
  workspaceId: string;
  conversationId?: string | null | undefined;
  contactId?: string | null | undefined;
  phone?: string | null | undefined;
  contactName?: string | null | undefined;
  messageContent: string;
  unreadCount: number;
  lastMessageAt?: Date | string | null | undefined;
  leadScore?: number | null | undefined;
  demandState: ReturnType<typeof computeDemandState>;
  source: string;
}) {
  const previous = await loadCustomerCognitiveState(prisma, {
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    contactId: input.contactId,
    phone: input.phone,
  });

  const state = buildSeedCognitiveState({
    conversationId: input.conversationId,
    contactId: input.contactId,
    phone: input.phone,
    contactName: input.contactName,
    lastMessageText: input.messageContent,
    unreadCount: input.unreadCount,
    lastMessageAt: input.lastMessageAt,
    leadScore: input.leadScore,
    previousState: previous,
    demandState: input.demandState,
  });

  return persistCustomerCognitiveState(prisma, {
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    contactId: input.contactId,
    phone: input.phone,
    contactName: input.contactName,
    state,
    source: input.source,
  });
}

export function computeCognitiveRewardSignal(
  action: string,
  state?: CustomerCognitiveState | null,
) {
  if (!state) return 0;
  const stageBoost = state.stage === 'CHECKOUT' ? 1.2 : state.stage === 'HOT' ? 0.85 : 0.4;
  const trustBoost = state.trustScore * 0.6;
  const urgencyBoost = state.urgencyScore * 0.9;

  switch (action) {
    case 'PAYMENT_RECOVERY':
      return Number((stageBoost + urgencyBoost + 0.9).toFixed(3));
    case 'OFFER':
      return Number((stageBoost + trustBoost + 0.55).toFixed(3));
    case 'SOCIAL_PROOF':
      return Number((trustBoost + 0.45).toFixed(3));
    case 'ASK_CLARIFYING':
      return Number((0.55 + urgencyBoost * 0.35).toFixed(3));
    case 'FOLLOWUP_URGENT':
      return Number((0.75 + urgencyBoost).toFixed(3));
    case 'FOLLOWUP_SOFT':
      return Number((0.45 + trustBoost * 0.5).toFixed(3));
    case 'RESPOND':
      return Number((0.7 + urgencyBoost * 0.45).toFixed(3));
    default:
      return Number((0.1 + trustBoost * 0.2).toFixed(3));
  }
}

export async function decideActionSafe(params: {
  workspaceId?: string;
  contactId?: string;
  phone?: string;
  messageContent: string;
  settings: UnknownRecord;
}): Promise<AutopilotDecision> {
  const { workspaceId, contactId, phone, messageContent, settings } = params;
  const text = (messageContent || '').toLowerCase();

  const hasKeyword = (...keys: string[]) => keys.some((k) => text.includes(k));

  if (hasKeyword('preco', 'preço', 'price', 'valor')) {
    return { intent: 'BUYING', action: 'GHOST_CLOSER', reason: 'price inquiry', confidence: 0.72 };
  }
  if (hasKeyword('agendar', 'agenda', 'calend', 'marcar', 'schedule')) {
    return {
      intent: 'SCHEDULING',
      action: 'SEND_CALENDAR',
      reason: 'scheduling intent',
      confidence: 0.68,
    };
  }
  if (hasKeyword('reclama', 'problema', 'erro', 'suporte', 'ajuda')) {
    return {
      intent: 'COMPLAINT',
      action: 'TRANSFER_AGENT',
      reason: 'complaint/support',
      confidence: 0.7,
    };
  }
  if (hasKeyword('cancelar', 'desistir', 'parei', 'não quero', 'nao quero')) {
    return {
      intent: 'CHURN_RISK',
      action: 'ANTI_CHURN',
      reason: 'churn_language',
      confidence: 0.7,
    };
  }
  if (hasKeyword('oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite')) {
    return { intent: 'GREET', action: 'QUALIFY', reason: 'greeting', confidence: 0.55 };
  }
  if (hasKeyword('teste', 'sim', 'ok', 'certo')) {
    return { intent: 'FOLLOW_UP', action: 'FOLLOW_UP', reason: 'generic_follow', confidence: 0.5 };
  }

  const apiKey = settings?.openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { intent: 'IDLE', action: 'NONE', reason: 'no_ai_key', confidence: 0.3 };
  }

  try {
    const ai = new AIProvider(apiKey);
    const history = await fetchConversationHistory(
      workspaceId,
      contactId,
      phone,
      CONVERSATION_HISTORY_LIMIT,
    );
    const compressedContext = await fetchCompressedContactContext(workspaceId, contactId, phone);
    const kbContext = await getKbContext(workspaceId, messageContent, apiKey);
    const ledger = buildConversationLedger(history);

    const systemPrompt = `Você é o Autopilot de vendas. Classifique intenção e ação para WhatsApp.\nRetorne JSON com: intent (BUYING|SCHEDULING|SUPPORT|OBJECTION|CHURN_RISK|UPSELL|FOLLOW_UP|IDLE), action (SEND_OFFER|SEND_PRICE|SEND_CALENDAR|HANDLE_OBJECTION|TRANSFER_AGENT|FOLLOW_UP|FOLLOW_UP_STRONG|ANTI_CHURN|QUALIFY|NONE), confidence (0-1), reason.`;

    const userMessage = `Mensagem atual: "${messageContent}"\nHistorico integral do contato:\n${ledger.transcript || 'sem historico'}\n\nLedger acumulado do contato:\n${ledger.factsText}\n\nResumo persistente do contato:\n${compressedContext || 'n/d'}\n\nContexto da base de conhecimento:\n${kbContext || 'n/d'}\n\nResponda somente o JSON.`;

    const response = await ai.generateResponse(systemPrompt, userMessage, 'brain');
    const parsed = JSON.parse(response.replace(JSON_FENCE_G_RE, '').replace(CODE_FENCE_RE, ''));
    const normalizedAction = normalizeAction(parsed.action);
    return {
      intent: parsed.intent || 'IDLE',
      action: normalizedAction,
      reason: parsed.reason || 'ai_decision',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.55,
      usedHistory: history.length > 0,
      usedKb: !!kbContext,
    };
  } catch (err: unknown) {
    const errInstanceofError =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    log.warn('autopilot_ai_fallback', { error: errInstanceofError.message });
    return { intent: 'IDLE', action: 'NONE', reason: 'ai_error', confidence: 0.3 };
  }
}
