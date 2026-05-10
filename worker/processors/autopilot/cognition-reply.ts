import {
  log,
  type UnknownRecord,
  type QuotedCustomerMessage,
  JSON_FENCE_RE,
  CODE_FENCE_RE,
  WHITESPACE_G_RE,
  finalizeReplyStyle,
  buildMirroredReplyPlanFallback,
} from './shared';
import { dispatchOutboundThroughFlow } from '../../providers/outbound-dispatcher';
import { buildQueueJobId } from '../../job-id';
import { AIProvider } from '../../providers/ai-provider';
import { forEachSequential } from '../../utils/async-sequence';

export async function dispatchAutonomousTextMessage(input: {
  workspaceId: string;
  phone: string;
  chatId?: string | undefined;
  message: string;
  idempotencyKey: string;
  quotedMessageId?: string | undefined;
}) {
  const result = await dispatchOutboundThroughFlow({
    workspaceId: input.workspaceId, to: input.phone, chatId: input.chatId,
    message: input.message,
    jobId: buildQueueJobId('autonomy-send', input.idempotencyKey),
    externalId: input.idempotencyKey,
    quotedMessageId: input.quotedMessageId,
  });

  if (result?.error) throw new Error(String(result.reason || 'send_error'));
  return result;
}

export function normalizeOutboundMessageForDedupe(content: string): string {
  return String(content || '').normalize('NFKC').replace(WHITESPACE_G_RE, ' ').trim().toLowerCase().slice(0, 500);
}

import { prisma } from '../../db';

export async function findRecentDuplicateOutbound(params: {
  workspaceId: string;
  contactId?: string | null;
  content: string;
  windowMs?: number;
}) {
  const normalizedTarget = normalizeOutboundMessageForDedupe(params.content);
  if (!normalizedTarget || !params.contactId) return null;

  const recentMessagesRaw = await prisma.message.findMany({
    where: {
      workspaceId: params.workspaceId, contactId: params.contactId, direction: 'OUTBOUND',
      createdAt: { gte: new Date(Date.now() - (params.windowMs || 3 * 60_000)) },
    },
    orderBy: { createdAt: 'desc' }, take: 5,
    select: { id: true, content: true, createdAt: true, externalId: true },
  });
  const recentMessages = Array.isArray(recentMessagesRaw) ? recentMessagesRaw : [];

  return recentMessages.find(
    (message) => normalizeOutboundMessageForDedupe(message.content) === normalizedTarget) || null;
}

export async function dispatchAutonomousReplyPlan(input: {
  workspaceId: string;
  phone: string;
  chatId?: string | undefined;
  message: string;
  idempotencyKey: string;
  quotedMessageId?: string | undefined;
  customerMessages?: QuotedCustomerMessage[] | undefined;
  settings?: UnknownRecord | undefined;
  mirrorReplies?: boolean | undefined;
}): Promise<Array<{ quotedMessageId?: string | undefined; text: string }>> {
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
      : [{ quotedMessageId: input.quotedMessageId, text: input.message }];

  if (!replyPlan.length) {
    replyPlan.push({ quotedMessageId: input.quotedMessageId, text: input.message });
  }

  await forEachSequential(Array.from(replyPlan.entries()), async ([index, reply]) => {
    const effectiveQuotedMessageId = reply.quotedMessageId || input.quotedMessageId;
    await dispatchAutonomousTextMessage({
      workspaceId: input.workspaceId, phone: input.phone, chatId: input.chatId,
      message: reply.text, idempotencyKey: `${input.idempotencyKey}:${index + 1}`,
      quotedMessageId: effectiveQuotedMessageId,
    });
  });

  return replyPlan.map((reply) => ({
    quotedMessageId: reply.quotedMessageId || input.quotedMessageId,
    text: reply.text,
  }));
}

export async function buildQuotedReplyPlan(params: {
  draftReply: string;
  customerMessages?: QuotedCustomerMessage[] | undefined;
  settings?: UnknownRecord | undefined;
}): Promise<Array<{ quotedMessageId: string; text: string }>> {
  const normalizedMessages = (params.customerMessages || [])
    .map((message) => ({
      content: String(message.content || '').trim(),
      quotedMessageId: String(message.quotedMessageId || '').trim(),
    }))
    .filter((message) => message.content && message.quotedMessageId);

  if (!normalizedMessages.length) return [];

  const fallback = () => buildMirroredReplyPlanFallback(normalizedMessages, params.draftReply);
  if (normalizedMessages.length === 1) return fallback();

  const apiKey = params.settings?.openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return fallback();

  try {
    const ai = new AIProvider(apiKey);
    const response = await ai.generateChatResponse([
      {
        role: 'system',
        content: 'Você organiza respostas curtas para WhatsApp. Retorne JSON puro com o formato {"replies":[{"index":1,"text":"..."},...]}. Deve haver exatamente uma resposta por mensagem do cliente, na mesma ordem. Cada resposta deve ser curta, humana e diretamente responsiva.',
      },
      {
        role: 'user',
        content: `Rascunho geral da resposta:\n${params.draftReply}\n\nMensagens do cliente:\n${normalizedMessages
          .map((message, index) => `[${index + 1}] ${message.content}`)
          .join('\n')}`,
      },
    ], 'writer');
    const raw = String(response?.content || '').replace(JSON_FENCE_RE, '').replace(CODE_FENCE_RE, '').trim();
    const parsed = JSON.parse(raw);
    const replies = Array.isArray(parsed?.replies) ? parsed.replies : [];

    if (replies.length !== normalizedMessages.length) return fallback();

    return normalizedMessages.map((message, index) => ({
      quotedMessageId: message.quotedMessageId,
      text: finalizeReplyStyle(message.content, replies[index]?.text || params.draftReply, 0) || params.draftReply,
    }));
  } catch (err: unknown) {
    log.warn('build_reply_variations_error', { error: err instanceof Error ? err.message : String(err) });
    return fallback();
  }
}
