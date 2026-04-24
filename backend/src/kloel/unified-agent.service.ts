import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../common/storage/storage.service';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppProviderRegistry } from '../whatsapp/providers/provider-registry';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { AudioService } from './audio.service';
import { PaymentService } from './payment.service';
import { chatCompletionWithFallback } from './openai-wrapper';
import { forEachSequential } from '../common/async-sequence';
import { UNIFIED_AGENT_TOOLS } from './unified-agent-tools-def';
import { UnifiedAgentContextService } from './unified-agent-context.service';
import { UnifiedAgentResponseService } from './unified-agent-response.service';
import { UnifiedAgentActionsService } from './unified-agent-actions.service';

type UnknownRecord = Record<string, unknown>;

/** ToolArgs shape used by all action methods. */
export interface ToolArgs {
  active?: boolean;
  amount?: number;
  audioBase64?: string;
  audioUrl?: string;
  autoActivate?: boolean;
  autoReplyEnabled?: boolean;
  autoReplyMessage?: string;
  businessHours?: Prisma.InputJsonValue;
  businessName?: string;
  campaignId?: string;
  caption?: string;
  category?: string;
  code?: string;
  csvData?: string;
  daysSilent?: number;
  delayHours?: number;
  description?: string;
  discountPercent?: number;
  documentName?: string;
  enabled?: boolean;
  event?: string;
  expiresIn?: string;
  flowId?: string;
  flowName?: string;
  funnelName?: string;
  imageUrl?: string;
  includeConnections?: boolean;
  includeHealth?: boolean;
  includeFollowUps?: boolean;
  includeLink?: boolean;
  includeMetrics?: boolean;
  includePrice?: boolean;
  intent?: string;
  language?: string;
  message?: string;
  metric?: string;
  mode?: string;
  name?: string;
  objective?: string;
  objectionType?: string;
  offer?: string;
  paymentLink?: string;
  period?: string;
  personality?: string;
  plan?: string;
  price?: number;
  priority?: string;
  productId?: string;
  productName?: string;
  properties?: Prisma.InputJsonValue;
  query?: string;
  questions?: string[];
  reason?: string;
  returnUrl?: string;
  scheduleAt?: string;
  source?: string;
  stage?: string;
  status?: string;
  stages?: string[];
  steps?: Prisma.InputJsonValue[];
  strategy?: string;
  suggestedTimes?: string[];
  tag?: string;
  targetTags?: string[];
  technique?: string;
  text?: string;
  tone?: string;
  trigger?: string;
  triggerValue?: string;
  type?: string;
  url?: string;
  useEmojis?: boolean;
  variables?: Prisma.InputJsonValue;
  voice?: string;
  workingHoursOnly?: boolean;
}

/** Action entry shape. */
export interface ActionEntry {
  /** Tool property. */
  tool: string;
  /** Args property. */
  args: ToolArgs;
  /** Result property. */
  result?: unknown;
}

/**
 * KLOEL Unified Agent Service — orchestrator.
 *
 * This service coordinates context loading, LLM calls, tool dispatch, and
 * response composition. All heavy logic lives in the sub-services injected
 * here. The constructor, processMessage, and executeToolAction router are the
 * only concerns of this file.
 */
