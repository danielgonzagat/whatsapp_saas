import { Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PaymentService } from './payment.service';
import { formatBrlAmount } from './money-format.util';
import { UnifiedAgentActionsMessagingService } from './unified-agent-actions-messaging.service';
import type { ToolArgs } from './unified-agent.types';
import { OpsAlertService } from '../observability/ops-alert.service';
import { MindGuardContextBuilderService } from './mind/policy/mind-guard-context-builder.service';
import { MindGuardsService } from './mind/policy/mind-guards.service';
import type { MindActionContext } from './mind/policy/mind-code-native.types';

import type { UnknownRecord } from '../common/types';
import { MindMemoryItemService } from './mind/aliases/mind-memory-item.service';

type ProductMemoryValue = {
  name?: string;
  price?: number;
  description?: string;
  paymentLink?: string;
  [key: string]: unknown;
};

/**
 * Handles commerce tool actions: send product info, create payment link.
 * Kept separate because these actions need both PrismaService AND PaymentService.
 */
@Injectable()
export class UnifiedAgentActionsCommerceService {
  private readonly logger = StructuredLogger.from(UnifiedAgentActionsCommerceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly auditService: AuditService,
    private readonly messaging: UnifiedAgentActionsMessagingService,
    @Optional() private readonly opsAlert?: OpsAlertService,
    @Optional() private readonly guardContextBuilder?: MindGuardContextBuilderService,
    @Optional() private readonly guards?: MindGuardsService,
    @Optional() private readonly mindMemory?: MindMemoryItemService,
  ) {}

  /** Canonical Brain → Mind memory delegate (raw-Prisma fallback). */
  private get mindMemoryItems(): PrismaService['kloelMemory'] {
    return this.mindMemory?.items ?? this.prisma.kloelMemory;
  }

  // ───────── helpers ─────────

  private str(v: unknown, fb = ''): string {
    return typeof v === 'string'
      ? v
      : typeof v === 'number' || typeof v === 'boolean'
        ? String(v)
        : fb;
  }

