import OpenAI from 'openai';
import { AIProvider } from '../../providers/ai-provider';
import { prisma } from '../../db';
import {
  log,
  type UnknownRecord,
  type AutopilotDecision,
  type QuotedCustomerMessage,
  CONVERSATION_HISTORY_LIMIT,
  JSON_FENCE_RE,
  CODE_FENCE_RE,
  JSON_FENCE_G_RE,
  WHITESPACE_G_RE,
  WHITESPACE_RE,
  finalizeReplyStyle,
  normalizeAction,
  buildMirroredReplyPlanFallback,
} from './shared';
import { buildConversationLedger } from './identity';
import {
  analyzeForActiveListening,
  buildWhatsAppConversationPrompt,
  detectAndFixAntiPatterns,
} from '../cia/conversation-policy';
import {
  type CognitiveActionType,
  type CustomerCognitiveState,
  buildSeedCognitiveState,
  loadCustomerCognitiveState,
  persistCustomerCognitiveState,
} from '../cia/cognitive-state';
import { computeDemandState } from '../../providers/commercial-intelligence';
import { dispatchOutboundThroughFlow } from '../../providers/outbound-dispatcher';
import { buildQueueJobId } from '../../job-id';
import { forEachSequential } from '../../utils/async-sequence';
import { createHash } from 'node:crypto';

export { CONVERSATION_HISTORY_LIMIT };

async function fetchConversationHistory(
  workspaceId?: string,
  contactId?: string,
  phone?: string,
  limit = CONVERSATION_HISTORY_LIMIT,
) {
  if (!workspaceId) {
    return [];
  }
  let contact = contactId
    ? await prisma.contact.findFirst({
        where: { id: contactId, workspaceId },
        select: { id: true, phone: true },
      })
    : null;
  if (!contact && phone) {
    contact = await prisma.contact.findFirst({
      where: { workspaceId, phone },
      select: { id: true, phone: true },
    });
  }
  if (!contact) {
    return [];
  }

  const messages = await prisma.message.findMany({
    where: { workspaceId, contactId: contact.id },
    orderBy: { createdAt: 'desc' },
    ...(limit > 0 ? { take: limit } : {}),
    select: { content: true, direction: true, createdAt: true },
  });
  return messages.reverse();
}

async function fetchCompressedContactContext(
  workspaceId?: string,
  contactId?: string,
  phone?: string,
) {
  if (!workspaceId) {
    return '';
  }

  const normalizedPhone = String(phone || '').trim();
  const keys = [
    contactId ? `compressed_context:${contactId}` : '',
    normalizedPhone ? `compressed_context:${normalizedPhone}` : '',
  ].filter(Boolean);

  if (!keys.length) {
    return '';
  }

  const memory = await prisma.kloelMemory.findFirst({
    where: {
      workspaceId,
      category: 'compressed_context',
      key: { in: keys },
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      content: true,
      value: true,
    },
  });

  return String(
    memory?.content ||
      (typeof memory?.value === 'object'
        ? (memory?.value as Record<string, unknown> | null)?.summary
        : '') ||
      '',
  ).trim();
}

async function getKbContext(workspaceId?: string, text?: string, apiKey?: string) {
  if (!workspaceId || !text || !apiKey) {
    return '';
  }
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
    if (!rows || rows.length === 0) {
      return '';
    }
    return rows
      .map((r: UnknownRecord) => r.content)
      .join('\n---\n')
      .slice(0, 1500);
  } catch (err: unknown) {
    const errInstanceofError =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    log.warn('kb_context_error', { error: errInstanceofError.message });
    return '';
  }
}

