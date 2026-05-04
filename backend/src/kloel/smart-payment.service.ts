import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';
import OpenAI from 'openai';
import { AuditService } from '../audit/audit.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentService } from './payment.service';
import { chatCompletionWithRetry } from './openai-wrapper';

const JSON_N___N_RE = /```json\n?|\n?```/g;
const BRL_DISPLAY_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function formatBrlAmount(amount: number): string {
  const normalized = Number.isFinite(amount) ? amount : 0;
  return BRL_DISPLAY_FORMATTER.format(normalized);
}

function normalizeAmountKey(amount: number): string {
  const normalized = Number.isFinite(amount) ? amount : 0;
  return (Math.round(normalized * 100) / 100).toString();
}

function truncateConversationHistory(conversation?: string): string {
  return String(conversation || '').slice(-500);
}

function buildSmartPaymentAiPrompt(params: {
  customerName: string;
  productName?: string;
  amount: number;
  conversation?: string;
}): string {
  return [
    'Você é um assistente de vendas. Gere uma mensagem WhatsApp curta e persuasiva para enviar um link de pagamento.',
    '',
    'Contexto:',
    `- Cliente: ${params.customerName}`,
    `- Produto: ${params.productName || 'Produto/Serviço'}`,
    `- Valor: ${formatBrlAmount(params.amount)}`,
    `- Histórico da conversa: ${truncateConversationHistory(params.conversation)}`,
    '',
    'Responda em JSON:',
    '{',
    '  "message": "Mensagem WhatsApp (max 200 chars)",',
    '  "paymentMethod": "PIX|BOLETO|CREDIT_CARD",',
    '  "urgencyLevel": "low|medium|high"',
    '}',
  ].join('\n');
}

function buildNegotiationAiPrompt(params: {
  customerName?: string | null;
  leadScore?: number | null;
  purchaseProbability?: string | null;
  maxDiscount: number;
  minPurchaseForDiscount: number;
  originalAmount: number;
  customerMessage: string;
}): string {
  return [
    'Você é um gerente de vendas decidindo sobre um pedido de desconto.',
    '',
    'Contexto do cliente:',
    `- Nome: ${params.customerName || 'Desconhecido'}`,
    `- Lead Score: ${params.leadScore || 0}/100`,
    `- Probabilidade de compra: ${params.purchaseProbability || 'UNKNOWN'}`,
    '',
    'Regras de desconto:',
    `- Desconto máximo permitido: ${params.maxDiscount}%`,
    `- Valor mínimo para desconto: ${formatBrlAmount(params.minPurchaseForDiscount)}`,
    '',
    `Valor original: ${formatBrlAmount(params.originalAmount)}`,
    `Mensagem do cliente: "${params.customerMessage}"`,
    '',
    'Analise e responda em JSON:',
    '{',
    '  "approved": true/false,',
    `  "discountPercent": número (0 a ${params.maxDiscount}),`,
    '  "reason": "explicação curta",',
    '  "installments": número ou null,',
    '  "counterOffer": "mensagem de contra-oferta se não aprovado"',
    '}',
  ].join('\n');
}

function buildPixReadyMessage(customerName: string, amount: number): string {
  return [
    `${customerName}, seu pagamento PIX de ${formatBrlAmount(amount)} está pronto.`,
    '',
    'Use o QR Code ou copie o código PIX abaixo.',
  ].join('\n');
}

function buildConfirmedPaymentMessage(amount: number): string {
  return [
    `Pagamento de ${formatBrlAmount(amount)} confirmado. Obrigado pela compra.`,
    '',
    'Seu acesso e os próximos passos seguem pelo canal cadastrado.',
  ].join('\n');
}

function buildSmartPaymentIdempotencyKey(context: PaymentContext): string {
  return [
    'smart-payment',
    context.workspaceId,
    context.contactId || context.phone,
    normalizeAmountKey(context.amount),
    context.productName || 'Pagamento KLOEL',
  ].join(':');
}

interface PaymentContext {
  workspaceId: string;
  contactId?: string;
  phone: string;
  customerName: string;
  productName?: string;
  amount: number;
  conversation?: string;
}

interface SmartPaymentResult {
  paymentId: string;
  paymentUrl: string;
  pixQrCode?: string;
  pixCopyPaste?: string;
  billingType: 'PIX' | 'BOLETO' | 'CREDIT_CARD';
  suggestedMessage: string;
  discountApplied?: number;
  installments?: number;
}

interface PaymentNegotiation {
  originalAmount: number;
  negotiatedAmount: number;
  discountPercent: number;
  reason: string;
  installments?: number;
  approved: boolean;
}

