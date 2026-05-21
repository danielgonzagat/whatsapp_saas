import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

import type { UnknownRecord } from '../common/types';

export interface ProductSubResourceToolResult {
  [key: string]: unknown;
  success: boolean;
  message?: string;
  error?: string;
}

@Injectable()
export class KloelProductSubResourceToolsService {
  constructor(private readonly prisma: PrismaService) {}

  async executeTool(
    toolName: string,
    workspaceId: string,
    args: UnknownRecord,
  ): Promise<ProductSubResourceToolResult> {
    switch (toolName) {
      case 'create_plan':
        return this.toolCreatePlan(workspaceId, args);
      case 'update_plan':
        return this.toolUpdatePlan(workspaceId, args);
      case 'create_checkout':
        return this.toolCreateCheckout(workspaceId, args);
      case 'update_checkout':
        return this.toolUpdateCheckout(workspaceId, args);
      case 'create_coupon':
        return this.toolCreateCoupon(workspaceId, args);
      case 'list_coupons':
        return this.toolListCoupons(workspaceId, args);
      case 'delete_coupon':
        return this.toolDeleteCoupon(workspaceId, args);
      case 'generate_boleto':
        return this.toolGenerateBoleto(workspaceId, args);
      default:
        return { success: false, error: 'Unknown: ' + toolName };
    }
  }

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

  async toolCreatePlan(workspaceId: string, args: UnknownRecord) {
    try {
      let pid = this.str(args.productId);
      if (!pid && args.productName) {
        const p = await this.prisma.product.findFirst({
          where: {
            workspaceId,
            name: { contains: this.str(args.productName), mode: 'insensitive' },
          },
        });
        pid = p?.id ?? '';
      }
      if (!pid) {
        return { success: false, error: 'Produto nao encontrado' };
      }
      const plan = await this.prisma.productPlan.create({
        data: {
          productId: pid,
          name: this.str(args.planName, 'Plano'),
          price: this.num(args.price),
          itemsPerPlan: args.quantity ? this.num(args.quantity) : 1,
          maxInstallments: args.maxInstallments ? this.num(args.maxInstallments) : null,
          visibleToAffiliates: args.visibleToAffiliates === true,
        },
      });
      return { success: true, plan: { id: plan.id, name: plan.name, price: plan.price } };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Erro' };
    }
  }

  async toolUpdatePlan(_workspaceId: string, args: UnknownRecord) {
    if (!args.planId) {
      return { success: false, error: 'planId required' };
    }
    try {
      const data: UnknownRecord = {};
      if (args.planName !== undefined) {
        data.name = this.str(args.planName);
      }
      if (args.price !== undefined) {
        data.price = this.num(args.price);
      }
      if (args.active !== undefined) {
        data.active = Boolean(args.active);
      }
      const plan = await this.prisma.productPlan.update({
        where: { id: this.str(args.planId) },
        data,
      });
      return { success: true, plan: { id: plan.id, name: plan.name, price: plan.price } };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Erro' };
    }
  }

  async toolCreateCheckout(workspaceId: string, args: UnknownRecord) {
    try {
      let pid = this.str(args.productId);
      if (!pid && args.productName) {
        const p = await this.prisma.product.findFirst({
          where: {
            workspaceId,
            name: { contains: this.str(args.productName), mode: 'insensitive' },
          },
        });
        pid = p?.id ?? '';
      }
      if (!pid) {
        return { success: false, error: 'Produto nao encontrado' };
      }
      const co = await this.prisma.productCheckout.create({
        data: { productId: pid, name: this.str(args.checkoutName, 'Checkout'), config: {} },
      });
      return { success: true, checkout: { id: co.id, name: co.name } };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Erro' };
    }
  }

  async toolUpdateCheckout(_workspaceId: string, args: UnknownRecord) {
    if (!args.checkoutId) {
      return { success: false, error: 'checkoutId required' };
    }
    try {
      const data: UnknownRecord = {};
      if (args.checkoutName !== undefined) {
        data.name = this.str(args.checkoutName);
      }
      if (args.active !== undefined) {
        data.active = Boolean(args.active);
      }
      const co = await this.prisma.productCheckout.update({
        where: { id: this.str(args.checkoutId) },
        data,
      });
      return { success: true, checkout: { id: co.id, name: co.name } };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Erro' };
    }
  }

  async toolCreateCoupon(workspaceId: string, args: UnknownRecord) {
    try {
      let pid = this.str(args.productId);
      if (!pid && args.productName) {
        const p = await this.prisma.product.findFirst({
          where: {
            workspaceId,
            name: { contains: this.str(args.productName), mode: 'insensitive' },
          },
        });
        pid = p?.id ?? '';
      }
      if (!pid) {
        return { success: false, error: 'Produto nao encontrado' };
      }
      const c = await this.prisma.productCoupon.create({
        data: {
          productId: pid,
          code: this.str(args.code),
          discountType: this.str(args.discountType) === 'FIXED' ? 'FIXED' : 'PERCENT',
          discountValue: this.num(args.discountValue),
          maxUses: args.usageLimit ? this.num(args.usageLimit) : null,
          active: true,
        },
      });
      return { success: true, coupon: { id: c.id, code: c.code } };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Erro' };
    }
  }

  async toolListCoupons(workspaceId: string, args: UnknownRecord) {
    try {
      let pid = this.str(args.productId);
      if (!pid && args.productName) {
        const p = await this.prisma.product.findFirst({
          where: {
            workspaceId,
            name: { contains: this.str(args.productName), mode: 'insensitive' },
          },
        });
        pid = p?.id ?? '';
      }
      const coupons = pid
        ? await this.prisma.productCoupon.findMany({ where: { productId: pid } })
        : await this.prisma.productCoupon.findMany({ where: { product: { workspaceId } } });
      return { success: true, coupons };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Erro' };
    }
  }

  async toolDeleteCoupon(_workspaceId: string, args: UnknownRecord) {
    if (!args.couponId) {
      return { success: false, error: 'couponId required' };
    }
    try {
      await this.prisma.productCoupon.delete({ where: { id: this.str(args.couponId) } });
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Erro' };
    }
  }

  async toolGenerateBoleto(workspaceId: string, args: UnknownRecord) {
    try {
      const amount = this.num(args.amount);
      const sale = await this.prisma.kloelSale.create({
        data: {
          workspaceId,
          externalPaymentId: 'bol_' + Date.now(),
          leadPhone: this.str(args.customerPhone),
          productName: this.str(args.productName),
          amount,
          status: 'pending',
          paymentMethod: 'BOLETO',
        },
      });
      return {
        success: true,
        saleId: sale.id,
        boletoCode:
          '34191.79001 01043.510047 91020.150008 9 ' +
          String(Math.round(amount * 100)).padStart(10, '0'),
        amount,
      };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Erro' };
    }
  }
}
