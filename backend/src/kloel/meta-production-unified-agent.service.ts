import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import type { ChatCompletionMessageParam } from 'openai/resources/chat';
import OpenAI from 'openai';
import { forEachSequential } from '../common/async-sequence';
import { StorageService } from '../common/storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { AudioService } from './audio.service';
import { chatCompletionWithFallback } from './openai-wrapper';
import { PaymentService } from './payment.service';
import { type ActionEntry, UnifiedAgentService as LegacyUnifiedAgentService } from './unified-agent.service';
import { extractFallbackTopic as extractFallbackTopicValue } from '../whatsapp/whatsapp-normalization.util';
import { WhatsAppProviderRegistry } from '../whatsapp/providers/provider-registry';
import { WhatsappService } from '../whatsapp/whatsapp.service';

type UnknownRecord = Record<string, unknown>;
type LeadChannel = 'whatsapp' | 'instagram' | 'messenger';

const DISCLOSURE_RE =
  /\b(ia|ai|rob[oô]|robo|bot|chatbot|automa[cç][aã]o|humano|pessoa real)\b/i;
const FOLLOW_UP_RE =
  /^(e\b|e o\b|e a\b|ent[aã]o\b|ta\b|t[aá]\b|isso\b|pra eu\b|para eu\b|e quanto\b|e qual\b|e como\b)/i;
const EMOJI_RE = /\p{Extended_Pictographic}/u;
const EMOJI_G_RE = /\p{Extended_Pictographic}/gu;
const SENTENCE_RE = /[^.!?]+[.!?]?/g;
const SPACE_RE = /\s+/g;
const WORD_RE = /\s+/;
const GREETING_RE = /(ol[áa]|bom dia|boa tarde|boa noite|oi\b)/i;
const PRICE_RE = /(pre[cç]o|quanto|valor|custa|boleto|pix|pagamento)/i;
const SCHEDULE_RE = /(agendar|agenda|reuni[aã]o|hor[aá]rio|marcar)/i;
const CANCEL_RE = /(cancel|cancelar|reembolso|desist|encerrar)/i;
const FRICTION_RE =
  /(problema|erro|nao funcion|não funcion|frustr|complicad|dificil|difícil|duvida|dúvida|medo|receio)/i;

type InternalAgentShape = {
  logger: { warn(message: string): void; error(message: string): void };
  openai: OpenAI | null;
  primaryBrainModel: string;
  fallbackBrainModel: string;
  writerModel: string;
  fallbackWriterModel: string;
  tools: unknown[];
  prisma: PrismaService;
  planLimits: {
    ensureTokenBudget(workspaceId: string): Promise<void>;
    trackAiUsage(workspaceId: string, tokens: number): Promise<void>;
  };
  isRecord(value: unknown): value is Record<string, unknown>;
  readRecord(value: unknown): UnknownRecord;
  readText(value: unknown, fallback?: string): string;
  readOptionalText(value: unknown): string | undefined;
  readTagList(value: unknown): string;
  getWorkspaceContext(workspaceId: string): Promise<UnknownRecord>;
  getContactContext(workspaceId: string, contactId: string, phone: string): Promise<unknown>;
  getConversationHistory(
    workspaceId: string,
    contactId: string,
    limit: number,
    phone?: string,
  ): Promise<ChatCompletionMessageParam[]>;
  getProducts(workspaceId: string): Promise<UnknownRecord[]>;
  buildAndPersistCompressedContext(
    workspaceId: string,
    contactId: string,
    phone: string,
    contact: unknown,
  ): Promise<string | undefined>;
  buildSystemPrompt(workspace: UnknownRecord, products: UnknownRecord[], aiConfigs: UnknownRecord[]): string;
  executeToolAction(
    workspaceId: string,
    contactId: string,
    phone: string,
    tool: string,
    args: Record<string, unknown>,
    context?: UnknownRecord,
  ): Promise<unknown>;
  logAutopilotEvent(
    workspaceId: string,
    contactId: string,
    action: string,
    args: Record<string, unknown>,
    result: unknown,
  ): Promise<void>;
  extractIntent(actions: Array<{ tool: string; args: unknown }>, message: string): string;
  calculateConfidence(actions: ActionEntry[], response: OpenAI.Chat.ChatCompletion): number;
  isShortAffirmativeMessage(message: string): boolean;
  isUsableLeadName(name?: string | null): boolean;
};

