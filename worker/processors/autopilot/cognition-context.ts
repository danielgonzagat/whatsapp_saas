import OpenAI from 'openai';
import { AIProvider } from '../../providers/ai-provider';
import { prisma } from '../../db';
import {
  log,
  type UnknownRecord,
  CONVERSATION_HISTORY_LIMIT,
  WHITESPACE_RE,
  finalizeReplyStyle,
} from './shared';
import { buildConversationLedger } from './identity';
import {
  analyzeForActiveListening,
  buildWhatsAppConversationPrompt,
  detectAndFixAntiPatterns,
} from '../cia/conversation-policy';
import { type CustomerCognitiveState } from '../cia/cognitive-state';

export { CONVERSATION_HISTORY_LIMIT };

export async function fetchConversationHistory(
  workspaceId?: string,
  contactId?: string,
  phone?: string,
  limit = CONVERSATION_HISTORY_LIMIT,
) {
  if (!workspaceId) return [];
  let contact = contactId
    ? await prisma.contact.findFirst({ where: { id: contactId, workspaceId }, select: { id: true, phone: true } })
    : null;
  if (!contact && phone) {
    contact = await prisma.contact.findFirst({ where: { workspaceId, phone }, select: { id: true, phone: true } });
  }
  if (!contact) return [];

  const messages = await prisma.message.findMany({
    where: { workspaceId, contactId: contact.id },
    orderBy: { createdAt: 'desc' },
    ...(limit > 0 ? { take: limit } : {}),
    select: { content: true, direction: true, createdAt: true },
  });
  return messages.reverse();
}

export async function fetchCompressedContactContext(
  workspaceId?: string,
  contactId?: string,
  phone?: string,
) {
  if (!workspaceId) return '';

  const normalizedPhone = String(phone || '').trim();
  const keys = [
    contactId ? `compressed_context:${contactId}` : '',
    normalizedPhone ? `compressed_context:${normalizedPhone}` : '',
  ].filter(Boolean);

  if (!keys.length) return '';

  const memory = await prisma.kloelMemory.findFirst({
    where: { workspaceId, category: 'compressed_context', key: { in: keys } },
    orderBy: { updatedAt: 'desc' },
    select: { content: true, value: true },
  });

  return String(
    memory?.content ||
      (typeof memory?.value === 'object'
        ? (memory?.value as Record<string, unknown> | null)?.summary
        : '') ||
      '',
  ).trim();
}

export async function getKbContext(workspaceId?: string, text?: string, apiKey?: string) {
  if (!workspaceId || !text || !apiKey) return '';
  try {
    const openai = new OpenAI({ apiKey });
    const cleaned = text.slice(0, 2000);
    const embedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: cleaned,
    });
    const vectorString = `[${embedding.data[0].embedding.join(',')}]`;
    const rows: UnknownRecord[] = await prisma.$queryRaw`
      SELECT v.content, (v.embedding <=> ${vectorString}::vector) AS distance
      FROM "RAC_Vector" v
      JOIN "RAC_KnowledgeSource" s ON v."sourceId" = s.id
      JOIN "RAC_KnowledgeBase" kb ON s."knowledgeBaseId" = kb.id
      WHERE kb."workspaceId" = ${workspaceId}
      ORDER BY distance ASC
      LIMIT 3
    `;
    if (!rows || rows.length === 0) return '';
    return rows
      .map((r: UnknownRecord) => r.content)
      .join('\n---\n')
      .slice(0, 1500);
  } catch (err: unknown) {
    const errInstanceofError = err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    log.warn('kb_context_error', { error: errInstanceofError.message });
    return '';
  }
}

export async function generateAutonomousFallbackResponse(params: {
  workspaceId: string;
  messageContent: string;
  settings: UnknownRecord;
  matchedProducts?: string[];
  contactId?: string;
  phone?: string;
  contactName?: string;
  cognitiveState?: CustomerCognitiveState | null;
  deliveryMode?: string;
}) {
  const {
    workspaceId, messageContent, settings, matchedProducts = [],
    contactId, phone, contactName, cognitiveState, deliveryMode,
  } = params;
  const apiKey = settings?.openai?.apiKey || process.env.OPENAI_API_KEY;

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId }, select: { name: true },
  });
  const products = await prisma.product.findMany({
    where: { workspaceId, active: true },
    select: { name: true, description: true, price: true, currency: true },
    take: 10,
  });

  const workspaceName = workspace?.name || 'empresa';
  const compressedContext = await fetchCompressedContactContext(workspaceId, contactId, phone);
  const history = await fetchConversationHistory(workspaceId, contactId, phone, CONVERSATION_HISTORY_LIMIT);
  const ledger = buildConversationLedger(history);
  const listeningSignals = analyzeForActiveListening(messageContent, contactName);
  const productSummary = products.length
    ? products.map((product: UnknownRecord) => {
        const price = typeof product.price === 'number' ? ` (${product.currency || 'BRL'} ${product.price})` : '';
        const description = product.description ? ` - ${String(product.description).slice(0, 120)}` : '';
        return `${product.name}${price}${description}`;
      }).join('\n')
    : 'Nenhum produto cadastrado.';

  if (!apiKey) {
    if (matchedProducts.length > 0) {
      return detectAndFixAntiPatterns(
        `${contactName ? `${contactName.split(WHITESPACE_RE)[0]}, ` : ''}posso te ajudar com ${matchedProducts.join(', ')}. ${listeningSignals.validationNeeded ? 'Antes de qualquer coisa, faz sentido a sua dúvida.' : ''} ${cognitiveState?.nextBestQuestion || 'O que faz mais sentido ver primeiro?'}`);
    }
    return detectAndFixAntiPatterns(
      `${listeningSignals.validationNeeded ? 'Faz sentido o que voce trouxe. ' : ''}Posso te ajudar por aqui. ${cognitiveState?.nextBestQuestion || 'O que voce precisa resolver primeiro?'}`);
  }

  try {
    const ai = new AIProvider(apiKey);
    const systemPrompt = buildWhatsAppConversationPrompt({
      workspaceName, contactName, compressedContext,
      conversationHistory: ledger.transcript, conversationLedger: ledger.factsText,
      productSummary, matchedProducts, cognitiveState, listeningSignals, deliveryMode,
      action: cognitiveState?.nextBestAction || 'RESPOND',
      tactic: cognitiveState?.nextBestAction === 'RESPOND' && listeningSignals.validationNeeded ? 'EMPATHETIC_ECHO' : null,
    });

    const userPrompt = `Mensagem do cliente:\n${messageContent}\nGere uma unica mensagem pronta para WhatsApp.\nSe houver emocao, valide antes de conduzir.\nNao use listas.\nNao use emoji por padrao.\nNao use mais de uma pergunta.\nEvite frases de vendedor-script.\nSe a mensagem permitir, termine com um gancho curto que convide resposta.`;

    const response = await ai.generateResponse(systemPrompt, userPrompt, 'writer');
    return detectAndFixAntiPatterns(String(response || '').trim());
  } catch (err: unknown) {
    const errInstanceofError = err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    log.warn('autopilot_generic_fallback_ai_error', { workspaceId, error: errInstanceofError?.message });
    return detectAndFixAntiPatterns(
      matchedProducts.length > 0
        ? `Posso te ajudar com ${matchedProducts.join(', ')}. ${cognitiveState?.nextBestQuestion || 'Qual ponto voce quer ver primeiro?'}`
        : `${listeningSignals.validationNeeded ? 'Faz sentido o que voce trouxe. ' : ''}${cognitiveState?.nextBestQuestion || 'Me diz o que voce precisa resolver primeiro.'}`);
  }
}