async function generatePitchSafe(messageContent: string, settings: UnknownRecord) {
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

async function generateAutonomousFallbackResponse(params: {
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
    workspaceId,
    messageContent,
    settings,
    matchedProducts = [],
    contactId,
    phone,
    contactName,
    cognitiveState,
    deliveryMode,
  } = params;
  const apiKey = settings?.openai?.apiKey || process.env.OPENAI_API_KEY;

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { name: true },
  });
  const products = await prisma.product.findMany({
    where: { workspaceId, active: true },
    select: { name: true, description: true, price: true, currency: true },
    take: 10,
  });

  const workspaceName = workspace?.name || 'empresa';
  const compressedContext = await fetchCompressedContactContext(workspaceId, contactId, phone);
  const history = await fetchConversationHistory(
    workspaceId,
    contactId,
    phone,
    CONVERSATION_HISTORY_LIMIT,
  );
  const ledger = buildConversationLedger(history);
  const listeningSignals = analyzeForActiveListening(messageContent, contactName);
  const productSummary = products.length
    ? products
        .map((product: UnknownRecord) => {
          const price =
            typeof product.price === 'number'
              ? ` (${product.currency || 'BRL'} ${product.price})`
              : '';
          const description = product.description
            ? ` - ${String(product.description).slice(0, 120)}`
            : '';
          return `${product.name}${price}${description}`;
        })
        .join('\n')
    : 'Nenhum produto cadastrado.';

  if (!apiKey) {
    if (matchedProducts.length > 0) {
      return detectAndFixAntiPatterns(
        `${contactName ? `${contactName.split(WHITESPACE_RE)[0]}, ` : ''}posso te ajudar com ${matchedProducts.join(', ')}. ${
          listeningSignals.validationNeeded
            ? 'Antes de qualquer coisa, faz sentido a sua dúvida.'
            : ''
        } ${cognitiveState?.nextBestQuestion || 'O que faz mais sentido ver primeiro?'}`,
      );
    }

    return detectAndFixAntiPatterns(
      `${
        listeningSignals.validationNeeded ? 'Faz sentido o que voce trouxe. ' : ''
      }Posso te ajudar por aqui. ${
        cognitiveState?.nextBestQuestion || 'O que voce precisa resolver primeiro?'
      }`,
    );
  }

  try {
    const ai = new AIProvider(apiKey);
    const systemPrompt = buildWhatsAppConversationPrompt({
      workspaceName,
      contactName,
      compressedContext,
      conversationHistory: ledger.transcript,
      conversationLedger: ledger.factsText,
      productSummary,
      matchedProducts,
      cognitiveState,
      listeningSignals,
      deliveryMode,
      action: cognitiveState?.nextBestAction || 'RESPOND',
      tactic:
        cognitiveState?.nextBestAction === 'RESPOND' && listeningSignals.validationNeeded
          ? 'EMPATHETIC_ECHO'
          : null,
    });

    const userPrompt = `Mensagem do cliente:
${messageContent}
Gere uma unica mensagem pronta para WhatsApp.
Se houver emocao, valide antes de conduzir.
Nao use listas.
Nao use emoji por padrao.
Nao use mais de uma pergunta.
Evite frases de vendedor-script.
Se a mensagem permitir, termine com um gancho curto que convide resposta.`;

    const response = await ai.generateResponse(systemPrompt, userPrompt, 'writer');

    return detectAndFixAntiPatterns(String(response || '').trim());
  } catch (err: unknown) {
    const errInstanceofError =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    log.warn('autopilot_generic_fallback_ai_error', {
      workspaceId,
      error: errInstanceofError?.message,
    });
    return detectAndFixAntiPatterns(
      matchedProducts.length > 0
        ? `Posso te ajudar com ${matchedProducts.join(', ')}. ${
            cognitiveState?.nextBestQuestion || 'Qual ponto voce quer ver primeiro?'
          }`
        : `${
            listeningSignals.validationNeeded ? 'Faz sentido o que voce trouxe. ' : ''
          }${cognitiveState?.nextBestQuestion || 'Me diz o que voce precisa resolver primeiro.'}`,
    );
  }
}