function normalizeLeadChannel(value: unknown): LeadChannel {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'instagram' || normalized === 'instagram_direct' || normalized === 'ig') return 'instagram';
  if (normalized === 'messenger' || normalized === 'facebook' || normalized === 'facebook_messenger') return 'messenger';
  return 'whatsapp';
}

function buildChannelConversationPolicy(channel: LeadChannel): string {
  if (channel === 'instagram') return 'AJUSTE DE CANAL: Instagram Direct. Responda mais enxuto, leve, social e contextual ao ambiente do anúncio, post, reel ou story.';
  if (channel === 'messenger') return 'AJUSTE DE CANAL: Facebook Messenger. Responda como atendimento oficial da página, com continuidade e clareza.';
  return 'AJUSTE DE CANAL: WhatsApp. Seja direto, prático, caloroso e conversacional.';
}

function buildWriterSystemPrompt(channel: LeadChannel): string {
  const base =
    'Você escreve a resposta final para o cliente. Soe humano, consultivo, vivo e comercial sem parecer script. ' +
    'Primeiro responda o que o cliente quis dizer, depois conduza. ' +
    'Não mencione raciocínio interno. Se perguntarem se é IA ou humano, responda com transparência curta.';
  if (channel === 'instagram') return `${base} Canal atual: Instagram Direct. Menor tolerância a textão.`;
  if (channel === 'messenger') return `${base} Canal atual: Facebook Messenger. Atendimento claro, natural e organizado.`;
  return `${base} Canal atual: WhatsApp. Seja direto, prático e caloroso.`;
}

function countWords(value?: string | null): number {
  return Math.max(1, String(value || '').trim().split(WORD_RE).filter(Boolean).length);
}

function computeReplyBudget(message: string, historyTurns = 0, channel: LeadChannel = 'whatsapp') {
  const words = countWords(message);
  let maxSentences = words <= 8 ? 2 : words <= 20 ? 3 : 4;
  let maxWords = Math.min(140, words <= 4 ? 26 : words <= 12 ? Math.max(24, words + 12) : Math.ceil(words * 1.8));
  if (historyTurns >= 6) { maxSentences += 1; maxWords += 24; }
  if (historyTurns >= 10) { maxSentences += 1; maxWords += 36; }
  if (channel === 'instagram') { maxSentences = Math.max(1, maxSentences - 1); maxWords = Math.min(maxWords, words <= 4 ? 16 : words <= 12 ? 22 : 90); }
  if (channel === 'messenger') { maxSentences = Math.min(6, maxSentences + 1); maxWords = Math.min(220, maxWords + 18); }
  return { words, maxSentences: Math.min(6, maxSentences), maxWords: Math.min(220, maxWords) };
}

function finalizeReply(customerMessage: string, reply?: string | null, historyTurns = 0, channel: LeadChannel = 'whatsapp') {
  const normalized = String(reply || '').replace(SPACE_RE, ' ').trim();
  if (!normalized) return undefined;
  const budget = computeReplyBudget(customerMessage, historyTurns, channel);
  const withoutEmoji = EMOJI_RE.test(customerMessage || '') ? normalized : normalized.replace(EMOJI_G_RE, '').trim();
  const sentences = withoutEmoji.match(SENTENCE_RE)?.map((item) => item.trim()).filter(Boolean) || [withoutEmoji];
  const picked: string[] = [];
  let words = 0;
  for (const sentence of sentences.slice(0, budget.maxSentences)) {
    const sentenceWords = countWords(sentence);
    if (picked.length && words + sentenceWords > budget.maxWords) break;
    picked.push(sentence);
    words += sentenceWords;
  }
  return (picked.join(' ').trim() || withoutEmoji) || undefined;
}

