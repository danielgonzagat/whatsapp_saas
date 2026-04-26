import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PaymentService } from './payment.service';
import { formatBrlAmount } from './money-format.util';
import { UnifiedAgentActionsMessagingService } from './unified-agent-actions-messaging.service';
import type { ToolArgs } from './unified-agent.service';

type UnknownRecord = Record<string, unknown>;

/**
 * Handles commerce tool actions: send product info, create payment link.
 * Kept separate because these actions need both PrismaService AND PaymentService.
 */
@Injectable()
export class UnifiedAgentActionsCommerceService {
  private readonly logger = new Logger(UnifiedAgentActionsCommerceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly paymentService: PaymentService,
    private readonly auditService: AuditService,
    private readonly messaging: UnifiedAgentActionsMessagingService,
  ) {}

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
    if (safeName) chunks.push(safeName);
    if (safeDescription) chunks.push(safeDescription);
    if (price !== null && price !== undefined && String(price).trim() !== '') {
      const numericPrice = Number(price);
      const formattedPrice = Number.isFinite(numericPrice)
        ? formatBrlAmount(numericPrice)
        : String(price);
      chunks.push(`Preço: ${formattedPrice}`);
    }
    if (paymentLink) chunks.push(`Link de pagamento: ${paymentLink}`);
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

    const product = await this.prisma.kloelMemory.findFirst({
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

    const productData = product.value as Record<string, unknown>;
    const message = this.buildProductInfoMessage(
      productData.name as string,
      productData.description as string,
      includePrice ? (productData.price as number) : null,
      includeLink ? (productData.paymentLink as string) : undefined,
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
      const payment = await this.paymentService.createPayment({
        workspaceId,
        leadId: contact?.id || phone,
        customerName: contact?.name || 'Cliente',
        customerPhone: phone,
        customerEmail: contact?.email || undefined,
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
              details: { amount, phone, method: 'PIX', provider: 'stripe' },
            });
          },
          { isolationLevel: 'ReadCommitted' },
        );
      } catch (auditError: unknown) {
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
      const msg =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown';
      this.logger.error(`Erro ao criar link de pagamento: ${msg}`);
      const paymentId = `pay_${randomUUID()}`;
      const paymentLink = `${this.config.get('FRONTEND_URL') || 'https://kloel.com'}/pay/${paymentId}`;
      const idempotencyKey = `kloel-fallback:${workspaceId}:${phone}:${this.num(args.amount)}:${this.str(args.productName)}`;
      try {
        const existingSale = await this.prisma.kloelSale.findFirst({
          where: {
            workspaceId,
            leadPhone: phone,
            productName: this.str(args.productName),
            amount: this.num(args.amount),
            paymentMethod: 'INTERNAL',
          },
          orderBy: { createdAt: 'desc' },
        });
        if (!existingSale) {
          await this.prisma.kloelSale.create({
            data: {
              workspaceId,
              externalPaymentId: paymentId,
              leadPhone: phone,
              productName: this.str(args.productName),
              amount: this.num(args.amount),
              status: 'pending',
              paymentMethod: 'INTERNAL',
              metadata: { idempotencyKey },
            },
          });
        }
      } catch {
        this.logger.warn('kloelSale table not available');
      }
      const message = `Link de pagamento: ${paymentLink}\n\nValor: ${formatBrlAmount(this.num(args.amount))}`;
      await this.messaging
        .actionSendMessage(workspaceId, phone, { message }, context)
        .catch(() => {});
      return {
        success: true,
        paymentId,
        paymentLink,
        amount: this.num(args.amount),
        method: 'internal',
        fallback: true,
      };
    }
  }
}