@Injectable()
export class UnifiedAgentService {
  private readonly logger = new Logger(UnifiedAgentService.name);
  private readonly openai: OpenAI | null;
  private readonly primaryBrainModel: string;
  private readonly fallbackBrainModel: string;
  private readonly writerModel: string;
  private readonly fallbackWriterModel: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly paymentService: PaymentService,
    private readonly audioService: AudioService,
    private readonly storageService: StorageService,
    @Inject(forwardRef(() => WhatsappService))
    private readonly whatsappService: WhatsappService,
    private readonly providerRegistry: WhatsAppProviderRegistry,
    private readonly planLimits: PlanLimitsService,
    private readonly auditService: AuditService,
    private readonly ctx: UnifiedAgentContextService,
    private readonly response: UnifiedAgentResponseService,
    private readonly actions: UnifiedAgentActionsService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
    this.primaryBrainModel = resolveBackendOpenAIModel('brain', this.config);
    this.fallbackBrainModel = resolveBackendOpenAIModel('brain_fallback', this.config);
    this.writerModel = resolveBackendOpenAIModel('writer', this.config);
    this.fallbackWriterModel = resolveBackendOpenAIModel('writer_fallback', this.config);
  }

  /**
   * API simplificada para processar mensagem inbound (WhatsApp/omnichannel).
   */
  async processIncomingMessage(params: {
    workspaceId: string;
    phone: string;
    message: string;
    contactId?: string;
    channel?: string;
    context?: UnknownRecord;
  }): Promise<{
    reply?: string;
    response?: string;
    actions: ActionEntry[];
    intent: string;
    confidence: number;
  }> {
    const result = await this.processMessage({
      workspaceId: params.workspaceId,
      contactId: params.contactId || '',
      phone: params.phone,
      message: params.message,
      context: {
        channel: params.channel || 'whatsapp',
        ...(params.context || {}),
      },
    });

    return { ...result, reply: result.response };
  }

  /**
   * Processa uma mensagem recebida e decide as ações a tomar.
   */
  async processMessage(params: {
    workspaceId: string;
    contactId: string;
    phone: string;
    message: string;
    context?: UnknownRecord;
  }): Promise<{
    actions: ActionEntry[];
    response?: string;
    intent: string;
    confidence: number;
  }> {
    const { workspaceId, contactId, phone, message, context } = params;

    if (!this.openai) {
      this.logger.warn('OpenAI not configured');
      return this.response.buildFallbackResult(message);
    }

    // 1. Load workspace / contact / history / products in parallel
    const [workspace, contact, conversationHistory, products] = await Promise.all([
      this.ctx.getWorkspaceContext(workspaceId),
      this.ctx.getContactContext(workspaceId, contactId, phone),
      this.ctx.getConversationHistory(workspaceId, contactId, 0, phone),
      this.ctx.getProducts(workspaceId),
    ]);

    // 1b. Load AI config per product (commercial brain)
    const productIds = products
      .map((product: UnknownRecord) => {
        const productValue = this.ctx.readRecord(product.value);
        return this.ctx.readOptionalText(productValue.id) || this.ctx.readOptionalText(product.id);
      })
      .filter((productId): productId is string => Boolean(productId));
    let aiConfigs: UnknownRecord[] = [];
    if (productIds.length > 0) {
      try {
        aiConfigs = await this.prisma.productAIConfig.findMany({
          take: 50,
          where: { productId: { in: productIds } },
          select: {
            id: true,
            productId: true,
            tone: true,
            persistenceLevel: true,
            messageLimit: true,
            customerProfile: true,
            positioning: true,
            objections: true,
            salesArguments: true,
          },
        });
      } catch {
        /* ProductAIConfig may not exist yet */
      }
    }

    const compressedContext = await this.ctx.buildAndPersistCompressedContext(
      workspaceId,
      contactId,
      phone,
      contact,
    );
    const tacticalHint = this.ctx.buildLeadTacticalHint({
      leadName: this.ctx.isRecord(contact) ? this.ctx.readText(contact.name).trim() : '',
      currentMessage: message,
      conversationHistory,
    });

    // 2. Build system prompt and style instruction
    const systemPrompt = this.ctx.buildSystemPrompt(workspace, products, aiConfigs);
    const stylePolicy = this.response.buildReplyStyleInstruction(
      message,
      conversationHistory.length,
    );

    const contactData: Record<string, unknown> = this.ctx.isRecord(contact) ? contact : {};
    const contactName = this.ctx.readText(contactData.name).trim() || phone;
    const contactSentiment = this.ctx.readText(contactData.sentiment).trim() || 'NEUTRAL';
    const leadScore = this.ctx.readText(contactData.leadScore, '0');
    const tagNames = this.ctx.readTagList(contactData.tags);

    // 3. Build messages array
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      {
        role: 'user',
        content: `[Contato: ${contactName}]
[Sentiment: ${contactSentiment}]
[Lead Score: ${leadScore}]
[Tags: ${tagNames}]
[Memória comprimida: ${compressedContext || 'nenhuma'}]
${context ? `[Contexto adicional: ${JSON.stringify(context)}]` : ''}
[Instrução tática: ${tacticalHint || 'responder com clareza, valor concreto e próximo passo.'}]
[Política de resposta: ${stylePolicy}]

Mensagem: ${message}`,
      },
    ];

    // 4. Call OpenAI with tools
    let llmResponse: OpenAI.Chat.ChatCompletion;
    try {
      await this.planLimits.ensureTokenBudget(params.workspaceId);
      llmResponse = await chatCompletionWithFallback(
        this.openai,
        {
          model: this.primaryBrainModel,
          messages,
          tools: UNIFIED_AGENT_TOOLS,
          tool_choice: 'auto',
          temperature: 0.82,
          top_p: 0.9,
        },
        this.fallbackBrainModel,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : 'unknown';
      this.logger.error(`OpenAI agent processing failed, using fallback: ${msg}`);
      return this.response.buildFallbackResult(message);
    }
    await this.planLimits
      .trackAiUsage(params.workspaceId, llmResponse?.usage?.total_tokens ?? 500)
      .catch(() => {});

    const assistantMessage = llmResponse.choices[0].message;
    const actionsList: ActionEntry[] = [];

    // 5. Process tool calls
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      await forEachSequential(assistantMessage.tool_calls, async (toolCall) => {
        if (toolCall.type !== 'function') return;
        const toolName = toolCall.function.name;
        let toolArgs: Record<string, unknown> = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments || '{}');
        } catch {
          this.logger.warn(`Failed to parse tool args for ${toolName}`);
        }
        const result = await this.executeToolAction(
          workspaceId,
          contactId,
          phone,
          toolName,
          toolArgs,
          context,
        );
        actionsList.push({ tool: toolName, args: toolArgs, result });
        await this.actions.logAutopilotEvent(workspaceId, contactId, toolName, toolArgs, result);
      });
    }

    // 6. Extract intent, confidence, and compose final reply
    const intent = this.response.extractIntent(actionsList, message);
    const confidence = this.response.calculateConfidence(actionsList, llmResponse);
    const draftedReply = await this.response.composeWriterReply(
      this.openai,
      this.writerModel,
      this.fallbackWriterModel,
      {
        workspaceId,
        customerMessage: message,
        assistantDraft: assistantMessage.content,
        actions: actionsList,
        historyTurns: conversationHistory.length,
      },
    );

    return { actions: actionsList, response: draftedReply, intent, confidence };
  }

  /**
   * Public API: execute a single named tool directly.
   */
  async executeTool(
    tool: string,
    args: ToolArgs,
    ctx: { workspaceId: string; contactId?: string; phone?: string },
  ): Promise<unknown> {
    return this.executeToolAction(
      ctx.workspaceId,
      ctx.contactId || '',
      ctx.phone || '',
      tool,
      args,
    );
  }

  /** Build quoted reply plan (delegates to response service). */
  async buildQuotedReplyPlan(params: {
    workspaceId: string;
    contactId?: string;
    phone: string;
    draftReply: string;
    customerMessages: Array<{ content: string; quotedMessageId: string }>;
  }): Promise<Array<{ quotedMessageId: string; text: string }>> {
    return this.response.buildQuotedReplyPlan(
      this.openai,
      this.writerModel,
      this.fallbackWriterModel,
      this.planLimits,
      params,
    );
  }

  // ───────── tool router ─────────

  private async executeToolAction(
    workspaceId: string,
    contactId: string,
    phone: string,
    tool: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ): Promise<unknown> {
    this.logger.log(`Executing tool: ${tool}`, { args });

    switch (tool) {
      case 'send_message':
        return this.actions.actionSendMessage(workspaceId, phone, args, context);
      case 'send_product_info':
        return this.actions.actionSendProductInfo(workspaceId, phone, args, context);
      case 'create_payment_link': {
        const result = await this.actions.actionCreatePaymentLink(
          workspaceId,
          phone,
          args,
          context,
        );
        try {
          await this.prisma.$transaction(async (tx) => {
            await this.auditService.logWithTx(tx, {
              workspaceId,
              action: 'AGENT_DISPATCHED_PAYMENT_LINK',
              resource: 'UnifiedAgent',
              resourceId: contactId,
              details: { tool, phone },
            });
          });
        } catch (auditError: unknown) {
          const auditMsg =
            auditError instanceof Error
              ? auditError.message
              : typeof auditError === 'string'
                ? auditError
                : 'unknown';
          this.logger.warn(`Audit dispatch log failed: ${auditMsg}`);
        }
        return result;
      }
      case 'update_lead_status':
        return this.actions.actionUpdateLeadStatus(workspaceId, contactId, args);
      case 'add_tag':
        return this.actions.actionAddTag(workspaceId, contactId, args);
      case 'schedule_followup':
        return this.actions.actionScheduleFollowup(workspaceId, contactId, phone, args);
      case 'transfer_to_human':
        return this.actions.actionTransferToHuman(workspaceId, contactId, args);
      case 'search_knowledge_base':
        return this.actions.actionSearchKnowledgeBase(workspaceId, args);
      case 'trigger_flow':
        return this.actions.actionTriggerFlow(workspaceId, phone, args);
      case 'log_event':
        return this.actions.actionLogEvent(workspaceId, contactId, args);
      case 'send_media':
        return this.actions.actionSendMedia(workspaceId, phone, args, context);
      case 'send_document':
        return this.actions.actionSendDocument(workspaceId, phone, args, context);
      case 'send_voice_note':
        return this.actions.actionSendVoiceNote(workspaceId, phone, args, context);
      case 'send_audio':
        return this.actions.actionSendAudio(workspaceId, phone, args, context);
      case 'transcribe_audio':
        return this.actions.actionTranscribeAudio(workspaceId, args);
      case 'create_product':
        return this.actions.actionCreateProduct(workspaceId, args);
      case 'update_product':
        return this.actions.actionUpdateProduct(workspaceId, args);
      case 'get_product_plans':
        return this.actions.getProductPlans(this.actions.str(args.productId));
      case 'get_product_ai_config':
        return this.actions.getProductAIConfig(this.actions.str(args.productId));
      case 'get_product_reviews':
        return this.actions.getProductReviews(this.actions.str(args.productId));
      case 'get_product_urls':
        return this.actions.getProductUrls(this.actions.str(args.productId));
      case 'validate_coupon':
        return this.actions.validateCoupon(
          this.actions.str(args.productId),
          this.actions.str(args.code),
        );
      case 'create_flow':
        return this.actions.actionCreateFlow(workspaceId, args);
      case 'update_workspace_settings':
        return this.actions.actionUpdateWorkspaceSettings(workspaceId, args);
      case 'create_broadcast':
        return this.actions.actionCreateBroadcast(workspaceId, args);
      case 'get_analytics':
        return this.actions.actionGetAnalytics(workspaceId, args);
      case 'configure_ai_persona':
        return this.actions.actionConfigureAIPersona(workspaceId, args);
      case 'toggle_autopilot':
        return this.actions.actionToggleAutopilot(workspaceId, args);
      case 'create_flow_from_description':
        return this.actions.actionCreateFlowFromDescription(
          workspaceId,
          args,
          this.openai,
          this.primaryBrainModel,
          this.fallbackBrainModel,
        );
      case 'connect_whatsapp':
        return this.actions.actionConnectWhatsApp(workspaceId, args);
      case 'import_contacts':
        return this.actions.actionImportContacts(workspaceId, args);
      case 'generate_sales_funnel':
        return this.actions.actionGenerateSalesFunnel(workspaceId, args);
      case 'schedule_campaign':
        return this.actions.actionScheduleCampaign(workspaceId, args);
      case 'get_workspace_status':
        return this.actions.actionGetWorkspaceStatus(workspaceId, args);
      case 'update_billing_info':
        return this.actions.actionUpdateBillingInfo(workspaceId, args);
      case 'get_billing_status':
        return this.actions.actionGetBillingStatus(workspaceId);
      case 'change_plan':
        return this.actions.actionChangePlan(workspaceId, args);
      case 'apply_discount':
        return this.actions.actionApplyDiscount(workspaceId, contactId, phone, args, context);
      case 'handle_objection':
        return this.actions.actionHandleObjection(workspaceId, contactId, phone, args, context);
      case 'qualify_lead':
        return this.actions.actionQualifyLead(workspaceId, contactId, phone, args, context);
      case 'schedule_meeting':
        return this.actions.actionScheduleMeeting(workspaceId, contactId, phone, args, context);
      case 'anti_churn_action':
        return this.actions.actionAntiChurn(workspaceId, contactId, phone, args, context);
      case 'reactivate_ghost':
        return this.actions.actionReactivateGhost(workspaceId, contactId, phone, args, context);
      default:
        this.logger.warn(`Unknown tool: ${tool}`);
        return { success: false, error: 'Unknown tool' };
    }
  }
}