async function computePersistentCognitiveState(input: {
  workspaceId: string;
  conversationId?: string | null;
  contactId?: string | null;
  phone?: string | null;
  contactName?: string | null;
  messageContent: string;
  unreadCount: number;
  lastMessageAt?: Date | string | null;
  leadScore?: number | null;
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

function computeCognitiveRewardSignal(
  action: CognitiveActionType,
  state?: CustomerCognitiveState | null,
) {
  if (!state) {
    return 0;
  }
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

function buildCognitiveMessage(params: {
  action: CognitiveActionType;
  state?: CustomerCognitiveState | null;
  contactName?: string;
  matchedProducts?: string[];
  tactic?: string | null;
}) {
  const leadFirstName = String(params.contactName || '')
    .trim()
    .split(WHITESPACE_RE)
    .filter(Boolean)[0];
  const productText = params.matchedProducts?.length
    ? ` sobre ${params.matchedProducts.join(', ')}`
    : '';
  const tactic = String(params.tactic || '');
  const prefix =
    leadFirstName && (tactic === 'EMPATHETIC_ECHO' || tactic === 'STORYTELLING_HOOK')
      ? `${leadFirstName}, `
      : '';

  switch (params.action) {
    case 'ASK_CLARIFYING':
      if (tactic === 'EMPATHETIC_ECHO') {
        return `${prefix}faz sentido querer entender isso melhor${productText}. O que pesa mais pra você agora?`;
      }
      if (tactic === 'PAIN_PROBING') {
        return `${prefix}pra eu te orientar certo${productText}, o que mais te trava hoje?`;
      }
      if (tactic === 'QUALIFY_NEED') {
        return `Pra eu te orientar certo${productText}, qual necessidade você quer resolver primeiro?`;
      }
      return `Pra eu te ajudar melhor${productText}, sua prioridade é valor, resultado ou próximo passo?`;
    case 'SOCIAL_PROOF':
      if (tactic === 'TRUST_REASSURANCE') {
        return `Faz sentido ter essa dúvida${productText}. Se quiser, eu te explico o ponto principal de forma direta.`;
      }
      return `Faz sentido ter essa dúvida${productText}. Se quiser, eu te mostro o que costuma destravar essa decisão.`;
    case 'OFFER':
      if (tactic === 'EMPATHETIC_ECHO') {
        return `${prefix}pelo que você trouxe${productText}, faz sentido buscar um caminho simples e seguro. Se quiser, eu te mostro a melhor opção agora.`;
      }
      if (tactic === 'EPIPHANY_DROP') {
        return `${prefix}tem um detalhe${productText} que costuma mudar a decisão: a melhor opção nem sempre é a mais barata, e sim a que resolve com menos atrito. Se quiser, eu te mostro qual faz mais sentido aqui.`;
      }
      if (tactic === 'STORYTELLING_HOOK') {
        return `${prefix}isso me lembra gente que quase travou nessa etapa${productText} e destravou quando viu o caminho mais simples. Se quiser, eu te mostro direto.`;
      }
      if (tactic === 'CHECKOUT_SIMPLIFICATION') {
        return `Pelo que você me disse${productText}, eu posso te mostrar a opção mais simples pra avançar agora.`;
      }
      if (tactic === 'PRICE_VALUE_REFRAME') {
        return `Aqui${productText}, o ponto não é só preço. Se fizer sentido, eu te mostro a opção com melhor custo-benefício.`;
      }
      return `Pelo que você me disse${productText}, eu já posso te mostrar a melhor opção pra seguir.`;
    case 'FOLLOWUP_URGENT':
      if (tactic === 'SAFE_URGENCY') {
        return `Ainda dá pra priorizar isso hoje${productText}. Se fizer sentido, eu já te passo o próximo passo.`;
      }
      return `Sua conversa está perto de avançar${productText}. Se ainda fizer sentido, eu sigo com você agora.`;
    case 'FOLLOWUP_SOFT':
      if (tactic === 'EMPATHETIC_ECHO') {
        return `${prefix}sua conversa ficou em aberto${productText}, e tudo bem. Se ainda fizer sentido, eu continuo daqui sem te fazer repetir nada.`;
      }
      if (tactic === 'CHECKOUT_SIMPLIFICATION') {
        return `Sua conversa ficou em aberto${productText}. Se ainda fizer sentido, eu te resumo o caminho mais simples.`;
      }
      return `Sua conversa ficou em aberto${productText}. Se quiser, eu continuo daqui.`;
    case 'PAYMENT_RECOVERY':
      if (tactic === 'CHECKOUT_SIMPLIFICATION') {
        return `Seu pagamento ficou pendente${productText}. Se quiser, eu te passo o próximo passo agora.`;
      }
      return `Seu pagamento ficou pendente${productText}. Se quiser, eu reativo isso agora.`;
    default:
      if (tactic === 'TRUST_REASSURANCE') {
        return `Estou acompanhando sua conversa${productText}. Se quiser, eu te digo o melhor próximo passo.`;
      }
      if (tactic === 'EMPATHETIC_ECHO') {
        return `${prefix}eu acompanhei o que você trouxe${productText}. Se fizer sentido, eu te digo o próximo passo mais leve daqui.`;
      }
      return `Estou acompanhando sua conversa${productText}. Posso seguir com você por aqui.`;
  }
}

function normalizeAutonomyLedgerValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeAutonomyLedgerValue(item));
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = normalizeAutonomyLedgerValue(record[key]);
        return acc;
      }, {});
  }

  return value ?? null;
}

