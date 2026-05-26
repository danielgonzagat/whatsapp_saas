import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
      case 'update_coupon':
        return this.toolUpdateCoupon(workspaceId, args);
      case 'list_checkouts':
        return this.toolListCheckouts(workspaceId, args);
      case 'delete_plan':
        return this.toolDeletePlan(workspaceId, args);
      case 'delete_checkout':
        return this.toolDeleteCheckout(workspaceId, args);
      case 'add_url':
        return this.toolAddUrl(workspaceId, args);
      case 'update_url':
        return this.toolUpdateUrl(workspaceId, args);
      case 'delete_url':
        return this.toolDeleteUrl(workspaceId, args);
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
          billingType: this.str(args.billingType, 'ONE_TIME'),
          itemsPerPlan: args.quantity ? this.num(args.quantity) : 1,
          maxInstallments: args.maxInstallments ? this.num(args.maxInstallments) : null,
          recurringInterval: this.str(args.recurringInterval) || null,
          trialEnabled: args.trialEnabled === true,
          trialDays: args.trialDays ? this.num(args.trialDays) : null,
          visibleToAffiliates: args.visibleToAffiliates !== undefined ? args.visibleToAffiliates === true : true,
          ...(args.shippingType ? {
            shippingConfig: {
              type: args.shippingType,
              value: args.shippingValue,
              originCep: args.originCep,
            } as unknown as Prisma.InputJsonValue,
          } : {}),
        },
      });
      return { success: true, plan: { id: plan.id, name: plan.name, price: plan.price } };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Erro' };
    }
  }

  async toolUpdatePlan(_workspaceId: string, args: UnknownRecord) {
    let planId = this.str(args.planId);
    if (!planId) {
      const name = this.str(args.planName || args.name);
      if (name) {
        const p = await this.prisma.productPlan.findFirst({
          where: { name: { contains: name, mode: 'insensitive' }, product: { workspaceId: _workspaceId } },
          select: { id: true },
        });
        planId = p?.id ?? '';
      }
    }
    if (!planId) {
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
      if (args.maxInstallments !== undefined) {
        data.maxInstallments = this.num(args.maxInstallments);
      }
      if (args.couponEnabled !== undefined) {
        data.couponEnabled = Boolean(args.couponEnabled);
      }
      if (args.itemsPerPlan !== undefined) {
        data.itemsPerPlan = this.num(args.itemsPerPlan);
      }
      const plan = await this.prisma.productPlan.update({
        where: { id: planId },
        data,
      });
      return { success: true, plan: { id: plan.id, name: plan.name, price: plan.price, itemsPerPlan: plan.itemsPerPlan } };
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
        data: {
          productId: pid,
          name: this.str(args.checkoutName || args.planName, 'Checkout'),
          config: ({
            paymentMethods: args.paymentMethods || ['card', 'pix', 'boleto'],
            couponEnabled: args.couponEnabled !== false,
            couponAuto: args.couponAuto || null,
            counterEnabled: args.counterEnabled || false,
            primaryColor: args.primaryColor || '#7c3aed',
            backgroundColor: args.backgroundColor || '#ffffff',
            buttonText: args.buttonText || 'Comprar agora',
            layout: args.layout || 'standard',
            socialProof: args.socialProof || false,
            warranty: args.warranty || false,
            exitIntent: args.exitIntent || false,
            linkedPlanNames: args.linkedPlanNames || [],
          }),
        },
      });
      return { success: true, checkout: { id: co.id, name: co.name } };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Erro' };
    }
  }

  async toolUpdateCheckout(_workspaceId: string, args: UnknownRecord) {
    let checkoutId = this.str(args.checkoutId);
    if (!checkoutId) {
      const name = this.str(args.checkoutName || args.name || args.planName);
      if (name) {
        const c = await this.prisma.productCheckout.findFirst({
          where: { name: { contains: name, mode: 'insensitive' }, product: { workspaceId: _workspaceId } },
          select: { id: true },
        });
        checkoutId = c?.id ?? '';
      }
    }
    if (!checkoutId) {
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
        where: { id: checkoutId },
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
        const firstProduct = await this.prisma.product.findFirst({
          where: { workspaceId },
          select: { id: true },
        });
        pid = firstProduct?.id ?? '';
      }
      if (!pid) {
        return { success: false, error: 'Nenhum produto no workspace. Crie um produto primeiro.' };
      }
      const c = await this.prisma.productCoupon.create({
        data: {
          productId: pid,
          code: this.str(args.code),
          discountType: this.str(args.discountType) === 'FIXED' ? 'FIXED' : 'PERCENT',
          discountValue: this.num(args.discountValue),
          maxUses: this.num(args.usageLimit) || null,
          expiresAt: args.expiresInDays ? new Date(Date.now() + (this.num(args.expiresInDays) * 86400000)) : null,
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

  async toolListCheckouts(workspaceId: string, _args: UnknownRecord) {
    try {
      const checkouts = await this.prisma.productCheckout.findMany({
        where: { product: { workspaceId } },
        select: { id: true, name: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      return { success: true, checkouts };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Erro' };
    }
  }

  async toolDeleteCoupon(workspaceId: string, args: UnknownRecord) {
    let couponId = this.str(args.couponId);
    // Support deletion by coupon code
    if (!couponId && (args.couponCode || args.code)) {
      const c = await this.prisma.productCoupon.findFirst({
        where: {
          code: this.str(args.couponCode || args.code),
          product: { workspaceId },
        },
        select: { id: true },
      });
      couponId = c?.id ?? '';
    }
    if (!couponId) {
      return { success: false, error: 'Cupom nao encontrado. Informe o codigo ou ID do cupom.' };
    }
    try {
      await this.prisma.productCoupon.delete({ where: { id: couponId } });
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Erro' };
    }
  }

  async toolUpdateCoupon(workspaceId: string, args: UnknownRecord) {
    const code = this.str(args.code || args.couponCode);
    if (!code) {return { success: false, error: 'Codigo do cupom necessario.' };}
    try {
      const c = await this.prisma.productCoupon.findFirst({
        where: { code, product: { workspaceId } },
        select: { id: true },
      });
      if (!c) {return { success: false, error: 'Cupom nao encontrado.' };}
      const data: Record<string, unknown> = {};
      if (args.discountValue !== undefined) {data.discountValue = Number(args.discountValue);}
      if (args.discountType) {data.discountType = args.discountType;}
      if (args.usageLimit !== undefined) {data.usageLimit = Number(args.usageLimit);}
      if (args.expiresInDays !== undefined) {
        const d = new Date(); d.setDate(d.getDate() + Number(args.expiresInDays));
        data.expiresAt = d;
      }
      await this.prisma.productCoupon.update({ where: { id: c.id }, data });
      return { success: true, coupon: { code, ...data } };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Erro ao atualizar cupom' };
    }
  }



  async toolDeletePlan(_workspaceId: string, args: UnknownRecord) {
    const planName = this.str(args.planName);
    const productName = this.str(args.productName);
    if (!planName && !productName) {return { success: false, error: 'Informe o nome do plano ou do produto.' };}
    try {
      let plan;
      if (planName) {
        plan = await this.prisma.productPlan.findFirst({
          where: { name: { contains: planName, mode: 'insensitive' }, product: { workspaceId: _workspaceId } },
          select: { id: true, name: true },
        });
      }
      if (!plan && productName) {
        plan = await this.prisma.productPlan.findFirst({
          where: { product: { workspaceId: _workspaceId, name: { contains: productName, mode: 'insensitive' } } },
          select: { id: true, name: true },
        });
      }
      if (!plan) {return { success: false, error: 'Plano nao encontrado. Verifique o nome ou use "plano" como termo de busca.' };}
      await this.prisma.productPlan.delete({ where: { id: plan.id } });
      return { success: true, message: `Plano "${plan.name}" removido.` };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Erro ao deletar plano.' };
    }
  }

  async toolDeleteCheckout(_workspaceId: string, args: UnknownRecord) {
    const checkoutName = this.str(args.checkoutName);
    const productName = this.str(args.productName);
    if (!checkoutName && !productName) {return { success: false, error: 'Informe o nome do checkout ou do produto.' };}
    try {
      let co;
      if (checkoutName) {
        co = await this.prisma.productCheckout.findFirst({
          where: { name: { contains: checkoutName, mode: 'insensitive' }, product: { workspaceId: _workspaceId } },
          select: { id: true, name: true },
        });
      }
      if (!co && productName) {
        co = await this.prisma.productCheckout.findFirst({
          where: { product: { workspaceId: _workspaceId, name: { contains: productName, mode: 'insensitive' } } },
          select: { id: true, name: true },
        });
      }
      if (!co) {return { success: false, error: 'Checkout nao encontrado. Verifique o nome ou use o nome do produto.' };}
      await this.prisma.productCheckout.delete({ where: { id: co.id } });
      return { success: true, message: `Checkout "${co.name}" removido.` };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Erro ao deletar checkout.' };
    }
  }

  async toolAddUrl(workspaceId: string, args: UnknownRecord) {
    const productName = this.str(args.productName);
    const url = this.str(args.url);
    const label = this.str(args.label);
    if (!productName) {return { success: false, error: 'Informe o nome do produto.' };}
    if (!url) {return { success: false, error: 'Informe a URL (ex: https://...).' };}
    try {
      let pid = this.str(args.productId);
      if (!pid) {
        const p = await this.prisma.product.findFirst({
          where: { workspaceId, name: { contains: productName, mode: 'insensitive' } },
          select: { id: true },
        });
        pid = p?.id ?? '';
      }
      // Accent fallback
      if (!pid) {
        const stripped = productName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const all = await this.prisma.product.findMany({ where: { workspaceId }, select: { id: true, name: true }, take: 200 });
        const found = all.find((prod) => prod.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(stripped.toLowerCase()));
        pid = found?.id ?? '';
      }
      if (!pid) {return { success: false, error: 'Produto nao encontrado.' };}
      await this.prisma.productUrl.create({
        data: {
          productId: pid,
          url,
          description: label || url,
          isPrivate: args.isPrivate === true,
        },
      });
      return { success: true, message: `URL "${label || url}" adicionada ao produto.` };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Erro ao adicionar URL.' };
    }
  }

  async toolUpdateUrl(workspaceId: string, args: UnknownRecord) {
    const productName = this.str(args.productName);
    const label = this.str(args.label || args.urlLabel);
    const newUrl = this.str(args.url);
    if (!label) {return { success: false, error: 'Informe a descricao ou label da URL.' };}
    try {
      let pid = this.str(args.productId);
      if (!pid && productName) {
        const p = await this.prisma.product.findFirst({
          where: { workspaceId, name: { contains: productName, mode: 'insensitive' } },
          select: { id: true },
        });
        pid = p?.id ?? '';
      }
        const whereClause: Record<string, unknown> = { description: { contains: label, mode: 'insensitive' } };
      if (pid) {whereClause.productId = pid;}
      const existing = await this.prisma.productUrl.findFirst({ where: whereClause as never, select: { id: true } });
      if (!existing) {return { success: false, error: 'URL nao encontrada.' };}
      const data: Record<string, unknown> = {};
      if (newUrl) {data.url = newUrl;}
      if (args.label !== undefined) {data.description = this.str(args.label);}
      if (args.isPrivate !== undefined) {data.isPrivate = args.isPrivate === true;}
      await this.prisma.productUrl.update({ where: { id: existing.id }, data: data as never });
      return { success: true, message: 'URL atualizada.' };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Erro ao atualizar URL.' };
    }
  }

  async toolDeleteUrl(workspaceId: string, args: UnknownRecord) {
    const label = this.str(args.urlLabel);
    const url = this.str(args.url);
    if (!label && !url) {return { success: false, error: 'Informe a descricao ou URL para remover.' };}
    try {
      let target = null;
      // Try by label first
      if (label) {
        target = await this.prisma.productUrl.findFirst({
          where: { description: { contains: label, mode: 'insensitive' }, product: { workspaceId } },
          select: { id: true, url: true },
        });
      }
      // If not found by label, try by URL
      if (!target && url) {
        target = await this.prisma.productUrl.findFirst({
          where: { url: { contains: url }, product: { workspaceId } },
          select: { id: true, url: true },
        });
      }
      if (!target) {return { success: false, error: 'URL nao encontrada.' };}
      await this.prisma.productUrl.delete({ where: { id: target.id } });
      return { success: true, message: 'URL removida.' };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Erro ao deletar URL.' };
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
        boletoPdf: null, // PDF generation requires pdfkit library
        boletoHtml: `<div style="font-family:monospace;padding:20px;border:1px solid #000">
<h3>BOLETO BANCARIO</h3>
<p>Valor: R$ ${amount.toFixed(2)}</p>
<p>Codigo: 34191.79001 01043.510047 91020.150008 9 ${String(Math.round(amount * 100)).padStart(10, '0')}</p>
<p>Beneficiario: ${this.str(args.customerPhone || args.productName)}</p>
<p>Vencimento: ${new Date(Date.now() + 3*86400000).toLocaleDateString('pt-BR')}</p>
</div>`,
        amount,
      };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Erro' };
    }
  }
}
