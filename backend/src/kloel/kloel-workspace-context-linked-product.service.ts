import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KloelContextFormatter } from './kloel-context-formatter';
import type { KloelContextFormatterLimits } from './kloel-context-formatter.types';
import { buildWorkspaceProductSelect } from './kloel-workspace-context-product-select';
import type { WorkspaceProductContextInput } from './kloel-workspace-context.types';

/**
 * Handles linked-product context building (owned + affiliate) for AI prompts.
 * Extracted from KloelWorkspaceContextService to keep that file under 400 lines.
 *
 * Callers must pass the same `limits` object used by the parent context service
 * so that plan/coupon/review limits stay consistent.
 */
@Injectable()
export class KloelWorkspaceContextLinkedProductService {
  constructor(private readonly prisma: PrismaService) {}

  private async fetchWorkspaceProductPromptRecord(
    workspaceId: string,
    productId: string,
    limits: KloelContextFormatterLimits,
  ) {
    return this.prisma.product.findFirst({
      where: { id: productId, workspaceId },
      select: buildWorkspaceProductSelect(limits),
    });
  }

  async buildLinkedProductPromptContext(
    workspaceId: string,
    limits: KloelContextFormatterLimits,
    linkedProduct:
      | {
          id?: string;
          source?: 'owned' | 'affiliate';
          productId?: string | null;
          affiliateProductId?: string | null;
        }
      | null
      | undefined,
  ): Promise<string | null> {
    if (!linkedProduct) return null;
    const linkedSource = linkedProduct.source === 'affiliate' ? 'affiliate' : 'owned';

    if (linkedSource === 'owned') {
      const ownedProductId = String(linkedProduct.productId || linkedProduct.id || '').trim();
      if (!ownedProductId) return null;
      const product = await this.fetchWorkspaceProductPromptRecord(
        workspaceId,
        ownedProductId,
        limits,
      );
      if (!product) return null;
      const contextFormatter = new KloelContextFormatter(limits);
      return [
        'PRODUTO VINCULADO AO PROMPT:',
        '- Origem: catálogo próprio do workspace',
        contextFormatter.buildWorkspaceProductContext(product, 0),
      ].join('\n');
    }

    const affiliateProductId = String(
      linkedProduct.affiliateProductId || linkedProduct.id || '',
    ).trim();
    if (!affiliateProductId) return null;

    const [request, link] = await Promise.all([
      this.prisma.affiliateRequest.findFirst({
        where: { affiliateWorkspaceId: workspaceId, affiliateProductId },
        include: { affiliateProduct: true },
      }),
      this.prisma.affiliateLink.findFirst({
        where: { affiliateWorkspaceId: workspaceId, affiliateProductId },
        include: { affiliateProduct: true },
      }),
    ]);

    const affiliateProductRecord = request?.affiliateProduct || link?.affiliateProduct;
    const affiliateProduct = affiliateProductRecord as Record<string, unknown> | null;
    const contextFormatter = new KloelContextFormatter(limits);
    const affiliateProductProductId =
      typeof affiliateProduct?.productId === 'string' ? affiliateProduct.productId : null;
    const targetProductId = String(
      affiliateProductProductId || linkedProduct.productId || '',
    ).trim();
    const producerWorkspaceId = targetProductId
      ? await this.prisma.product
          .findFirst({ where: { id: targetProductId }, select: { workspaceId: true } })
          .then((p) => p?.workspaceId || null)
      : null;
    const catalogProduct =
      producerWorkspaceId && targetProductId
        ? await this.fetchWorkspaceProductPromptRecord(
            producerWorkspaceId,
            targetProductId,
            limits,
          ).catch(() => null)
        : null;

    const affiliateLines = [
      'PRODUTO VINCULADO AO PROMPT:',
      '- Origem: catálogo de afiliados do workspace',
      request?.status ? `- Status da afiliação: ${request.status}` : null,
      affiliateProduct?.commissionPct
        ? `- Comissão disponível: ${Number(affiliateProduct.commissionPct)}%`
        : null,
      typeof affiliateProduct?.approvalMode === 'string'
        ? `- Modo de aprovação: ${affiliateProduct.approvalMode}`
        : null,
      link?.code ? `- Código de afiliado: ${link.code}` : null,
      Number.isFinite(Number(link?.clicks)) ? `- Cliques do link: ${Number(link?.clicks)}` : null,
      Number.isFinite(Number(link?.sales)) ? `- Vendas do link: ${Number(link?.sales)}` : null,
      catalogProduct
        ? contextFormatter.buildWorkspaceProductContext(
            catalogProduct as WorkspaceProductContextInput,
            0,
          )
        : null,
    ].filter(Boolean);

    return affiliateLines.length > 2 ? affiliateLines.join('\n') : null;
  }
}