function buildAutonomyExecutionKey(input: {
  workspaceId: string;
  actionType: string;
  contactId?: string;
  conversationId?: string;
  phone?: string;
  payload: Record<string, unknown>;
}) {
  const hash = createHash('sha256');
  hash.update(
    JSON.stringify(
      normalizeAutonomyLedgerValue({
        workspaceId: input.workspaceId,
        actionType: input.actionType,
        contactId: input.contactId || null,
        conversationId: input.conversationId || null,
        phone: input.phone || null,
        payload: input.payload,
      }),
    ),
  );
  return hash.digest('hex');
}

function isAutonomyExecutionDuplicate(err: unknown) {
  const e = err as UnknownRecord | undefined;
  return (
    e?.code === 'P2002' ||
    String(e?.message || '')
      .toLowerCase()
      .includes('unique constraint')
  );
}

async function beginAutonomyExecution(input: {
  workspaceId: string;
  actionType: string;
  contactId?: string;
  conversationId?: string;
  workItemId?: string | null;
  proofId?: string | null;
  capabilityCode?: string | null;
  tacticCode?: string | null;
  idempotencyKey: string;
  request: Record<string, unknown>;
}) {
  const client = prisma as never as UnknownRecord;
  if (!client.autonomyExecution) {
    return { allowed: true as const, record: null };
  }

  try {
    const record = await client.autonomyExecution.create({
      data: {
        workspaceId: input.workspaceId,
        contactId: input.contactId,
        conversationId: input.conversationId,
        workItemId: input.workItemId || null,
        proofId: input.proofId || null,
        capabilityCode: input.capabilityCode || input.actionType,
        tacticCode: input.tacticCode || null,
        idempotencyKey: input.idempotencyKey,
        actionType: input.actionType,
        request: input.request,
        status: 'PENDING',
      },
    });
    return { allowed: true as const, record };
  } catch (err: unknown) {
    if (!isAutonomyExecutionDuplicate(err)) {
      throw err;
    }

    const existing = await client.autonomyExecution.findFirst({
      where: {
        workspaceId: input.workspaceId,
        idempotencyKey: input.idempotencyKey,
      },
    });

    if (existing?.status === 'FAILED') {
      const record = await client.autonomyExecution.update({
        where: { id: existing.id },
        data: {
          request: input.request,
          workItemId: input.workItemId || null,
          proofId: input.proofId || null,
          capabilityCode: input.capabilityCode || input.actionType,
          tacticCode: input.tacticCode || null,
          response: null,
          error: null,
          status: 'PENDING',
        },
      });
      return {
        allowed: true as const,
        record,
        replay: true as const,
      };
    }

    return {
      allowed: false as const,
      record: existing || null,
      reason:
        existing?.status === 'SUCCESS'
          ? 'duplicate_execution_success'
          : 'duplicate_execution_pending',
    };
  }
}

async function finishAutonomyExecution(
  recordId: string | undefined,
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED',
  payload?: {
    response?: Record<string, unknown> | null;
    error?: string | null;
  },
) {
  if (!recordId) {
    return;
  }

  const client = prisma as never as UnknownRecord;
  if (!client.autonomyExecution) {
    return;
  }

  await client.autonomyExecution.update({
    where: { id: recordId },
    data: {
      status,
      response: payload?.response ?? undefined,
      error: payload?.error ?? undefined,
    },
  });
}

