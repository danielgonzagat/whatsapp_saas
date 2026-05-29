import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredLogger } from '../logging/structured-logger';
import * as Sentry from '@sentry/node';
import OpenAI from 'openai';
import { AuditService } from '../audit/audit.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentService } from './payment.service';
import { chatCompletionWithRetry } from './openai-wrapper';

import {
  buildConfirmedPaymentMessage,
  buildNegotiationAiPrompt,
  buildPixReadyMessage,
  buildSmartPaymentAiPrompt,
  buildSmartPaymentIdempotencyKey,
  type PaymentContext,
} from './smart-payment.service.helpers';

import { JSON_CODE_FENCE_RE } from '../common/regex';

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
  private readonly logger = StructuredLogger.from(SmartPaymentService.name);
  private openai!: OpenAI;

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
    const { workspaceId, phone, customerName, customerEmail, amount, productName, conversation } =
      context;

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
                ...(productName !== undefined ? { productName } : {}),
                amount,
                conversation,
              }),
            },
          ],
          temperature: 0.7,
        });

        const aiContent = aiResponse.choices[0]?.message?.content ?? '';
        const parsed = JSON.parse(aiContent.replace(JSON_CODE_FENCE_RE, '') || '{}') as {
          message?: string;
        };
        suggestedMessage = parsed.message || '';
        await this.planLimits
          .trackAiUsage(workspaceId, aiResponse?.usage?.total_tokens ?? 500)
          .catch(() => {});
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

    // 2. PaymentService gera Pix pelo provedor canonico configurado para PIX.
    try {
      const payment = await this.paymentService.createPayment({
        workspaceId,
        leadId: context.contactId || phone,
        customerName,
        customerPhone: phone,
        ...(customerEmail !== undefined ? { customerEmail } : {}),
        amount,
        description: productName || 'Pagamento KLOEL',
        idempotencyKey: buildSmartPaymentIdempotencyKey(context),
      });

      return {
        paymentId: payment.id,
        paymentUrl: payment.paymentLink || payment.invoiceUrl || '',
        ...(payment.pixQrCodeUrl !== undefined ? { pixQrCode: payment.pixQrCodeUrl } : {}),
        ...(payment.pixCopyPaste !== undefined ? { pixCopyPaste: payment.pixCopyPaste } : {}),
        billingType: 'PIX',
        suggestedMessage: suggestedMessage || buildPixReadyMessage(customerName, amount),
      };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? (err instanceof Error ? err.message : String(err)) : String(err);
      this.logger.error(`Mercado Pago PIX payment failed: ${message}`);
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
    contactMessage: string;
    maxDiscountPercent?: number;
  }): Promise<PaymentNegotiation> {
    const {
      workspaceId,
      contactId,
      originalAmount,
      contactMessage,
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
      const isHighValue = (contact?.leadScore ?? 0) >= 70;
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
              ...(contact?.name != null ? { customerName: contact.name } : {}),
              ...(contact?.leadScore != null ? { leadScore: contact.leadScore } : {}),
              ...(contact?.purchaseProbability != null
                ? { purchaseProbability: contact.purchaseProbability }
                : {}),
              maxDiscount: rules.maxDiscount,
              minPurchaseForDiscount: rules.minPurchaseForDiscount,
              originalAmount,
              contactMessage,
            }),
          },
        ],
        temperature: 0.5,
      });

      const responseContent = response.choices[0]?.message?.content ?? '';
      const parsed = JSON.parse(responseContent.replace(JSON_CODE_FENCE_RE, '') || '{}') as {
        discountPercent?: number;
        reason?: string;
        installments?: number;
        approved?: boolean;
      };

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
        ...(parsed.installments !== undefined ? { installments: parsed.installments } : {}),
        approved: parsed.approved !== false,
      };
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
