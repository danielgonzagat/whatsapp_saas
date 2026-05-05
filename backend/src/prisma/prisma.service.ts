import {
  BeforeApplicationShutdown,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  createAffiliateCommissionFromPaidCheckoutUpdate,
  enqueuePurchaseWhatsappFromPaidCheckoutUpdate,
  markCheckoutSocialLeadConvertedFromPaidUpdate,
  sendFacebookCapiPurchaseFromPaidUpdate,
  sendPurchaseConfirmationEmailFromPaidCheckoutUpdate,
} from './checkout-paid-effects';

type PrismaTransactionOptions = {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
};

type InteractiveTransactionCallback<T> = (client: Prisma.TransactionClient) => Promise<T>;
type PrismaTransactionInput<T> =
  | Prisma.PrismaPromise<unknown>[]
  | InteractiveTransactionCallback<T>;

type MemberAccessTransactionClient = Pick<
  Prisma.TransactionClient,
  | '$executeRaw'
  | 'auditLog'
  | 'checkoutOrder'
  | 'checkoutPayment'
  | 'memberArea'
  | 'memberEnrollment'
>;

/** Prisma service. */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy, BeforeApplicationShutdown
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super();
    this.installCheckoutPaidMemberAccessHook();
  }

  private installCheckoutPaidMemberAccessHook() {
    const originalPaymentUpdateMany = this.checkoutPayment.updateMany.bind(this.checkoutPayment);
    const originalUpdateMany = this.checkoutOrder.updateMany.bind(this.checkoutOrder);
    const originalTransaction = this.$transaction.bind(this) as <T>(
      input: PrismaTransactionInput<T>,
      options?: PrismaTransactionOptions,
    ) => Promise<T | unknown[]>;

    Object.defineProperty(this.checkoutOrder, 'updateMany', {
      configurable: true,
      value: async (args: Prisma.CheckoutOrderUpdateManyArgs) => {
        const result = await originalUpdateMany(args);
        await this.grantMemberAccessFromPaidCheckoutUpdate(args).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'unknown error';
          this.logger.warn(`Member access grant hook failed: ${message}`);
        });
        await this.runPostPaymentCheckoutEffectsFromPaidUpdate(args);
        return result;
      },
    });

    Object.defineProperty(this.checkoutPayment, 'updateMany', {
      configurable: true,
      value: async (args: Prisma.CheckoutPaymentUpdateManyArgs) => {
        const result = await originalPaymentUpdateMany(args);
        await this.markCheckoutOrderPaidFromApprovedCheckoutPaymentUpdate(args).catch(
          (error: unknown) => {
            const message = error instanceof Error ? error.message : 'unknown error';
            this.logger.warn(`Checkout payment paid hook failed: ${message}`);
          },
        );
        return result;
      },
    });

    Object.defineProperty(this, '$transaction', {
      configurable: true,
      value: async <T>(input: PrismaTransactionInput<T>, options?: PrismaTransactionOptions) => {
        if (typeof input !== 'function') {
          return originalTransaction(input, options);
        }

        const paidUpdates: Prisma.CheckoutOrderUpdateManyArgs[] = [];
        const result = await originalTransaction(async (tx) => {
          const transactionClient = this.installTransactionCheckoutPaidMemberAccessHook(
            tx,
            paidUpdates,
          );
          return input(transactionClient);
        }, options);

        await this.runPostPaymentCheckoutEffectsFromPaidUpdates(paidUpdates);
        return result;
      },
    });
  }

  private installTransactionCheckoutPaidMemberAccessHook(
    tx: Prisma.TransactionClient,
    paidUpdates: Prisma.CheckoutOrderUpdateManyArgs[],
  ) {
    const originalUpdateMany = tx.checkoutOrder.updateMany.bind(tx.checkoutOrder);
    const originalPaymentUpdateMany = tx.checkoutPayment.updateMany.bind(tx.checkoutPayment);

    Object.defineProperty(tx.checkoutOrder, 'updateMany', {
      configurable: true,
      value: async (args: Prisma.CheckoutOrderUpdateManyArgs) => {
        const result = await originalUpdateMany(args);
        await this.grantMemberAccessFromPaidCheckoutUpdateInTransaction(args, tx).catch(
          (error: unknown) => {
            const message = error instanceof Error ? error.message : 'unknown error';
            this.logger.warn(`Member access grant transaction hook failed: ${message}`);
          },
        );
        if (args.data.status === 'PAID') {
          paidUpdates.push(args);
        }
        return result;
      },
    });

    Object.defineProperty(tx.checkoutPayment, 'updateMany', {
      configurable: true,
      value: async (args: Prisma.CheckoutPaymentUpdateManyArgs) => {
        const result = await originalPaymentUpdateMany(args);
        await this.markCheckoutOrderPaidFromApprovedCheckoutPaymentUpdateInTransaction(
          args,
          tx,
        ).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'unknown error';
          this.logger.warn(`Checkout payment paid transaction hook failed: ${message}`);
        });
        return result;
      },
    });

    return tx;
  }

  async grantMemberAccessFromPaidCheckoutUpdate(args: Prisma.CheckoutOrderUpdateManyArgs) {
    if (args.data.status !== 'PAID') {
      return;
    }

    await this.$transaction(async (tx) => {
      await this.grantMemberAccessFromPaidCheckoutUpdateInTransaction(args, tx);
    });
  }

  async markCheckoutOrderPaidFromApprovedCheckoutPaymentUpdate(
    args: Prisma.CheckoutPaymentUpdateManyArgs,
  ) {
    if (args.data.status !== 'APPROVED') {
      return;
    }

    await this.$transaction(async (tx) => {
      await this.markCheckoutOrderPaidFromApprovedCheckoutPaymentUpdateInTransaction(args, tx);
    });
  }

  private async markCheckoutOrderPaidFromApprovedCheckoutPaymentUpdateInTransaction(
    args: Prisma.CheckoutPaymentUpdateManyArgs,
    tx: MemberAccessTransactionClient,
  ) {
    if (args.data.status !== 'APPROVED') {
      return;
    }

    const where = args.where || {};
    if (!where.id && !where.orderId && !where.externalId) {
      return;
    }

    const payments = await tx.checkoutPayment.findMany({
      where,
      take: 20,
      select: {
        orderId: true,
        order: {
          select: {
            id: true,
            workspaceId: true,
            status: true,
          },
        },
      },
    });

    for (const payment of payments) {
      if (!payment.order || payment.order.status === 'PAID') {
        continue;
      }
      await tx.checkoutOrder.updateMany({
        where: { id: payment.order.id, workspaceId: payment.order.workspaceId },
        data: { status: 'PAID', paidAt: new Date() },
      });
    }
  }

  private async grantMemberAccessFromPaidCheckoutUpdateInTransaction(
    args: Prisma.CheckoutOrderUpdateManyArgs,
    tx: MemberAccessTransactionClient,
  ) {
    if (args.data.status !== 'PAID') {
      return;
    }

    const orderId = typeof args.where?.id === 'string' ? args.where.id : null;
    const workspaceId = typeof args.where?.workspaceId === 'string' ? args.where.workspaceId : null;

    if (!orderId || !workspaceId) {
      return;
    }

    const order = await tx.checkoutOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        workspaceId: true,
        customerName: true,
        customerEmail: true,
        customerPhone: true,
        plan: {
          select: { productId: true },
        },
      },
    });

    if (!order || order.workspaceId !== workspaceId || !order.customerEmail) {
      return;
    }

    await this.appendCheckoutEventIfMissing(tx, {
      workspaceId,
      action: 'payment_approved',
      resource: 'CheckoutOrder',
      resourceId: order.id,
      details: { source: 'checkout_order_paid_hook' },
    });

    const memberArea = await tx.memberArea.findFirst({
      where: {
        workspaceId,
        productId: order.plan.productId,
        active: true,
      },
      select: { id: true },
    });

    if (!memberArea) {
      return;
    }

    const lockKey = `${workspaceId}:${memberArea.id}:${order.customerEmail.toLowerCase()}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

    const existingEnrollment = await tx.memberEnrollment.findFirst({
      where: {
        workspaceId,
        memberAreaId: memberArea.id,
        studentEmail: order.customerEmail,
      },
      select: { id: true, status: true },
    });

    if (existingEnrollment) {
      if (existingEnrollment.status !== 'active') {
        await tx.memberEnrollment.update({
          where: { id: existingEnrollment.id },
          data: { status: 'active' },
        });
        await this.appendCheckoutEventIfMissing(tx, {
          workspaceId,
          action: 'member_access_granted',
          resource: 'MemberEnrollment',
          resourceId: existingEnrollment.id,
          details: { orderId: order.id, memberAreaId: memberArea.id, reactivated: true },
        });
      }
      return;
    }

    const enrollment = await tx.memberEnrollment.create({
      data: {
        workspaceId,
        memberAreaId: memberArea.id,
        studentName: order.customerName || order.customerEmail,
        studentEmail: order.customerEmail,
        studentPhone: order.customerPhone || undefined,
      },
    });
    await this.appendCheckoutEventIfMissing(tx, {
      workspaceId,
      action: 'member_access_granted',
      resource: 'MemberEnrollment',
      resourceId: enrollment.id,
      details: { orderId: order.id, memberAreaId: memberArea.id, reactivated: false },
    });

    const enrollmentAgg = await tx.memberEnrollment.aggregate({
      where: { memberAreaId: memberArea.id },
      _count: { _all: true },
      _avg: { progress: true },
    });

    await tx.memberArea.update({
      where: { id: memberArea.id },
      data: {
        totalStudents: enrollmentAgg._count._all,
        avgCompletion: Number(enrollmentAgg._avg.progress || 0),
      },
    });
  }

  private async appendCheckoutEventIfMissing(
    tx: MemberAccessTransactionClient,
    input: {
      workspaceId: string;
      action: string;
      resource: string;
      resourceId: string;
      details: Record<string, unknown>;
    },
  ) {
    const existing = await tx.auditLog.findFirst({
      where: {
        workspaceId: input.workspaceId,
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId,
      },
      select: { id: true },
    });

    if (existing) {
      return;
    }

    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId,
        details: input.details as Prisma.InputJsonValue,
      },
    });
  }

  private async runPostPaymentCheckoutEffectsFromPaidUpdates(
    paidUpdates: Prisma.CheckoutOrderUpdateManyArgs[],
  ) {
    for (const args of paidUpdates) {
      await this.runPostPaymentCheckoutEffectsFromPaidUpdate(args);
    }
  }

  private async runPostPaymentCheckoutEffectsFromPaidUpdate(
    args: Prisma.CheckoutOrderUpdateManyArgs,
  ) {
    if (args.data.status !== 'PAID') {
      return;
    }

    await this.sendPurchaseConfirmationEmailFromPaidCheckoutUpdate(args).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Purchase confirmation email hook failed: ${message}`);
    });
    await this.markCheckoutSocialLeadConvertedFromPaidUpdate(args).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Checkout social lead conversion hook failed: ${message}`);
    });
    await this.sendFacebookCapiPurchaseFromPaidUpdate(args).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Facebook CAPI purchase hook failed: ${message}`);
    });
    await this.createAffiliateCommissionFromPaidCheckoutUpdate(args).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Affiliate commission hook failed: ${message}`);
    });
    await this.enqueuePurchaseWhatsappFromPaidCheckoutUpdate(args).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`WhatsApp purchase notification hook failed: ${message}`);
    });
  }

  async markCheckoutSocialLeadConvertedFromPaidUpdate(args: Prisma.CheckoutOrderUpdateManyArgs) {
    await markCheckoutSocialLeadConvertedFromPaidUpdate(this, args);
  }

  async sendFacebookCapiPurchaseFromPaidUpdate(args: Prisma.CheckoutOrderUpdateManyArgs) {
    await sendFacebookCapiPurchaseFromPaidUpdate(this, args);
  }

  async sendPurchaseConfirmationEmailFromPaidCheckoutUpdate(
    args: Prisma.CheckoutOrderUpdateManyArgs,
  ) {
    await sendPurchaseConfirmationEmailFromPaidCheckoutUpdate(this, args);
  }

  async createAffiliateCommissionFromPaidCheckoutUpdate(args: Prisma.CheckoutOrderUpdateManyArgs) {
    await createAffiliateCommissionFromPaidCheckoutUpdate(this, args);
  }

  async enqueuePurchaseWhatsappFromPaidCheckoutUpdate(args: Prisma.CheckoutOrderUpdateManyArgs) {
    await enqueuePurchaseWhatsappFromPaidCheckoutUpdate(this, args);
  }

  async onModuleInit() {
    try {
      await this.$connect();
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      // Não derrubar o processo: endpoints lidarão com falhas de DB e retornarão 503.
      this.logger.error(
        'Falha ao conectar no banco durante startup. O serviço continuará iniciando.',
        typeof errorInstanceofError?.stack === 'string' ? errorInstanceofError.stack : undefined,
      );
    }
  }

  /** On module destroy. */
  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** Before application shutdown. */
  async beforeApplicationShutdown(signal?: string) {
    try {
      this.logger.log(`Encerrando conexões Prisma antes do shutdown (${signal || 'unknown'}).`);
      await this.$disconnect();
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      this.logger.warn(`Falha ao encerrar Prisma no shutdown: ${errorInstanceofError.message}`);
    }
  }
}