async function dispatchAutonomousTextMessage(input: {
  workspaceId: string;
  phone: string;
  chatId?: string;
  message: string;
  idempotencyKey: string;
  quotedMessageId?: string;
}) {
  const result = await dispatchOutboundThroughFlow({
    workspaceId: input.workspaceId,
    to: input.phone,
    chatId: input.chatId,
    message: input.message,
    jobId: buildQueueJobId('autonomy-send', input.idempotencyKey),
    externalId: input.idempotencyKey,
    quotedMessageId: input.quotedMessageId,
  });

  if (result?.error) {
    throw new Error(String(result.reason || 'send_error'));
  }

  return result;
}

function normalizeOutboundMessageForDedupe(content: string): string {
  return String(content || '')
    .normalize('NFKC')
    .replace(WHITESPACE_G_RE, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 500);
}

async function findRecentDuplicateOutbound(params: {
  workspaceId: string;
  contactId?: string | null;
  content: string;
  windowMs?: number;
}) {
  const normalizedTarget = normalizeOutboundMessageForDedupe(params.content);
  if (!normalizedTarget || !params.contactId) {
    return null;
  }

  const recentMessagesRaw = await prisma.message.findMany({
    where: {
      workspaceId: params.workspaceId,
      contactId: params.contactId,
      direction: 'OUTBOUND',
      createdAt: {
        gte: new Date(Date.now() - (params.windowMs || 3 * 60_000)),
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      content: true,
      createdAt: true,
      externalId: true,
    },
  });
  const recentMessages = Array.isArray(recentMessagesRaw) ? recentMessagesRaw : [];

  return (
    recentMessages.find(
      (message) => normalizeOutboundMessageForDedupe(message.content) === normalizedTarget,
    ) || null
  );
}

async function dispatchAutonomousReplyPlan(input: {
  workspaceId: string;
  phone: string;
  chatId?: string;
  message: string;
  idempotencyKey: string;
  quotedMessageId?: string;
  customerMessages?: QuotedCustomerMessage[];
  settings?: UnknownRecord;
  mirrorReplies?: boolean;
}): Promise<Array<{ quotedMessageId?: string; text: string }>> {
  const normalizedCustomerMessages = (input.customerMessages || [])
    .map((message) => ({
      content: String(message.content || '').trim(),
      quotedMessageId: String(message.quotedMessageId || '').trim(),
      createdAt: message.createdAt,
    }))
    .filter((message) => message.content && message.quotedMessageId);

  const replyPlan =
    input.mirrorReplies === true && normalizedCustomerMessages.length > 0
      ? await buildQuotedReplyPlan({
          draftReply: input.message,
          customerMessages: normalizedCustomerMessages,
          settings: input.settings,
        })
      : [
          {
            quotedMessageId: input.quotedMessageId,
            text: input.message,
          },
        ];

  if (!replyPlan.length) {
    replyPlan.push({
      quotedMessageId: input.quotedMessageId,
      text: input.message,
    });
  }

  await forEachSequential(Array.from(replyPlan.entries()), async ([index, reply]) => {
    const effectiveQuotedMessageId = reply.quotedMessageId || input.quotedMessageId;
    await dispatchAutonomousTextMessage({
      workspaceId: input.workspaceId,
      phone: input.phone,
      chatId: input.chatId,
      message: reply.text,
      idempotencyKey: `${input.idempotencyKey}:${index + 1}`,
      quotedMessageId: effectiveQuotedMessageId,
    });
  });

  return replyPlan.map((reply) => ({
    quotedMessageId: reply.quotedMessageId || input.quotedMessageId,
    text: reply.text,
  }));
}

async function buildQuotedReplyPlan(params: {
  draftReply: string;
  customerMessages?: QuotedCustomerMessage[];
  settings?: UnknownRecord;
}): Promise<Array<{ quotedMessageId: string; text: string }>> {
  const normalizedMessages = (params.customerMessages || [])
    .map((message) => ({
      content: String(message.content || '').trim(),
      quotedMessageId: String(message.quotedMessageId || '').trim(),
    }))
    .filter((message) => message.content && message.quotedMessageId);

  if (!normalizedMessages.length) {
    return [];
  }

  const fallback = () => buildMirroredReplyPlanFallback(normalizedMessages, params.draftReply);

  if (normalizedMessages.length === 1) {
    return fallback();
  }

  const apiKey = params.settings?.openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return fallback();
  }

  try {
    const ai = new AIProvider(apiKey);
    const response = await ai.generateChatResponse(
      [
        {
          role: 'system',
          content:
            'Você organiza respostas curtas para WhatsApp. Retorne JSON puro com o formato {"replies":[{"index":1,"text":"..."},...]}. Deve haver exatamente uma resposta por mensagem do cliente, na mesma ordem. Cada resposta deve ser curta, humana e diretamente responsiva.',
        },
        {
          role: 'user',
          content: `Rascunho geral da resposta:\n${params.draftReply}\n\nMensagens do cliente:\n${normalizedMessages
            .map((message, index) => `[${index + 1}] ${message.content}`)
            .join('\n')}`,
        },
      ],
      'writer',
    );
    const raw = String(response?.content || '')
      .replace(JSON_FENCE_RE, '')
      .replace(CODE_FENCE_RE, '')
      .trim();
    // PULSE:OK — inside try/catch; parser confused by multi-line template literal in the arguments above
    const parsed = JSON.parse(raw);
    const replies = Array.isArray(parsed?.replies) ? parsed.replies : [];

    if (replies.length !== normalizedMessages.length) {
      return fallback();
    }

    return normalizedMessages.map((message, index) => ({
      quotedMessageId: message.quotedMessageId,
      text:
        finalizeReplyStyle(message.content, replies[index]?.text || params.draftReply, 0) ||
        params.draftReply,
    }));
  } catch (err: unknown) {
    log.warn('build_reply_variations_error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return fallback();
  }
}

async function decideActionSafe(params: {
  workspaceId?: string;
  contactId?: string;
  phone?: string;
  messageContent: string;
  settings: UnknownRecord;
}): Promise<AutopilotDecision> {
  const { workspaceId, contactId, phone, messageContent, settings } = params;
  const text = (messageContent || '').toLowerCase();

  // Rule-based defaults (no AI required)
  const hasKeyword = (...keys: string[]) => keys.some((k) => text.includes(k));

  if (hasKeyword('preco', 'preço', 'price', 'valor')) {
    // Dispara GhostCloser direto em sinais de preço para maximizar conversão imediata
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

  // If OpenAI key is configured, attempt AI classification (optional)
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

    const systemPrompt = `Você é o Autopilot de vendas. Classifique intenção e ação para WhatsApp.
Retorne JSON com: intent (BUYING|SCHEDULING|SUPPORT|OBJECTION|CHURN_RISK|UPSELL|FOLLOW_UP|IDLE), action (SEND_OFFER|SEND_PRICE|SEND_CALENDAR|HANDLE_OBJECTION|TRANSFER_AGENT|FOLLOW_UP|FOLLOW_UP_STRONG|ANTI_CHURN|QUALIFY|NONE), confidence (0-1), reason.`;

    const userMessage = `Mensagem atual: "${messageContent}"
Historico integral do contato:
${ledger.transcript || 'sem historico'}

Ledger acumulado do contato:
${ledger.factsText}

Resumo persistente do contato:
${compressedContext || 'n/d'}

Contexto da base de conhecimento:
${kbContext || 'n/d'}

Responda somente o JSON.`;

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

export {
  fetchConversationHistory,
  fetchCompressedContactContext,
  getKbContext,
  generatePitchSafe,
  generateAutonomousFallbackResponse,
  computePersistentCognitiveState,
  computeCognitiveRewardSignal,
  buildCognitiveMessage,
  normalizeAutonomyLedgerValue,
  buildAutonomyExecutionKey,
  isAutonomyExecutionDuplicate,
  beginAutonomyExecution,
  finishAutonomyExecution,
  dispatchAutonomousTextMessage,
  normalizeOutboundMessageForDedupe,
  findRecentDuplicateOutbound,
  dispatchAutonomousReplyPlan,
  buildQuotedReplyPlan,
  decideActionSafe,
};