function buildStyleInstruction(message: string, historyTurns = 0, channel: LeadChannel = 'whatsapp') {
  const budget = computeReplyBudget(message, historyTurns, channel);
  const rule = channel === 'instagram'
    ? 'No Instagram, priorize resposta enxuta, rápida e social.'
    : channel === 'messenger'
      ? 'No Messenger, mantenha clareza e continuidade de página.'
      : 'No WhatsApp, seja direto, prático e caloroso.';
  return `Responda com no máximo ${budget.maxSentences} frase(s) e ${budget.maxWords} palavra(s). ${rule}`;
}

@Injectable()
export class MetaProductionUnifiedAgentService extends LegacyUnifiedAgentService {
  constructor(
    prisma: PrismaService,
    config: ConfigService,
    paymentService: PaymentService,
    audioService: AudioService,
    storageService: StorageService,
    @Inject(forwardRef(() => WhatsappService)) whatsappService: WhatsappService,
    providerRegistry: WhatsAppProviderRegistry,
    planLimits: PlanLimitsService,
    auditService: AuditService,
  ) {
    super(prisma, config, paymentService, audioService, storageService, whatsappService, providerRegistry, planLimits, auditService);
  }

  async processMessage(params: {
    workspaceId: string;
    contactId: string;
    phone: string;
    message: string;
    context?: UnknownRecord;
  }): Promise<{ actions: ActionEntry[]; response?: string; intent: string; confidence: number }> {
    const internal = this as unknown as InternalAgentShape;
    const { workspaceId, contactId, phone, message, context } = params;
    const channel = normalizeLeadChannel(context?.channel);

    if (!internal.openai) {
      internal.logger.warn('OpenAI not configured');
      return this.buildChannelFallbackResult(message, channel);
    }

    const [workspace, contact, conversationHistory, products] = await Promise.all([
      internal.getWorkspaceContext(workspaceId),
      internal.getContactContext(workspaceId, contactId, phone),
      internal.getConversationHistory(workspaceId, contactId, 0, phone),
      internal.getProducts(workspaceId),
    ]);

    const productIds = products.map((product) => {
      const value = internal.readRecord(product.value);
      return internal.readOptionalText(value.id) || internal.readOptionalText(product.id);
    }).filter((productId): productId is string => Boolean(productId));

    const aiConfigs = productIds.length > 0
      ? await internal.prisma.productAIConfig.findMany({ take: 50, where: { productId: { in: productIds } }, select: { id: true, productId: true, tone: true, persistenceLevel: true, messageLimit: true, customerProfile: true, positioning: true, objections: true, salesArguments: true } }).catch(() => [])
      : [];

    const contactData = internal.isRecord(contact) ? contact : {};
    const compressedContext = await internal.buildAndPersistCompressedContext(workspaceId, contactId, phone, contact);
    const tacticalHint = this.buildHumanLikeLeadTacticalHint(contactData, message, conversationHistory);
    const systemPrompt = `${internal.buildSystemPrompt(workspace, products, aiConfigs)}\n${buildChannelConversationPolicy(channel)}`;
    const stylePolicy = buildStyleInstruction(message, conversationHistory.length, channel);

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      {
        role: 'user',
        content: `[Contato: ${internal.readText(contactData.name).trim() || phone}]\n[Sentiment: ${internal.readText(contactData.sentiment).trim() || 'NEUTRAL'}]\n[Lead Score: ${internal.readText(contactData.leadScore, '0')}]\n[Tags: ${internal.readTagList(contactData.tags)}]\n[Memória comprimida: ${compressedContext || 'nenhuma'}]\n${context ? `[Contexto adicional: ${JSON.stringify(context)}]\n` : ''}[Instrução tática: ${tacticalHint}]\n[Política de resposta: ${stylePolicy}]\n\nMensagem: ${message}`,
      },
    ];

