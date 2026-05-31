import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalesService } from '../sales/sales.service';

import type { UnknownRecord } from '../common/types';
import { ProductCouponDomainService } from './product-coupon-domain.service';
import {
  boletoBuyerDataFromArgs,
  buildBoletoSuccessResponse,
  buildCreateCheckoutConfig,
  buildCreateCouponData,
  buildCreatePlanData,
  buildUpdateCouponData,
  buildUpdatePlanData,
  findCheckoutByNames,
  findPlanByNames,
  missingStringInputs,
  parseStr,
  resolveProductIdByName,
  resolveProductIdWithAccentFallback,
} from './kloel-product-sub-resource-tools.helpers';
import {
  buildCheckoutProjection,
  buildCouponCreateProjection,
  buildCreateUrlData,
  buildListCheckoutsArgs,
  buildPlanCreateProjection,
  buildPlanUpdateProjection,
  buildUpdateCheckoutData,
  buildUpdateUrlData,
  buildUpdateUrlWhereClause,
  findProductIdByPartialName,
  findUrlByLabelOrUrl,
  readCouponCode,
  readUrlUpdateLabel,
  resolveCheckoutIdFromArgs,
  resolveFallbackProductIdForCoupon,
  resolvePlanIdFromArgs,
} from './kloel-product-sub-resource-tools.service.helpers';

export interface ProductSubResourceToolResult {
  [key: string]: unknown;
  success: boolean;
  message?: string;
  error?: string;
}

