import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CheckoutOrderStatusValue } from './checkout-order.service';

const CHECKOUT_ORDER_STATUSES = [
  'PENDING',
  'PROCESSING',
  'PAID',
  'SHIPPED',
  'DELIVERED',
  'CANCELED',
  'REFUNDED',
  'CHARGEBACK',
] as const;

/** Handles read operations and status/upsell mutations on checkout orders. */
@Injectable()
export class CheckoutOrderQueryService {
  private readonly logger = new Logger(CheckoutOrderQueryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** Get order. */
  async getOrder(orderId: string, workspaceId?: string) {
    const order = await this.prisma.checkoutOrder.findFirst({
      where: workspaceId ? { id: orderId, workspaceId } : { id: orderId },
      include: {
        plan: {
          include: {
            product: true,
            upsells: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
        payment: true,
        upsellOrders: true,
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  /** List orders. */
  async listOrders(
    workspaceId: string,
    filters?: { status?: string; page?: number; limit?: number },
  ) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const where: Prisma.CheckoutOrderWhereInput = { workspaceId };
    if (filters?.status) {
      where.status = filters.status as CheckoutOrderStatusValue;
    }

    const [orders, total] = await this.prisma.$transaction([
      this.prisma.checkoutOrder.findMany({
        where: { ...where, workspaceId },
        include: {
          plan: { select: { name: true, slug: true } },
          payment: { select: { status: true, gateway: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.checkoutOrder.count({ where: { ...where, workspaceId } }),
    ]);

    const safeLimit = Math.max(1, limit);
    return {
      orders,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  /** Update order status. */
  async updateOrderStatus(
    orderId: string,
    workspaceId: string | undefined,
    status: CheckoutOrderStatusValue,
    extra?: Prisma.CheckoutOrderUpdateInput,
  ) {
    if (!CHECKOUT_ORDER_STATUSES.includes(status)) {
      throw new BadRequestException(
        `Invalid order status: ${status}. Must be one of: ${CHECKOUT_ORDER_STATUSES.join(', ')}`,
      );
    }

    const data: Prisma.CheckoutOrderUpdateInput = { status };
    const now = new Date();

    if (status === 'PAID') {
      data.paidAt = now;
    }
    if (status === 'SHIPPED') {
      data.shippedAt = now;
    }
    if (status === 'DELIVERED') {
      data.deliveredAt = now;
    }
    if (status === 'CANCELED') {
      data.canceledAt = now;
    }
    if (status === 'REFUNDED') {
      data.refundedAt = now;
    }

    if (extra) {
      Object.assign(data, extra);
    }

    const existingOrder = await this.prisma.checkoutOrder.findFirst({
      where: workspaceId ? { id: orderId, workspaceId } : { id: orderId },
      select: { workspaceId: true, status: true },
    });
    await this.prisma.checkoutOrder.updateMany({
      where: workspaceId ? { id: orderId, workspaceId } : { id: orderId },
      data,
    });
    if (existingOrder?.workspaceId) {
      await this.auditService.log({
        workspaceId: existingOrder.workspaceId,
        action: 'ORDER_STATUS_CHANGED',
        resource: 'CheckoutOrder',
        resourceId: orderId,
        details: { previousStatus: existingOrder.status, newStatus: status },
      });
    }
    return this.prisma.checkoutOrder.findFirst({
      where: workspaceId ? { id: orderId, workspaceId } : { id: orderId },
    });
  }

  /** Get order status. */
  async getOrderStatus(orderId: string) {
    const order = await this.prisma.checkoutOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        workspaceId: true,
        orderNumber: true,
        status: true,
        payment: {
          select: {
            status: true,
            pixQrCode: true,
            pixCopyPaste: true,
            pixExpiresAt: true,
            boletoUrl: true,
            boletoBarcode: true,
            boletoExpiresAt: true,
          },
        },
        plan: {
          select: {
            id: true,
            name: true,
            upsells: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
              select: {
                id: true,
                title: true,
                headline: true,
                description: true,
                productName: true,
                image: true,
                priceInCents: true,
                compareAtPrice: true,
                acceptBtnText: true,
                declineBtnText: true,
                timerSeconds: true,
              },
            },
          },
        },
        upsellOrders: { select: { id: true, upsellId: true } },
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  /** Accept upsell. */
  async acceptUpsell(orderId: string, upsellId: string) {
    const order = await this.prisma.checkoutOrder.findUnique({
      where: { id: orderId },
      select: { id: true, workspaceId: true, status: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const upsell = await this.prisma.upsell.findUnique({
      where: { id: upsellId },
    });
    if (!upsell) {
      throw new NotFoundException('Upsell not found');
    }

    const upsellOrder = await this.prisma.upsellOrder.create({
      data: {
        orderId,
        upsellId,
        productName: upsell.productName,
        priceInCents: upsell.priceInCents,
        status: upsell.chargeType === 'ONE_CLICK' ? 'PAID' : 'PENDING',
      },
    });

    this.logger.log(`Upsell ${upsellId} accepted for order ${orderId} (${upsell.chargeType})`);

    const fullOrder = await this.prisma.checkoutOrder.findUnique({
      where: { id: orderId },
      select: { workspaceId: true },
    });
    if (fullOrder?.workspaceId) {
      await this.auditService.log({
        workspaceId: fullOrder.workspaceId,
        action: 'UPSELL_ACCEPTED',
        resource: 'UpsellOrder',
        resourceId: upsellOrder.id,
        details: {
          orderId,
          upsellId,
          priceInCents: upsell.priceInCents,
          chargeType: upsell.chargeType,
        },
      });
    }

    return {
      accepted: true,
      upsellOrder,
      chargeType: upsell.chargeType,
    };
  }

  /** Get recent paid orders. */
  async getRecentPaidOrders(limit: number) {
    return this.prisma.checkoutOrder.findMany({
      where: { status: 'PAID' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        workspaceId: true,
        orderNumber: true,
        status: true,
        totalInCents: true,
        customerName: true,
        createdAt: true,
        paidAt: true,
        plan: { include: { product: true } },
      },
    });
  }

  /** Decline upsell. */
  async declineUpsell(orderId: string, upsellId: string) {
    const order = await this.prisma.checkoutOrder.findUnique({
      where: { id: orderId },
      select: { id: true, workspaceId: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    this.logger.log(`Upsell ${upsellId} declined for order ${orderId}`);

    return { declined: true };
  }
}