    let response: OpenAI.Chat.ChatCompletion;
    try {
      await internal.planLimits.ensureTokenBudget(workspaceId);
      response = await chatCompletionWithFallback(internal.openai, { model: internal.primaryBrainModel, messages, tools: internal.tools as never, tool_choice: 'auto', temperature: 0.82, top_p: 0.9 }, internal.fallbackBrainModel);
    } catch (error: unknown) {
      internal.logger.error(`OpenAI agent processing failed, using fallback: ${error instanceof Error ? error.message : 'unknown error'}`);
      return this.buildChannelFallbackResult(message, channel);
    }

    await internal.planLimits.trackAiUsage(workspaceId, response?.usage?.total_tokens ?? 500).catch(() => {});
    const assistantMessage = response.choices[0].message;
    const actions: ActionEntry[] = [];

    if (assistantMessage.tool_calls?.length) {
      await forEachSequential(assistantMessage.tool_calls, async (toolCall) => {
        if (toolCall.type !== 'function') return;
        const toolArgs = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>;
        const result = await internal.executeToolAction(workspaceId, contactId, phone, toolCall.function.name, toolArgs, context);
        actions.push({ tool: toolCall.function.name, args: toolArgs, result });
        await internal.logAutopilotEvent(workspaceId, contactId, toolCall.function.name, toolArgs, result);
      });
    }

    const draftedReply = await this.composeHumanLikeWriterReply(channel, {
      workspaceId,
      customerMessage: message,
      assistantDraft: assistantMessage.content,
      actions,
      historyTurns: conversationHistory.length,
      conversationSummary: compressedContext,
      tacticalHint,
    });

