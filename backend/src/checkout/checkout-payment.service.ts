import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AsaasService } from '../kloel/asaas.service';
import { FinancialAlertService } from '../common/financial-alert.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class CheckoutPaymentService {
  private readonly logger = new Logger(CheckoutPaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly asaas: AsaasService,
    private readonly financialAlert: FinancialAlertService,
    private readonly auditService: AuditService,
  ) {}

  async processPayment(params: {
    orderId: string;
    workspaceId: string;
    customerName: string;
    customerEmail: string;
    customerCPF?: string;
    customerPhone?: string;
    paymentMethod: 'CREDIT_CARD' | 'PIX' | 'BOLETO';
    totalInCents: number;
    installments?: number;
    cardNumber?: string;
    cardExpiryMonth?: string;
    cardExpiryYear?: string;
    cardCcv?: string;
    cardHolderName?: string;
  }) {
    const amount = params.totalInCents / 100;
    const description = `Pedido ${params.orderId}`;

    try {
      if (params.paymentMethod === 'PIX') {
        const pix = await this.asaas.createPixPayment(params.workspaceId, {
          customerName: params.customerName,
          customerPhone: params.customerPhone || '',
          customerEmail: params.customerEmail,
          amount,
          description,
          externalReference: params.orderId,
        });

        const payment = await this.prisma.$transaction(async (tx) => {
          const p = await tx.checkoutPayment.create({
            data: {
              orderId: params.orderId,
              gateway: 'asaas',
              externalId: pix.id,
              pixQrCode: pix.pixQrCodeUrl,
              pixCopyPaste: pix.pixCopyPaste,
              pixExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
              status: 'PENDING',
            },
          });

          await this.auditService.logWithTx(tx, {
            workspaceId: params.workspaceId,
            action: 'CHECKOUT_PAYMENT_CREATED',
            resource: 'CheckoutPayment',
            resourceId: p.id,
            details: {
              method: 'PIX',
              amount,
              orderId: params.orderId,
              gateway: 'asaas',
              externalId: pix.id,
            },
          });

          return p;
        });

        return {
          payment,
          type: 'PIX',
          pixQrCode: pix.pixQrCodeUrl,
          pixCopyPaste: pix.pixCopyPaste,
        };
      }

      if (params.paymentMethod === 'BOLETO') {
        const boleto = await this.asaas.createBoletoPayment(
          params.workspaceId,
          {
            customerName: params.customerName,
            customerPhone: params.customerPhone || '',
            customerEmail: params.customerEmail,
            customerCpfCnpj: params.customerCPF || '',
            amount,
            description,
            externalReference: params.orderId,
          },
        );

        const payment = await this.prisma.$transaction(async (tx) => {
          const p = await tx.checkoutPayment.create({
            data: {
              orderId: params.orderId,
              gateway: 'asaas',
              externalId: boleto.id,
              boletoUrl: boleto.bankSlipUrl,
              boletoBarcode: boleto.barCode,
              boletoExpiresAt: new Date(boleto.dueDate),
              status: 'PENDING',
            },
          });

          await this.auditService.logWithTx(tx, {
            workspaceId: params.workspaceId,
            action: 'CHECKOUT_PAYMENT_CREATED',
            resource: 'CheckoutPayment',
            resourceId: p.id,
            details: {
              method: 'BOLETO',
              amount,
              orderId: params.orderId,
              gateway: 'asaas',
              externalId: boleto.id,
            },
          });

          return p;
        });

        return {
          payment,
          type: 'BOLETO',
          boletoUrl: boleto.bankSlipUrl,
          boletoBarcode: boleto.barCode,
        };
      }

      // CREDIT_CARD
      if (
        !params.cardNumber ||
        !params.cardExpiryMonth ||
        !params.cardExpiryYear ||
        !params.cardCcv
      ) {
        throw new HttpException('Card data required', HttpStatus.BAD_REQUEST);
      }

      const card = await this.asaas.createCardPayment(params.workspaceId, {
        customerName: params.customerName,
        customerPhone: params.customerPhone || '',
        customerEmail: params.customerEmail,
        customerCpfCnpj: params.customerCPF || '',
        amount,
        description,
        installments: params.installments,
        cardNumber: params.cardNumber,
        cardExpiryMonth: params.cardExpiryMonth,
        cardExpiryYear: params.cardExpiryYear,
        cardCcv: params.cardCcv,
        cardHolderName: params.cardHolderName || params.customerName,
        externalReference: params.orderId,
      });

      const approved =
        card.status === 'CONFIRMED' || card.status === 'RECEIVED';

      const payment = await this.prisma.$transaction(async (tx) => {
        const p = await tx.checkoutPayment.create({
          data: {
            orderId: params.orderId,
            gateway: 'asaas',
            externalId: card.id,
            cardLast4: params.cardNumber.slice(-4),
            cardBrand: card.cardBrand,
            status: approved
              ? 'APPROVED'
              : card.status === 'DECLINED' || card.status === 'REFUSED'
                ? 'DECLINED'
                : 'PROCESSING',
          },
        });

        if (approved) {
          await tx.checkoutOrder.update({
            where: { id: params.orderId },
            data: { status: 'PAID', paidAt: new Date() },
          });
        }

        await this.auditService.logWithTx(tx, {
          workspaceId: params.workspaceId,
          action: 'CHECKOUT_PAYMENT_CREATED',
          resource: 'CheckoutPayment',
          resourceId: p.id,
          details: {
            method: 'CREDIT_CARD',
            amount,
            orderId: params.orderId,
            gateway: 'asaas',
            externalId: card.id,
            approved,
            installments: params.installments,
          },
        });

        return p;
      });

      return { payment, type: 'CREDIT_CARD', approved };
    } catch (error) {
      this.logger.error(
        `Payment processing failed for order ${params.orderId}: ${(error as Error).message}`,
      );
      this.financialAlert.paymentFailed(error as Error, {
        workspaceId: params.workspaceId,
        orderId: params.orderId,
        amount: params.totalInCents / 100,
        gateway: 'asaas',
      });
      throw error;
    }
  }
}