@Injectable()
export class KloelProductSubResourceToolsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly productCouponDomain?: ProductCouponDomainService,
    @Optional() private readonly salesService?: SalesService,
  ) {}

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
    return parseStr(v, fb);
  }

  async toolCreatePlan(workspaceId: string, args: UnknownRecord) {
    try {
      const pid = await resolveProductIdByName(this.prisma, workspaceId, args);
      if (!pid) {
        return { success: false, error: 'Produto nao encontrado' };
      }
      const plan = await this.prisma.productPlan.create({ data: buildCreatePlanData(pid, args) });
      return { success: true, plan: buildPlanCreateProjection(plan) };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Erro' };
    }
  }

  async toolUpdatePlan(_workspaceId: string, args: UnknownRecord) {
    const planId = await resolvePlanIdFromArgs(this.prisma, _workspaceId, args);
    if (!planId) {
      return { success: false, error: 'planId required' };
    }
    try {
      const plan = await this.prisma.productPlan.update({
        where: { id: planId },
        data: buildUpdatePlanData(args),
      });
      return {
        success: true,
        plan: buildPlanUpdateProjection(plan),
      };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Erro' };
    }
  }

  async toolCreateCheckout(workspaceId: string, args: UnknownRecord) {
    try {
      const pid = await resolveProductIdByName(this.prisma, workspaceId, args);
      if (!pid) {
        return { success: false, error: 'Produto nao encontrado' };
      }
      const co = await this.prisma.productCheckout.create({
        data: {
          productId: pid,
          name: this.str(args.checkoutName || args.planName, 'Checkout'),
          config: buildCreateCheckoutConfig(args),
        },
      });
      return { success: true, checkout: buildCheckoutProjection(co) };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Erro' };
    }
  }

  async toolUpdateCheckout(_workspaceId: string, args: UnknownRecord) {
    const checkoutId = await resolveCheckoutIdFromArgs(this.prisma, _workspaceId, args);
    if (!checkoutId) {
      return { success: false, error: 'checkoutId required' };
    }
    try {
      const co = await this.prisma.productCheckout.update({
        where: { id: checkoutId },
        data: buildUpdateCheckoutData(args),
      });
      return { success: true, checkout: buildCheckoutProjection(co) };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Erro' };
    }
  }

  async toolCreateCoupon(workspaceId: string, args: UnknownRecord) {
    try {
      let pid = await resolveProductIdByName(this.prisma, workspaceId, args);
      if (!pid) {
        pid = await resolveFallbackProductIdForCoupon(this.prisma, workspaceId);
      }
      if (!pid) {
        return { success: false, error: 'Nenhum produto no workspace. Crie um produto primeiro.' };
      }
      const c = await this.prisma.productCoupon.create({
        data: buildCreateCouponData(pid, args),
      });
      return { success: true, coupon: buildCouponCreateProjection(c) };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Erro' };
    }
  }

  async toolListCoupons(workspaceId: string, args: UnknownRecord) {
    try {
      const pid = await resolveProductIdByName(this.prisma, workspaceId, args);
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
      const checkouts = await this.prisma.productCheckout.findMany(
        buildListCheckoutsArgs(workspaceId),
      );
      return { success: true, checkouts };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Erro' };
    }
  }

  async toolDeleteCoupon(workspaceId: string, args: UnknownRecord) {
    const couponId = this.str(args.couponId);
    const couponCode = this.str(args.couponCode || args.code);
    const notFoundMessage = 'Cupom nao encontrado. Informe o codigo ou ID do cupom.';

    if (this.productCouponDomain) {
      try {
        const deleted = await this.productCouponDomain.deleteProductCoupon({
          workspaceId,
          couponId,
          couponCode,
          deletedBy: 'kloel-chat',
          notFoundMessage,
        });
        return {
          success: true,
          couponId: deleted.id,
          productId: deleted.productId,
        };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : 'Erro' };
      }
    }

    // Fallback for legacy callers that bootstrap the service without
    // injecting `productCouponDomain` (older module wiring). Resolve the
    // coupon by code when the explicit id is absent, then delete.
    let resolvedCouponId = couponId;
    if (!resolvedCouponId && couponCode) {
      const c = await this.prisma.productCoupon.findFirst({
        where: { code: couponCode, product: { workspaceId } },
        select: { id: true },
      });
      resolvedCouponId = c?.id ?? '';
    }
    if (!resolvedCouponId) {
      return { success: false, error: notFoundMessage };
    }
    try {
      await this.prisma.productCoupon.delete({ where: { id: resolvedCouponId } });
      return {
        success: true,
        couponId: resolvedCouponId,
      };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Erro' };
    }
  }

  async toolUpdateCoupon(workspaceId: string, args: UnknownRecord) {
    const code = readCouponCode(args);
    if (!code) {
      return { success: false, error: 'Codigo do cupom necessario.' };
    }
    try {
      const c = await this.prisma.productCoupon.findFirst({
        where: { code, product: { workspaceId } },
        select: { id: true },
      });
      if (!c) {
        return { success: false, error: 'Cupom nao encontrado.' };
      }
      const data = buildUpdateCouponData(args);
      await this.prisma.productCoupon.update({ where: { id: c.id }, data });
      return { success: true, coupon: { code, ...data } };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Erro ao atualizar cupom',
      };
    }
  }

  async toolDeletePlan(_workspaceId: string, args: UnknownRecord) {
    const planName = this.str(args.planName);
    const productName = this.str(args.productName);
    if (!planName && !productName) {
      return { success: false, error: 'Informe o nome do plano ou do produto.' };
    }
    try {
      const plan = await findPlanByNames(this.prisma, _workspaceId, planName, productName);
      if (!plan) {
        return {
          success: false,
          error: 'Plano nao encontrado. Verifique o nome ou use "plano" como termo de busca.',
        };
      }
      await this.prisma.productPlan.delete({ where: { id: plan.id } });
      return { success: true, message: `Plano "${plan.name}" removido.` };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Erro ao deletar plano.' };
    }
  }

  async toolDeleteCheckout(_workspaceId: string, args: UnknownRecord) {
    const checkoutName = this.str(args.checkoutName);
    const productName = this.str(args.productName);
    if (!checkoutName && !productName) {
      return { success: false, error: 'Informe o nome do checkout ou do produto.' };
    }
    try {
      const co = await findCheckoutByNames(this.prisma, _workspaceId, checkoutName, productName);
      if (!co) {
        return {
          success: false,
          error: 'Checkout nao encontrado. Verifique o nome ou use o nome do produto.',
        };
      }
      await this.prisma.productCheckout.delete({ where: { id: co.id } });
      return { success: true, message: `Checkout "${co.name}" removido.` };
    } catch (e: unknown) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Erro ao deletar checkout.',
      };
    }
  }

  async toolAddUrl(workspaceId: string, args: UnknownRecord) {
    const productName = this.str(args.productName);
    const url = this.str(args.url);
    const label = this.str(args.label);
    if (!productName) {
      return { success: false, error: 'Informe o nome do produto.' };
    }
    if (!url) {
      return { success: false, error: 'Informe a URL (ex: https://...).' };
    }
    try {
      const pid = await resolveProductIdWithAccentFallback(this.prisma, workspaceId, args);
      if (!pid) {
        return { success: false, error: 'Produto nao encontrado.' };
      }
      await this.prisma.productUrl.create({ data: buildCreateUrlData(pid, args) });
      return { success: true, message: `URL "${label || url}" adicionada ao produto.` };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Erro ao adicionar URL.' };
    }
  }

  async toolUpdateUrl(workspaceId: string, args: UnknownRecord) {
    const productName = this.str(args.productName);
    const label = readUrlUpdateLabel(args);
    if (!label) {
      return { success: false, error: 'Informe a descricao ou label da URL.' };
    }
    try {
      const explicitProductId = this.str(args.productId);
      const pid =
        explicitProductId ||
        (await findProductIdByPartialName(this.prisma, workspaceId, productName));
      const existing = await this.prisma.productUrl.findFirst({
        where: buildUpdateUrlWhereClause(label, pid),
        select: { id: true },
      });
      if (!existing) {
        return { success: false, error: 'URL nao encontrada.' };
      }
      await this.prisma.productUrl.update({
        where: { id: existing.id },
        data: buildUpdateUrlData(args),
      });
      return { success: true, message: 'URL atualizada.' };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Erro ao atualizar URL.' };
    }
  }

  async toolDeleteUrl(workspaceId: string, args: UnknownRecord) {
    const label = this.str(args.urlLabel);
    const url = this.str(args.url);
    if (!label && !url) {
      return { success: false, error: 'Informe a descricao ou URL para remover.' };
    }
    try {
      const target = await findUrlByLabelOrUrl(this.prisma, workspaceId, label, url);
      if (!target) {
        return { success: false, error: 'URL nao encontrada.' };
      }
      await this.prisma.productUrl.delete({ where: { id: target.id } });
      return { success: true, message: 'URL removida.' };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Erro ao deletar URL.' };
    }
  }
  async toolGenerateBoleto(
    workspaceId: string,
    args: UnknownRecord,
  ): Promise<ProductSubResourceToolResult> {
    const missing = missingStringInputs(args, [
      'productId',
      'planId',
      'customerName',
      'customerEmail',
      'customerCpf',
      'customerPhone',
      'customerZipCode',
      'customerStreet',
      'customerNumber',
      'customerCity',
      'customerState',
    ]);
    if (missing.length > 0) {
      return {
        success: false,
        error: 'sales_create_boleto_inputs_required',
        message: `Dados faltantes para criar boleto real: ${missing.join(', ')}`,
        capabilityId: 'sales.create_boleto',
        missingInputs: missing,
        outputs: {},
        domainEvents: [],
      };
    }
    if (!this.salesService) {
      return {
        success: false,
        error: 'sales_service_unavailable',
        capabilityId: 'sales.create_boleto',
        outputs: {},
        domainEvents: [],
      };
    }

    const boletoResult = await this.salesService.createBoletoOrder(
      workspaceId,
      this.str(args.productId).trim(),
      this.str(args.planId).trim(),
      boletoBuyerDataFromArgs(args),
    );

    return buildBoletoSuccessResponse(boletoResult);
  }
}