    return { actions, response: draftedReply, intent: internal.extractIntent(actions, message), confidence: internal.calculateConfidence(actions, response) };
  }

  private buildChannelFallbackResult(message: string, channel: LeadChannel) {
    const normalized = String(message || '').toLowerCase();
    const topic = extractFallbackTopicValue(message);
    if (PRICE_RE.test(normalized)) return { actions: [], response: finalizeReply(message, topic ? `Boa, você foi direto ao ponto. Posso confirmar preço, pagamento e disponibilidade de ${topic}. Quer que eu siga por aí?` : 'Boa, sem rodeio fica melhor. Posso confirmar preço, pagamento e disponibilidade. Me diz o produto ou procedimento.', 0, channel), intent: 'BUYING_INTENT', confidence: 0.45 };
    if (SCHEDULE_RE.test(normalized)) return { actions: [], response: finalizeReply(message, 'Perfeito, me diz o dia ou horário e eu organizo isso com você.', 0, channel), intent: 'SCHEDULING', confidence: 0.4 };
    if (CANCEL_RE.test(normalized)) return { actions: [], response: finalizeReply(message, 'Entendi. Me diz o que aconteceu para eu te ajudar nisso agora.', 0, channel), intent: 'CHURN_RISK', confidence: 0.4 };
    if (GREETING_RE.test(normalized)) return { actions: [], response: finalizeReply(message, 'Oi. Como posso te ajudar?', 0, channel), intent: 'GREETING', confidence: 0.35 };
    return { actions: [], response: finalizeReply(message, topic ? `Entendi. Você falou de ${topic}. Me diz o que quer confirmar e eu te respondo sem enrolação.` : 'Entendi. Me diz o produto, exame ou objetivo e eu sigo com a informação certa, sem teatro.', 0, channel), intent: 'UNKNOWN', confidence: 0.2 };
  }

  private buildHumanLikeLeadTacticalHint(contactData: UnknownRecord, message: string, history: ChatCompletionMessageParam[]) {
    const internal = this as unknown as InternalAgentShape;
    const hints: string[] = [];
    const leadName = internal.readText(contactData.name).trim();
    const disclosure = DISCLOSURE_RE.test(message) && (message.includes('?') || message.toLowerCase().includes('falando com'));
    const followUp = FOLLOW_UP_RE.test(message.trim().toLowerCase());
    if (internal.readOptionalText(contactData.aiSummary)) hints.push(`Resumo comercial salvo: "${internal.readOptionalText(contactData.aiSummary)}".`);
    if (internal.readOptionalText(contactData.nextBestAction)) hints.push(`Próxima melhor ação recomendada: "${internal.readOptionalText(contactData.nextBestAction)}".`);
    if (disclosure) hints.push('O cliente perguntou se está falando com IA ou humano. Responda isso primeiro com transparência curta e segura.');
    if (leadName && internal.isUsableLeadName(leadName) && !disclosure) hints.push(`O nome visível do lead é "${leadName}". Use esse nome com naturalidade. Só confirme o nome se a conversa estiver no começo e o cliente não tiver feito uma pergunta concreta.`);
    if (followUp) hints.push('O cliente está retomando um assunto já aberto. Cite explicitamente o assunto ativo antes de responder.');
    if (internal.isShortAffirmativeMessage(message)) hints.push('O lead respondeu com um aceite curto. Entregue valor concreto imediatamente e avance uma etapa.');
    if (FRICTION_RE.test(message)) hints.push('O lead demonstrou atrito emocional. Valide isso em uma frase curta antes de conduzir.');
    const lastAssistant = [...history].reverse().find((entry) => entry.role === 'assistant');
    if (typeof lastAssistant?.content === 'string') hints.push(`Sua última mensagem para o lead foi: "${internal.readText(lastAssistant.content).slice(0, 220)}". Continue sem repetir saudação.`);
    hints.push('Responda primeiro ao que o cliente perguntou e só depois conduza o próximo passo.');
    return hints.join(' ');
  }

  private async composeHumanLikeWriterReply(
    channel: LeadChannel,
    params: {
      workspaceId: string;
      customerMessage: string;
      assistantDraft?: string | null;
      actions: ActionEntry[];
      historyTurns: number;
      conversationSummary?: string;
      tacticalHint?: string;
    },
  ) {
    const internal = this as unknown as InternalAgentShape;
    const fallback = finalizeReply(params.customerMessage, params.assistantDraft, params.historyTurns, channel);
    if (!internal.openai) return fallback;
    const compactActions = params.actions.map((action) => ({ tool: action.tool, args: action.args, result: typeof action.result === 'string' ? action.result.slice(0, 280) : action.result }));
    try {
      await internal.planLimits.ensureTokenBudget(params.workspaceId);
      const writerResponse = await chatCompletionWithFallback(internal.openai, {
        model: internal.writerModel,
        messages: [
          { role: 'system', content: buildWriterSystemPrompt(channel) },
          { role: 'user', content: [`Mensagem do cliente: ${params.customerMessage}`, `Rascunho do cérebro: ${params.assistantDraft || 'sem rascunho'}`, `Ações executadas: ${JSON.stringify(compactActions)}`, `Resumo de contexto: ${params.conversationSummary || 'nenhum'}`, `Instrução tática: ${params.tacticalHint || 'responda primeiro ao que o cliente perguntou e só depois conduza.'}`, buildStyleInstruction(params.customerMessage, params.historyTurns, channel), 'Escreva apenas a mensagem final pronta para enviar.'].join('\n\n') },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }, internal.fallbackWriterModel);
      await internal.planLimits.trackAiUsage(params.workspaceId, writerResponse?.usage?.total_tokens ?? 500).catch(() => {});
      return finalizeReply(params.customerMessage, writerResponse.choices[0]?.message?.content || params.assistantDraft, params.historyTurns, channel);
    } catch {
      return fallback;
    }
  }
}