/** Smart payment service. */
@Injectable()
export class SmartPaymentService {
  private readonly logger = new Logger(SmartPaymentService.name);
  private openai: OpenAI;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly paymentService: PaymentService,
    private readonly auditService: AuditService,
    private readonly planLimits: PlanLimitsService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
  }

  /**
   * Cria pagamento inteligente baseado no contexto da conversa.
   * A IA sugere o melhor método de pagamento e mensagem personalizada.
   */
  async createSmartPayment(context: PaymentContext): Promise<SmartPaymentResult> {
    const { workspaceId, phone, customerName, amount, productName, conversation } = context;

    // 1. Se temos a conversa, usar IA para gerar mensagem personalizada
    let suggestedMessage = '';

    if (this.openai && conversation) {
      try {
        await this.planLimits.ensureTokenBudget(workspaceId);
        const aiResponse = await chatCompletionWithRetry(this.openai, {
          model: resolveBackendOpenAIModel('writer'),
          messages: [
            {
              role: 'system',
              content: buildSmartPaymentAiPrompt({
                customerName,
                productName,
                amount,
                conversation,
              }),
            },
          ],
          temperature: 0.7,
        });

        const parsed = JSON.parse(
          aiResponse.choices[0].message.content?.replace(JSON_N___N_RE, '') || '{}',
        );
        suggestedMessage = parsed.message || '';
        await this.planLimits
          .trackAiUsage(workspaceId, aiResponse?.usage?.total_tokens ?? 500)
          .catch(() => {});
        // PULSE:OK — AI message is optional enrichment; static fallback message is used when AI fails
      } catch (err: unknown) {
        this.logger.warn(
          'AI message generation failed',
          err instanceof Error ? err.message : String(err),
        );
        Sentry.captureException(err, {
          tags: { type: 'ai_alert', operation: 'smart_payment_message' },
          extra: { workspaceId, contactId: context.contactId, amount },
          level: 'warning',
        });
      }
    }

    // 2. O stack ativo do Kloel gera links Pix via Stripe.
    try {
      const payment = await this.paymentService.createPayment({
        workspaceId,
        leadId: context.contactId || phone,
        customerName,
        customerPhone: phone,
        amount,
        description: productName || 'Pagamento KLOEL',
        idempotencyKey: buildSmartPaymentIdempotencyKey(context),
      });

      return {
        paymentId: payment.id,
        paymentUrl: payment.paymentLink || payment.invoiceUrl || '',
        pixQrCode: payment.pixQrCodeUrl,
        pixCopyPaste: payment.pixCopyPaste,
        billingType: 'PIX',
        suggestedMessage: suggestedMessage || buildPixReadyMessage(customerName, amount),
      };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? (err instanceof Error ? err.message : String(err)) : String(err);
      this.logger.error(`Stripe payment failed: ${message}`);
      Sentry.captureException(err, {
        tags: { type: 'financial_alert', operation: 'smart_payment_create' },
        extra: { workspaceId, contactId: context.contactId, amount },
        level: 'fatal',
      });
      throw err;
    }
  }

  /**
   * Negocia preço usando IA baseado no contexto do cliente.
   * Considera histórico, lead score e regras de negócio.
   */
  async negotiatePayment(params: {
    workspaceId: string;
    contactId: string;
    originalAmount: number;
    customerMessage: string;
    maxDiscountPercent?: number;
  }): Promise<PaymentNegotiation> {
    const {
      workspaceId,
      contactId,
      originalAmount,
      customerMessage,
      maxDiscountPercent = 15,
    } = params;

    // 1. Buscar contexto do cliente
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, workspaceId },
      select: {
        name: true,
        leadScore: true,
        purchaseProbability: true,
        customFields: true,
      },
    });

    // 2. Regras de desconto: hardcoded defaults. A versão anterior tentava
    //    ler `kloelConfig.findFirst` via cast dinâmico, mas esse model não
    //    existe no schema Prisma — o bloco sempre caía no fallback abaixo.
    //    Quando o model for criado, reintroduza a leitura tipada normal.
    const rules = {
      maxDiscount: maxDiscountPercent,
      minPurchaseForDiscount: 100,
      loyaltyBonusPercent: 5,
    };

    // 3. Se não temos OpenAI, usar regras simples
    if (!this.openai) {
      const isHighValue = contact?.leadScore >= 70;
      const discountPercent = isHighValue
        ? Math.min(10, rules.maxDiscount)
        : Math.min(5, rules.maxDiscount);

      const negotiatedAmount = originalAmount * (1 - discountPercent / 100);

      return {
        originalAmount,
        negotiatedAmount,
        discountPercent,
        reason: isHighValue ? 'Cliente VIP' : 'Desconto padrão',
        approved: true,
      };
    }

    // 4. Usar IA para decidir negociação
    try {
      await this.planLimits.ensureTokenBudget(workspaceId);
      const response = await chatCompletionWithRetry(this.openai, {
        model: resolveBackendOpenAIModel('brain'),
        messages: [
          {
            role: 'system',
            content: buildNegotiationAiPrompt({
              customerName: contact?.name,
              leadScore: contact?.leadScore,
              purchaseProbability: contact?.purchaseProbability,
              maxDiscount: rules.maxDiscount,
              minPurchaseForDiscount: rules.minPurchaseForDiscount,
              originalAmount,
              customerMessage,
            }),
          },
        ],
        temperature: 0.5,
      });

      const parsed = JSON.parse(
        response.choices[0].message.content?.replace(JSON_N___N_RE, '') || '{}',
      );

      await this.planLimits
        .trackAiUsage(workspaceId, response?.usage?.total_tokens ?? 500)
        .catch(() => {});

      const discountPercent = Math.min(parsed.discountPercent || 0, rules.maxDiscount);
      const negotiatedAmount = originalAmount * (1 - discountPercent / 100);

      return {
        originalAmount,
        negotiatedAmount,
        discountPercent,
        reason: parsed.reason || 'Análise automática',
        installments: parsed.installments,
        approved: parsed.approved !== false,
      };
      // PULSE:OK — AI negotiation is an optional enrichment layer; static 5% fallback discount is the safe default when AI is unavailable
    } catch (err: unknown) {
      this.logger.error('AI negotiation failed', err instanceof Error ? err.message : String(err));
      Sentry.captureException(err, {
        tags: { type: 'ai_alert', operation: 'smart_payment_negotiation' },
        extra: { workspaceId, contactId, originalAmount },
        level: 'warning',
      });

      // Fallback: aprovar pequeno desconto
      return {
        originalAmount,
        negotiatedAmount: originalAmount * 0.95,
        discountPercent: 5,
        reason: 'Desconto padrão',
        approved: true,
      };
    }
  }

  /**
   * Analisa situação de pagamento pendente e sugere ação.
   */
  analyzePaymentRecovery(params: { workspaceId: string; paymentId: string; daysPending: number }): {
    action: 'SEND_REMINDER' | 'OFFER_DISCOUNT' | 'CALL_CUSTOMER' | 'GIVE_UP';
    message: string;
    discountOffer?: number;
  } {
    const { daysPending } = params;

    // Regras simples de recuperação
    if (daysPending <= 1) {
      return {
        action: 'SEND_REMINDER',
        message: 'Lembrete: seu pagamento está aguardando. Posso ajudar em algo?',
      };
    }

    if (daysPending <= 3) {
      return {
        action: 'OFFER_DISCOUNT',
        message: 'Condição especial: pague hoje e receba 5% de desconto. Use o mesmo link.',
        discountOffer: 5,
      };
    }

    if (daysPending <= 7) {
      return {
        action: 'CALL_CUSTOMER',
        message:
          'Notamos que seu pagamento está pendente. Podemos ajudar? Responda para falar com nossa equipe.',
      };
    }

    return {
      action: 'GIVE_UP',
      message: '',
    };
  }

  /**
   * Processa webhook de pagamento e dispara ações automáticas.
   */
  async processPaymentConfirmation(params: {
    workspaceId: string;
    paymentId: string;
    status: 'CONFIRMED' | 'RECEIVED' | 'OVERDUE' | 'REFUNDED';
    amount: number;
    customerId?: string;
    // messageLimit: enforced via PlanLimitsService.trackMessageSend at send time
  }): Promise<{
    sendMessage: boolean;
    message?: string;
    nextAction?: string;
  }> {
    const { status, amount } = params;

    if (status === 'CONFIRMED' || status === 'RECEIVED') {
      await this.prisma.$transaction(
        async (tx) => {
          await this.auditService.logWithTx(tx, {
            workspaceId: params.workspaceId,
            action: 'payment.status_changed',
            resource: 'SmartPayment',
            resourceId: params.paymentId,
            details: { status, amount, customerId: params.customerId },
          });
        },
        { isolationLevel: 'ReadCommitted' },
      );
      return {
        sendMessage: true,
        message: buildConfirmedPaymentMessage(amount),
        nextAction: 'TRIGGER_ONBOARDING_FLOW',
      };
    }

    if (status === 'OVERDUE') {
      return {
        sendMessage: true,
        message:
          'Seu pagamento está vencido. Deseja gerar um novo link? Responda SIM para receber.',
        nextAction: 'SCHEDULE_FOLLOWUP',
      };
    }

    if (status === 'REFUNDED') {
      await this.prisma.$transaction(
        async (tx) => {
          await this.auditService.logWithTx(tx, {
            workspaceId: params.workspaceId,
            action: 'refund.processed',
            resource: 'SmartPayment',
            resourceId: params.paymentId,
            details: { status, amount, customerId: params.customerId },
          });
        },
        { isolationLevel: 'ReadCommitted' },
      );
      return {
        sendMessage: true,
        message: 'Seu reembolso foi processado. O valor estará disponível em até 5 dias úteis.',
        nextAction: 'MARK_CHURNED',
      };
    }

    return { sendMessage: false };
  }
}
