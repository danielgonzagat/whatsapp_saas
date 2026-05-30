import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { requireWorkspaceProduct, resolveAttributionModel } from './affiliate-helpers';
import type { AffiliateChatResult } from './affiliate-helpers';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AffiliateService {
  constructor(private readonly prisma: PrismaService) {}

  /** @see requireWorkspaceProduct — workspace-isolated product resolver. */
  private requireProduct(workspaceId: string, productId: unknown): Promise<{ id: string }> {
    return requireWorkspaceProduct(this.prisma, workspaceId, productId);
  }

  /** Liga/desliga o programa de afiliados de um produto. */
  async toggleProgram(
    workspaceId: string,
    args: { productId: string; enabled: boolean },
  ): Promise<AffiliateChatResult> {
    const { id } = await this.requireProduct(workspaceId, args.productId);
    if (typeof args.enabled !== 'boolean') {
      throw new BadRequestException('enabled deve ser booleano');
    }
    await this.prisma.product.update({
      where: { id },
      data: { affiliateEnabled: args.enabled },
    });
    return { success: true, productId: id, enabled: args.enabled };
  }

  /** Define se o produto aparece (ou não) na vitrine de afiliados. */
  async setVisibility(
    workspaceId: string,
    args: { productId: string; visible: boolean },
  ): Promise<AffiliateChatResult> {
    const { id } = await this.requireProduct(workspaceId, args.productId);
    if (typeof args.visible !== 'boolean') {
      throw new BadRequestException('visible deve ser booleano');
    }
    await this.prisma.product.update({
      where: { id },
      data: { affiliateVisible: args.visible },
    });
    return { success: true, productId: id, visible: args.visible };
  }

  /** Liga/desliga a aprovação automática de novos afiliados. */
  async setAutoApproval(
    workspaceId: string,
    args: { productId: string; autoApprove: boolean },
  ): Promise<AffiliateChatResult> {
    const { id } = await this.requireProduct(workspaceId, args.productId);
    if (typeof args.autoApprove !== 'boolean') {
      throw new BadRequestException('autoApprove deve ser booleano');
    }
    await this.prisma.product.update({
      where: { id },
      data: { affiliateAutoApprove: args.autoApprove },
    });
    return { success: true, productId: id, autoApprove: args.autoApprove };
  }

  /** Define se o afiliado pode acessar os dados dos compradores. */
  async setDataAccess(
    workspaceId: string,
    args: { productId: string; accessData: boolean },
  ): Promise<AffiliateChatResult> {
    const { id } = await this.requireProduct(workspaceId, args.productId);
    if (typeof args.accessData !== 'boolean') {
      throw new BadRequestException('accessData deve ser booleano');
    }
    await this.prisma.product.update({
      where: { id },
      data: { affiliateAccessData: args.accessData },
    });
    return { success: true, productId: id, accessData: args.accessData };
  }

  /** Define se o afiliado pode acessar carrinhos abandonados. */
  async setAbandonmentAccess(
    workspaceId: string,
    args: { productId: string; accessAbandoned: boolean },
  ): Promise<AffiliateChatResult> {
    const { id } = await this.requireProduct(workspaceId, args.productId);
    if (typeof args.accessAbandoned !== 'boolean') {
      throw new BadRequestException('accessAbandoned deve ser booleano');
    }
    await this.prisma.product.update({
      where: { id },
      data: { affiliateAccessAbandoned: args.accessAbandoned },
    });
    return { success: true, productId: id, accessAbandoned: args.accessAbandoned };
  }

  /** Define se a comissão incide sobre a primeira parcela. */
  async setFirstInstallmentCommission(
    workspaceId: string,
    args: { productId: string; firstInstallment: boolean },
  ): Promise<AffiliateChatResult> {
    const { id } = await this.requireProduct(workspaceId, args.productId);
    if (typeof args.firstInstallment !== 'boolean') {
      throw new BadRequestException('firstInstallment deve ser booleano');
    }
    await this.prisma.product.update({
      where: { id },
      data: { affiliateFirstInstallment: args.firstInstallment },
    });
    return { success: true, productId: id, firstInstallment: args.firstInstallment };
  }

  /** Define o modelo de atribuição (primeiro/último clique/proporcional). */
  async setAttributionModel(
    workspaceId: string,
    args: { productId: string; model: string },
  ): Promise<AffiliateChatResult> {
    const { id } = await this.requireProduct(workspaceId, args.productId);
    const canonical = resolveAttributionModel(args.model);
    if (!canonical) {
      throw new BadRequestException(
        'model deve ser primeiro clique, último clique ou proporcional',
      );
    }
    await this.prisma.product.update({
      where: { id },
      data: { commissionType: canonical },
    });
    return { success: true, productId: id, model: canonical };
  }

  /** Define a janela de cookie de atribuição (em dias). */
  async setCookieDays(
    workspaceId: string,
    args: { productId: string; cookieDays: number },
  ): Promise<AffiliateChatResult> {
    const { id } = await this.requireProduct(workspaceId, args.productId);
    if (!Number.isFinite(args.cookieDays) || args.cookieDays < 0 || args.cookieDays > 3650) {
      throw new BadRequestException('cookieDays deve estar entre 0 e 3650');
    }
    await this.prisma.product.update({
      where: { id },
      data: { commissionCookieDays: Math.trunc(args.cookieDays) },
    });
    return { success: true, productId: id, cookieDays: Math.trunc(args.cookieDays) };
  }

  /** Define o percentual de comissão dos afiliados. */
  async setCommissionPct(
    workspaceId: string,
    args: { productId: string; commissionPercent: number },
  ): Promise<AffiliateChatResult> {
    const { id } = await this.requireProduct(workspaceId, args.productId);
    if (
      !Number.isFinite(args.commissionPercent) ||
      args.commissionPercent < 0 ||
      args.commissionPercent > 100
    ) {
      throw new BadRequestException('commissionPercent deve estar entre 0 e 100');
    }
    await this.prisma.product.update({
      where: { id },
      data: { commissionPercent: args.commissionPercent },
    });
    return { success: true, productId: id, commissionPercent: args.commissionPercent };
  }

  /** Lista os afiliados do workspace (opcionalmente filtrados por produto). */
  async listForChat(
    workspaceId: string,
    args?: { productId?: string },
  ): Promise<AffiliateChatResult> {
    const partners = await this.prisma.affiliatePartner.findMany({ where: { workspaceId } });
    const productId = args?.productId;
    const filtered = productId
      ? partners.filter((p) => {
          const ids: unknown = p.productIds;
          return Array.isArray(ids) && ids.includes(productId);
        })
      : partners;
    return {
      success: true,
      ...(productId ? { productId } : {}),
      affiliates: filtered.map((p) => ({
        id: p.id,
        email: p.partnerEmail,
        commissionRate: p.commissionRate,
        status: p.status,
      })),
      total: filtered.length,
    };
  }

  /**
   * Lista os produtores (merchants) cujos produtos este workspace promove
   * como afiliado, a partir das solicitações de afiliação registradas.
   */
  async listMerchants(workspaceId: string): Promise<AffiliateChatResult> {
    const requests = await this.prisma.affiliateRequest.findMany({
      where: { affiliateWorkspaceId: workspaceId, status: 'APPROVED' },
      include: { affiliateProduct: { select: { productId: true } } },
    });

    const productIds = requests
      .map((r) => r.affiliateProduct?.productId)
      .filter((id): id is string => typeof id === 'string');

    const products =
      productIds.length > 0
        ? await this.prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true, workspaceId: true },
          })
        : [];

    const merchantMap = new Map<string, { workspaceId: string; products: string[] }>();
    for (const product of products) {
      const entry = merchantMap.get(product.workspaceId) ?? {
        workspaceId: product.workspaceId,
        products: [],
      };
      entry.products.push(product.name);
      merchantMap.set(product.workspaceId, entry);
    }

    return {
      success: true,
      merchants: [...merchantMap.values()],
      total: merchantMap.size,
    };
  }

  /** Atualiza os termos/regulamento do programa de afiliados do produto. */
  async updateTerms(
    workspaceId: string,
    args: { productId: string; terms: string },
  ): Promise<AffiliateChatResult> {
    const { id } = await this.requireProduct(workspaceId, args.productId);
    if (typeof args.terms !== 'string' || args.terms.trim().length === 0) {
      throw new BadRequestException('terms é obrigatório');
    }
    await this.prisma.product.update({
      where: { id },
      data: { affiliateTerms: args.terms.trim() },
    });
    return { success: true, productId: id };
  }

  /**
   * Gerencia a coprodução de um produto adicionando ou removendo uma divisão
   * de comissão (ProductCommission) com papel COPRODUCER para um parceiro.
   *
   * action='add' cria/atualiza o split; action='remove' apaga o split do parceiro.
   */
  async manageCoproduction(
    workspaceId: string,
    args: {
      productId: string;
      action?: 'add' | 'remove';
      agentEmail: string;
      agentName?: string;
      percentage?: number;
    },
  ): Promise<AffiliateChatResult> {
    const { id } = await this.requireProduct(workspaceId, args.productId);
    const action = args.action ?? 'add';
    if (typeof args.agentEmail !== 'string' || args.agentEmail.trim().length === 0) {
      throw new BadRequestException('agentEmail é obrigatório');
    }
    const agentEmail = args.agentEmail.trim();

    if (action === 'remove') {
      const removed = await this.prisma.productCommission.deleteMany({
        where: { productId: id, role: 'COPRODUCER', agentEmail },
      });
      return { success: true, productId: id, action, removed: removed.count };
    }

    if (
      args.percentage === undefined ||
      !Number.isFinite(args.percentage) ||
      args.percentage <= 0 ||
      args.percentage > 100
    ) {
      throw new BadRequestException('percentage deve estar entre 0 e 100');
    }

    const existing = await this.prisma.productCommission.findFirst({
      where: { productId: id, role: 'COPRODUCER', agentEmail },
      select: { id: true },
    });

    const commission = existing
      ? await this.prisma.productCommission.update({
          where: { id: existing.id },
          data: { percentage: args.percentage, agentName: args.agentName ?? null },
        })
      : await this.prisma.productCommission.create({
          data: {
            productId: id,
            role: 'COPRODUCER',
            percentage: args.percentage,
            agentEmail,
            agentName: args.agentName ?? null,
          },
        });

    return { success: true, productId: id, action, commissionId: commission.id };
  }

  async getConfig(
    workspaceId: string,
    productId: string,
  ): Promise<{ enabled: boolean; commission: number; rules: Record<string, unknown> }> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, workspaceId },
    });

    if (!product) {
      throw new NotFoundException('Product not found in your workspace');
    }

    return {
      enabled: product.affiliateEnabled,
      commission: product.commissionPercent,
      rules: {
        autoApprove: product.affiliateAutoApprove,
        visible: product.affiliateVisible,
        accessData: product.affiliateAccessData,
        accessAbandoned: product.affiliateAccessAbandoned,
        firstInstallment: product.affiliateFirstInstallment,
        commissionType: product.commissionType,
        cookieDays: product.commissionCookieDays,
      },
    };
  }

  async configure(
    workspaceId: string,
    productId: string,
    dto: { enabled?: boolean; commission?: number; rules?: object },
  ): Promise<{ updated: true }> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, workspaceId },
    });

    if (!product) {
      throw new NotFoundException('Product not found in your workspace');
    }

    const rules = (dto.rules ?? {}) as Record<string, unknown>;

    await this.prisma.product.update({
      where: { id: productId },
      data: {
        ...(dto.enabled !== undefined && { affiliateEnabled: dto.enabled }),
        ...(dto.commission !== undefined && { commissionPercent: dto.commission }),
        ...(typeof rules.autoApprove === 'boolean' && { affiliateAutoApprove: rules.autoApprove }),
        ...(typeof rules.visible === 'boolean' && { affiliateVisible: rules.visible }),
        ...(typeof rules.accessData === 'boolean' && { affiliateAccessData: rules.accessData }),
        ...(typeof rules.accessAbandoned === 'boolean' && {
          affiliateAccessAbandoned: rules.accessAbandoned,
        }),
        ...(typeof rules.firstInstallment === 'boolean' && {
          affiliateFirstInstallment: rules.firstInstallment,
        }),
        ...(typeof rules.commissionType === 'string' && { commissionType: rules.commissionType }),
        ...(typeof rules.cookieDays === 'number' && { commissionCookieDays: rules.cookieDays }),
      },
    });

    return { updated: true };
  }

  async list(
    workspaceId: string,
    productId?: string,
  ): Promise<Array<{ id: string; email: string; commissionRate: number; status: string }>> {
    const partners = await this.prisma.affiliatePartner.findMany({
      where: { workspaceId },
    });

    const filtered = productId
      ? partners.filter((p) => {
          const ids: unknown = p.productIds;
          if (Array.isArray(ids)) {
            return ids.includes(productId);
          }
          return false;
        })
      : partners;

    return filtered.map((p) => ({
      id: p.id,
      email: p.partnerEmail,
      commissionRate: p.commissionRate,
      status: p.status,
    }));
  }
}
