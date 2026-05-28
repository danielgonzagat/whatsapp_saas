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
  creditWalletFromPaidCheckoutUpdate,
  enqueuePurchaseWhatsappFromPaidCheckoutUpdate,
  markCheckoutSocialLeadConvertedFromPaidUpdate,
  sendFacebookCapiPurchaseFromPaidUpdate,
  sendPurchaseConfirmationEmailFromPaidCheckoutUpdate,
} from './checkout-paid-effects';
import {
  buildEnrollmentLockKey,
  computeMemberAreaAvgCompletion,
  extractCheckoutOrderIdentity,
  extractErrorStack,
  formatHookFailureMessage,
  formatShutdownFailureMessage,
  formatShutdownStartMessage,
  hasCheckoutPaymentLookupKey,
  isApprovedCheckoutPaymentUpdate,
  isPaidCheckoutOrderUpdate,
  pickEnrollmentStudentName,
} from './prisma.service.helpers';

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

  private checkoutEmailSender?: (input: {
    to: string;
    subject: string;
    html: string;
  }) => Promise<boolean>;

  constructor() {
    super();
    this.installCheckoutPaidMemberAccessHook();
  }

  setCheckoutEmailSender(
    sendEmail: (input: { to: string; subject: string; html: string }) => Promise<boolean>,
  ) {
    this.checkoutEmailSender = sendEmail;
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
          this.logger.warn(formatHookFailureMessage('Member access grant', error));
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
            this.logger.warn(formatHookFailureMessage('Checkout payment paid', error));
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
            this.logger.warn(formatHookFailureMessage('Member access grant transaction', error));
          },
        );
        if (isPaidCheckoutOrderUpdate(args)) {
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
          this.logger.warn(formatHookFailureMessage('Checkout payment paid transaction', error));
        });
        return result;
      },
    });

    return tx;
  }

  async grantMemberAccessFromPaidCheckoutUpdate(args: Prisma.CheckoutOrderUpdateManyArgs) {
    if (!isPaidCheckoutOrderUpdate(args)) {
      return;
    }

    await this.$transaction(async (tx) => {
      await this.grantMemberAccessFromPaidCheckoutUpdateInTransaction(args, tx);
    });
  }

  async markCheckoutOrderPaidFromApprovedCheckoutPaymentUpdate(
    args: Prisma.CheckoutPaymentUpdateManyArgs,
  ) {
    if (!isApprovedCheckoutPaymentUpdate(args)) {
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
    if (!isApprovedCheckoutPaymentUpdate(args)) {
      return;
    }

    const where = args.where || {};
    if (!hasCheckoutPaymentLookupKey(where)) {
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
    if (!isPaidCheckoutOrderUpdate(args)) {
      return;
    }

    const { orderId, workspaceId } = extractCheckoutOrderIdentity(args.where);

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

    const lockKey = buildEnrollmentLockKey({
      workspaceId,
      memberAreaId: memberArea.id,
      customerEmail: order.customerEmail,
    });
    await tx.$executeRaw<number>`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

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
          where: { id: existingEnrollment.id, workspaceId },
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
        studentName: pickEnrollmentStudentName({
          customerName: order.customerName,
          customerEmail: order.customerEmail,
        }),
        studentEmail: order.customerEmail,
        ...(order.customerPhone !== undefined ? { studentPhone: order.customerPhone } : {}),
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
      where: { workspaceId, memberAreaId: memberArea.id },
      _count: { _all: true },
      _avg: { progress: true },
    });

    await tx.memberArea.update({
      where: { id: memberArea.id, workspaceId },
      data: {
        totalStudents: enrollmentAgg._count._all,
        avgCompletion: computeMemberAreaAvgCompletion(enrollmentAgg._avg.progress),
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
    if (!isPaidCheckoutOrderUpdate(args)) {
      return;
    }

    await this.sendPurchaseConfirmationEmailFromPaidCheckoutUpdate(args).catch((error: unknown) => {
      this.logger.warn(formatHookFailureMessage('Purchase confirmation email', error));
    });
    await this.markCheckoutSocialLeadConvertedFromPaidUpdate(args).catch((error: unknown) => {
      this.logger.warn(formatHookFailureMessage('Checkout social lead conversion', error));
    });
    await this.sendFacebookCapiPurchaseFromPaidUpdate(args).catch((error: unknown) => {
      this.logger.warn(formatHookFailureMessage('Facebook CAPI purchase', error));
    });
    await this.createAffiliateCommissionFromPaidCheckoutUpdate(args).catch((error: unknown) => {
      this.logger.warn(formatHookFailureMessage('Affiliate commission', error));
    });
    await this.creditWalletFromPaidCheckoutUpdate(args).catch((error: unknown) => {
      this.logger.warn(formatHookFailureMessage('Checkout wallet credit', error));
    });
    await this.enqueuePurchaseWhatsappFromPaidCheckoutUpdate(args).catch((error: unknown) => {
      this.logger.warn(formatHookFailureMessage('WhatsApp purchase notification', error));
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
    if (!this.checkoutEmailSender) {
      return;
    }
    await sendPurchaseConfirmationEmailFromPaidCheckoutUpdate(this, args, this.checkoutEmailSender);
  }

  async createAffiliateCommissionFromPaidCheckoutUpdate(args: Prisma.CheckoutOrderUpdateManyArgs) {
    await createAffiliateCommissionFromPaidCheckoutUpdate(this, args);
  }

  async creditWalletFromPaidCheckoutUpdate(args: Prisma.CheckoutOrderUpdateManyArgs) {
    await creditWalletFromPaidCheckoutUpdate(this, args);
  }

  async enqueuePurchaseWhatsappFromPaidCheckoutUpdate(args: Prisma.CheckoutOrderUpdateManyArgs) {
    await enqueuePurchaseWhatsappFromPaidCheckoutUpdate(this, args);
  }

  async onModuleInit() {
    try {
      await this.$connect();
    } catch (error: unknown) {
      // Não derrubar o processo: endpoints lidarão com falhas de DB e retornarão 503.
      this.logger.error(
        'Falha ao conectar no banco durante startup. O serviço continuará iniciando.',
        extractErrorStack(error),
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
      this.logger.log(formatShutdownStartMessage(signal));
      await this.$disconnect();
    } catch (error: unknown) {
      this.logger.warn(formatShutdownFailureMessage(error));
    }
  }
}
