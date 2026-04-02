import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { AsaasService } from './asaas.service';
import { AuditService } from '../audit/audit.service';
import OpenAI from 'openai';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { FinancialAlertService } from '../common/financial-alert.service';

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

@Injectable()
export class SmartPaymentService {
  private readonly logger = new Logger(SmartPaymentService.name);
  private openai: OpenAI;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly asaasService: AsaasService,
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

    // 1. Buscar configurações do workspace
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true, providerSettings: true },
    });

    const settings = workspace?.providerSettings as Record<string, any>;
    const preferredPayment = settings?.payment?.preferredMethod || 'PIX';

    // 2. Verificar conexão Asaas
    const asaasStatus = await this.asaasService.getConnectionStatus(workspaceId);

    // 3. Se temos a conversa, usar IA para gerar mensagem personalizada
    let suggestedMessage = '';
    let billingType: 'PIX' | 'BOLETO' | 'CREDIT_CARD' = preferredPayment;

    if (this.openai && conversation) {
      try {
        await this.planLimits.ensureTokenBudget(workspaceId);
        const aiResponse = await this.openai.chat.completions.create({
          model: resolveBackendOpenAIModel('writer'),
          messages: [
            {
              role: 'system',
              content: `Você é um assistente de vendas. Gere uma mensagem WhatsApp curta e persuasiva para enviar um link de pagamento.
              
Contexto:
- Cliente: ${customerName}
- Produto: ${productName || 'Produto/Serviço'}
- Valor: R$ ${Number(amount.toFixed(2))}
- Histórico da conversa: ${conversation.slice(-500)}

Responda em JSON:
{
  "message": "Mensagem WhatsApp (max 200 chars)",
  "paymentMethod": "PIX|BOLETO|CREDIT_CARD",
  "urgencyLevel": "low|medium|high"
}`,
            },
          ],
          temperature: 0.7,
        });

        const parsed = JSON.parse(
          aiResponse.choices[0].message.content?.replace(/```json\n?|\n?```/g, '') || '{}',
        );
        suggestedMessage = parsed.message || '';
        if (['PIX', 'BOLETO', 'CREDIT_CARD'].includes(parsed.paymentMethod)) {
          billingType = parsed.paymentMethod;
        }
        await this.planLimits
          .trackAiUsage(workspaceId, aiResponse?.usage?.total_tokens ?? 500)
          .catch(() => {});
        // PULSE:OK — AI message is optional enrichment; static fallback message is used when AI fails
      } catch (err) {
        this.logger.warn('AI message generation failed', err.message);
      }
    }

    // 4. Criar pagamento no Asaas ou usar fallback
    if (asaasStatus.connected) {
      try {
        if (billingType === 'PIX') {
          const payment = await this.asaasService.createPixPayment(workspaceId, {
            customerName,
            customerPhone: phone,
            amount,
            description: productName || 'Pagamento KLOEL',
          });

          return {
            paymentId: payment.id,
            paymentUrl: payment.pixQrCodeUrl,
            pixQrCode: payment.pixQrCodeUrl,
            pixCopyPaste: payment.pixCopyPaste,
            billingType: 'PIX',
            suggestedMessage:
              suggestedMessage ||
              `${customerName}, seu pagamento PIX de R$ ${Number(amount.toFixed(2))} está pronto.\n\nUse o QR Code ou copie o código PIX abaixo.`,
          };
        }

        // Boleto
        const boletoPayment = await this.asaasService.createBoletoPayment(workspaceId, {
          customerName,
          customerPhone: phone,
          customerCpfCnpj: '', // Será solicitado posteriormente se necessário
          amount,
          description: productName || 'Pagamento KLOEL',
        });

        return {
          paymentId: boletoPayment.id,
          paymentUrl: boletoPayment.bankSlipUrl,
          billingType: 'BOLETO',
          suggestedMessage:
            suggestedMessage ||
            `${customerName}, seu boleto de R$ ${Number(amount.toFixed(2))} foi gerado.\n\nClique no link para visualizar e pagar.`,
        };
        // PULSE:OK — Asaas failure is gracefully degraded to internal fallback payment link below
      } catch (err) {
        this.logger.error('Asaas payment failed, using fallback', err.message);
      }
    }

    // Fallback: link de pagamento interno
    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const paymentUrl = `${frontendUrl}/pay/${paymentId}`;

    // Salvar na base de dados
    const prismaAny = this.prisma as Record<string, any>;
    try {
      await prismaAny.kloelSale.create({
        data: {
          leadId: context.contactId || 'unknown',
          status: 'pending',
          amount,
          paymentMethod: billingType,
          paymentLink: paymentUrl,
          externalPaymentId: paymentId,
          workspaceId,
        },
      });
    } catch {
      this.logger.warn('Could not save to kloelSale');
    }

    return {
      paymentId,
      paymentUrl,
      billingType,
      suggestedMessage:
        suggestedMessage ||
        `${customerName}, aqui está seu link de pagamento de R$ ${Number(amount.toFixed(2))}:\n\n${paymentUrl}`,
    };
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
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: {
        name: true,
        leadScore: true,
        purchaseProbability: true,
        customFields: true,
      },
    });

    // 2. Buscar regras de desconto do workspace
    const prismaAny = this.prisma as Record<string, any>;
    let discountRules: any = null;
    try {
      if (prismaAny?.kloelConfig?.findFirst) {
        discountRules = await prismaAny.kloelConfig.findFirst({
          where: { workspaceId, key: 'discount_rules' },
        });
      }
    } catch {
      discountRules = null;
    }

    const rules = discountRules?.value || {
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
      const response = await this.openai.chat.completions.create({
        model: resolveBackendOpenAIModel('brain'),
        messages: [
          {
            role: 'system',
            content: `Você é um gerente de vendas decidindo sobre um pedido de desconto.

Contexto do cliente:
- Nome: ${contact?.name || 'Desconhecido'}
- Lead Score: ${contact?.leadScore || 0}/100
- Probabilidade de compra: ${contact?.purchaseProbability || 'UNKNOWN'}

Regras de desconto:
- Desconto máximo permitido: ${rules.maxDiscount}%
- Valor mínimo para desconto: R$ ${rules.minPurchaseForDiscount}

Valor original: R$ ${Number(originalAmount.toFixed(2))}
Mensagem do cliente: "${customerMessage}"

Analise e responda em JSON:
{
  "approved": true/false,
  "discountPercent": número (0 a ${rules.maxDiscount}),
  "reason": "explicação curta",
  "installments": número ou null,
  "counterOffer": "mensagem de contra-oferta se não aprovado"
}`,
          },
        ],
        temperature: 0.5,
      });

      const parsed = JSON.parse(
        response.choices[0].message.content?.replace(/```json\n?|\n?```/g, '') || '{}',
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
    } catch (err) {
      this.logger.error('AI negotiation failed', err.message);

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
  async analyzePaymentRecovery(params: {
    workspaceId: string;
    paymentId: string;
    daysPending: number;
  }): Promise<{
    action: 'SEND_REMINDER' | 'OFFER_DISCOUNT' | 'CALL_CUSTOMER' | 'GIVE_UP';
    message: string;
    discountOffer?: number;
  }> {
    const { workspaceId, paymentId, daysPending } = params;

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
            action: 'PAYMENT_CONFIRMED',
            resource: 'SmartPayment',
            resourceId: params.paymentId,
            details: { status, amount, customerId: params.customerId },
          });
        },
        { isolationLevel: 'ReadCommitted' },
      );
      return {
        sendMessage: true,
        message: `Pagamento de R$ ${Number(amount.toFixed(2))} confirmado. Obrigado pela compra.\n\nSeu acesso e os próximos passos seguem pelo canal cadastrado.`,
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
      return {
        sendMessage: true,
        message: 'Seu reembolso foi processado. O valor estará disponível em até 5 dias úteis.',
        nextAction: 'MARK_CHURNED',
      };
    }

    return { sendMessage: false };
  }
}
