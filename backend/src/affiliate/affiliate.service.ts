import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AffiliateService {
  constructor(private readonly prisma: PrismaService) {}

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