  private num(v: unknown, fb = 0): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : fb;
  }

  private buildProductInfoMessage(
    name: string,
    description?: string | null,
    price?: number | string | null,
    paymentLink?: string,
  ): string {
    const chunks: string[] = [];
    const safeName = String(name || '').trim();
    const safeDescription = String(description || '').trim();
    if (safeName) {
      chunks.push(safeName);
    }
    if (safeDescription) {
      chunks.push(safeDescription);
    }
    if (price !== null && price !== undefined && String(price).trim() !== '') {
      const numericPrice = Number(price);
      const formattedPrice = Number.isFinite(numericPrice)
        ? formatBrlAmount(numericPrice)
        : String(price);
      chunks.push(`Preço: ${formattedPrice}`);
    }
    if (paymentLink) {
      chunks.push(`Link de pagamento: ${paymentLink}`);
    }
    return chunks.join('\n');
  }

  // ───────── commerce actions ─────────

  async actionSendProductInfo(
    workspaceId: string,
    phone: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    const productName = this.str(args.productName);
    const includePrice = args.includePrice !== false;
    const includeLink = !!args.includeLink;

    const product = await this.mindMemoryItems.findFirst({
      where: {
        workspaceId,
        category: 'products',
        OR: [
          { key: { contains: productName.toLowerCase() } },
          { value: { path: ['name'], string_contains: productName } },
        ],
      },
    });

    if (!product) {
      const dbProduct = await this.prisma.product.findFirst({
        where: {
          workspaceId,
          name: { contains: productName, mode: 'insensitive' },
          active: true,
        },
      });
      if (dbProduct) {
        const message = this.buildProductInfoMessage(
          dbProduct.name,
          dbProduct.description,
          includePrice ? dbProduct.price : null,
          includeLink ? (dbProduct.paymentLink ?? undefined) : undefined,
        );
        const sendResult = await this.messaging.actionSendMessage(
          workspaceId,
          phone,
          { message },
          context,
        );
        return {
          success: sendResult.success === true,
          product: dbProduct,
          message,
          sent: sendResult.success === true,
        };
      }
      return { success: false, error: 'Produto não encontrado' };
    }

    const productData = product.value as ProductMemoryValue;
    const message = this.buildProductInfoMessage(
      productData.name ?? '',
      productData.description,
      includePrice ? productData.price : null,
      includeLink ? productData.paymentLink : undefined,
    );
    const sendResult = await this.messaging.actionSendMessage(
      workspaceId,
      phone,
      { message },
      context,
    );
    return {
      success: sendResult.success === true,
      product: productData,
      message,
      sent: sendResult.success === true,
    };
  }

  async actionCreatePaymentLink(
    workspaceId: string,
    phone: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    try {
      const amount = this.num(args.amount);
      const productName = this.str(args.productName);
      const description = this.str(args.description, `Pagamento - ${productName}`);
      const contact = await this.prisma.contact.findFirst({ where: { workspaceId, phone } });
      const paymentContext = await this.buildPaymentGuardContext(workspaceId, {
        ...(context || {}),
        contactId: contact?.id,
        maxPaymentAmount: this.num(context?.maxPaymentAmount, 5000),
        paymentAmount: amount,
        paymentExternalId: this.str(context?.paymentExternalId),
        productName,
      });
      const guard = await this.guards?.evaluate({
        workspaceId,
        decisionType: 'product_offer',
        action: 'create_payment_link',
        context: paymentContext,
      });
      if (guard && !guard.allowed) {
        return {
          success: false,
          blocked: true,
          error: guard.reason,
          guardName: guard.guardName,
        };
      }
      const payment = await this.paymentService.createPayment({
        workspaceId,
        leadId: contact?.id || phone,
        customerName: contact?.name || 'Cliente',
        customerPhone: phone,
        ...(contact?.email ? { customerEmail: contact.email } : {}),
        amount,
        description,
        idempotencyKey: `kloel-pix:${workspaceId}:${phone}:${amount}:${productName}`,
      });

      const paymentMessage = [
        `Seu pagamento de ${formatBrlAmount(amount)} está pronto.`,
        '',
        'Use o QR Code ou copie o código PIX:',
        '',
        payment.pixCopyPaste || payment.paymentLink || payment.invoiceUrl,
      ].join('\n');
      await this.messaging.actionSendMessage(
        workspaceId,
        phone,
        { message: paymentMessage },
        context,
      );
      try {
        await this.prisma.$transaction(
          async (tx) => {
            await this.auditService.logWithTx(tx, {
              workspaceId,
              action: 'PAYMENT_LINK_CREATED',
              resource: 'UnifiedAgent',
              resourceId: payment.id,
              details: { amount, phone, method: 'PIX', provider: 'mercadopago' },
            });
          },
          { isolationLevel: 'ReadCommitted' },
        );
      } catch (auditError: unknown) {
        void this.opsAlert?.alertOnCriticalError(
          auditError,
          'UnifiedAgentActionsCommerceService.logWithTx',
        );
        const auditMsg =
          auditError instanceof Error
            ? auditError.message
            : typeof auditError === 'string'
              ? auditError
              : 'unknown';
        this.logger.error(`Audit log persistence failed: ${auditMsg}`);
      }
      return {
        success: true,
        paymentId: payment.id,
        paymentLink: payment.paymentLink || payment.invoiceUrl,
        pixCopyPaste: payment.pixCopyPaste,
        amount,
        sent: true,
      };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'UnifiedAgentActionsCommerceService.async');
      const msg =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown';
      this.logger.error(`Erro ao criar pagamento PIX real: ${msg}`);
      return {
        success: false,
        error: 'payment_failed',
        provider: 'mercadopago',
        reason: msg,
        amount: this.num(args.amount),
      };
    }
  }

  private async buildPaymentGuardContext(
    workspaceId: string,
    context: MindActionContext,
  ): Promise<MindActionContext> {
    return (await this.guardContextBuilder?.buildForPayment(workspaceId, context)) ?? context;
  }
}
