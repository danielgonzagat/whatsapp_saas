import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../../common/interfaces';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PRODUCT_COMMISSION_TYPE_VALUES,
  buildAffiliateProductData,
  buildAffiliateSummary,
  generateAffiliatePublicCode,
  recalculateAffiliateProductCounters,
} from './helpers/affiliate.helpers';
import {
  LooseObject,
  assertPercentageRange,
  ensureWorkspaceProductAccess,
  getWorkspaceId,
  normalizeOptionalText,
  parseNumber,
  removeUndefined,
  safeStr,
} from './helpers/common.helpers';

interface AffiliateConfigContext {
  commissionType: string | undefined;
  nextCommissionType: string | undefined;
  commissionLastClickPercent: number | undefined;
  commissionOtherClicksPercent: number | undefined;
  shouldTouchProportionalWeights: boolean;
}

function buildAffiliateConfigContext(
  body: LooseObject,
  currentProduct: LooseObject,
): AffiliateConfigContext {
  const commissionType =
    body.commissionType !== undefined ? safeStr(body.commissionType).trim() : undefined;
  if (
    commissionType !== undefined &&
    !(PRODUCT_COMMISSION_TYPE_VALUES as readonly string[]).includes(commissionType)
  ) {
    throw new BadRequestException('Tipo de comissionamento é inválido');
  }

  const commissionLastClickPercent = parseNumber(body.commissionLastClickPercent);
  const commissionOtherClicksPercent = parseNumber(body.commissionOtherClicksPercent);
  assertPercentageRange(commissionLastClickPercent, 'O percentual do último clique');
  assertPercentageRange(commissionOtherClicksPercent, 'O percentual dos demais cliques');

  const nextCommissionType =
    commissionType ?? (currentProduct.commissionType as string | undefined);
  const shouldTouchProportionalWeights =
    commissionType !== undefined ||
    body.commissionLastClickPercent !== undefined ||
    body.commissionOtherClicksPercent !== undefined;

  if (nextCommissionType === 'proportional' && shouldTouchProportionalWeights) {
    const total =
      (commissionLastClickPercent ??
        (currentProduct.commissionLastClickPercent as number | null) ??
        70) +
      (commissionOtherClicksPercent ??
        (currentProduct.commissionOtherClicksPercent as number | null) ??
        30);
    if (Math.abs(total - 100) > 0.01) {
      throw new BadRequestException(
        'Na divisão proporcional a soma dos percentuais precisa fechar 100%',
      );
    }
  }

  return {
    commissionType,
    nextCommissionType,
    commissionLastClickPercent,
    commissionOtherClicksPercent,
    shouldTouchProportionalWeights,
  };
}

function resolveProportionalWeight(
  context: AffiliateConfigContext,
  current: number | null | undefined,
  inputValue: number | undefined,
  fallback: number,
): number | null | undefined {
  if (context.nextCommissionType === 'proportional' && context.shouldTouchProportionalWeights) {
    return inputValue ?? current ?? fallback;
  }
  if (context.commissionType !== undefined) {
    return null;
  }
  return undefined;
}

function buildProductPayload(
  body: LooseObject,
  currentProduct: LooseObject,
  context: AffiliateConfigContext,
) {
  const commissionPercent = parseNumber(body.commissionPercent);
  assertPercentageRange(commissionPercent, 'A comissão');

  const commissionCookieDays = parseNumber(body.commissionCookieDays);
  if (
    commissionCookieDays !== undefined &&
    (commissionCookieDays < 1 || commissionCookieDays > 3650)
  ) {
    throw new BadRequestException('O cookie precisa ficar entre 1 e 3650 dias');
  }

  return removeUndefined({
    affiliateEnabled: body.affiliateEnabled,
    affiliateVisible: body.affiliateVisible,
    affiliateAutoApprove: body.affiliateAutoApprove,
    affiliateAccessData: body.affiliateAccessData,
    affiliateAccessAbandoned: body.affiliateAccessAbandoned,
    affiliateFirstInstallment: body.affiliateFirstInstallment,
    commissionType: context.commissionType,
    commissionCookieDays,
    commissionPercent,
    commissionLastClickPercent: resolveProportionalWeight(
      context,
      currentProduct.commissionLastClickPercent as number | null | undefined,
      context.commissionLastClickPercent,
      70,
    ),
    commissionOtherClicksPercent: resolveProportionalWeight(
      context,
      currentProduct.commissionOtherClicksPercent as number | null | undefined,
      context.commissionOtherClicksPercent,
      30,
    ),
    merchandContent:
      body.merchandContent !== undefined ? normalizeOptionalText(body.merchandContent) : undefined,
    affiliateTerms:
      body.affiliateTerms !== undefined ? normalizeOptionalText(body.affiliateTerms) : undefined,
    category: body.category,
    tags: body.tags,
    imageUrl: body.imageUrl,
  });
}

/** Product affiliate controller. */
@Controller('products/:productId/affiliates')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductAffiliateController {
  constructor(private readonly prisma: PrismaService) {}

  /** Get summary. */
  @Get()
  async getSummary(@Param('productId') productId: string, @Request() req: AuthenticatedRequest) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    return buildAffiliateSummary(this.prisma, req, productId);
  }

  /** Update config. */
  @Put()
  async updateConfig(
    @Param('productId') productId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    const currentProduct = await ensureWorkspaceProductAccess(
      this.prisma,
      productId,
      getWorkspaceId(req),
    );

    const context = buildAffiliateConfigContext(body, currentProduct);
    const productPayload = buildProductPayload(body, currentProduct, context);

    const workspaceId = getWorkspaceId(req);
    await this.prisma.product.updateMany({
      where: { id: productId, workspaceId },
      data: productPayload as Prisma.ProductUncheckedUpdateInput,
    });
    const updatedProduct = await this.prisma.product.findFirstOrThrow({
      where: { id: productId, workspaceId },
    });

    const existingAffiliateProduct = await this.prisma.affiliateProduct.findUnique({
      where: { productId },
    });
    const affiliatePayload = buildAffiliateProductData(updatedProduct);
    const shouldPersistAffiliateProduct =
      Boolean(updatedProduct.affiliateEnabled) ||
      Boolean(updatedProduct.affiliateVisible) ||
      Boolean(existingAffiliateProduct);

    if (shouldPersistAffiliateProduct) {
      await this.prisma.affiliateProduct.upsert({
        where: { productId },
        create: {
          productId,
          ...affiliatePayload,
        },
        update: affiliatePayload,
      });
    }

    return buildAffiliateSummary(this.prisma, req, productId);
  }

  /** Approve request. */
  @Post('requests/:requestId/approve')
  async approveRequest(
    @Param('productId') productId: string,
    @Param('requestId') requestId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const request = await this.prisma.affiliateRequest.findFirst({
      where: {
        id: requestId,
        affiliateProduct: {
          productId,
        },
      },
    });
    if (!request) {
      throw new NotFoundException('Solicitação de afiliado não encontrada');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.affiliateRequest.update({
        where: { id: requestId },
        data: { status: 'APPROVED' },
      });

      const existingLink = await tx.affiliateLink.findFirst({
        where: {
          affiliateProductId: request.affiliateProductId,
          affiliateWorkspaceId: request.affiliateWorkspaceId,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (existingLink) {
        if (!existingLink.active) {
          await tx.affiliateLink.update({
            where: { id: existingLink.id },
            data: { active: true },
          });
        }
      } else {
        const code = await generateAffiliatePublicCode(tx);
        await tx.affiliateLink.create({
          data: {
            affiliateProductId: request.affiliateProductId,
            affiliateWorkspaceId: request.affiliateWorkspaceId,
            code,
          },
        });
      }
    });

    await recalculateAffiliateProductCounters(this.prisma, request.affiliateProductId);

    return buildAffiliateSummary(this.prisma, req, productId);
  }

  /** Reject request. */
  @Post('requests/:requestId/reject')
  async rejectRequest(
    @Param('productId') productId: string,
    @Param('requestId') requestId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const request = await this.prisma.affiliateRequest.findFirst({
      where: {
        id: requestId,
        affiliateProduct: {
          productId,
        },
      },
    });
    if (!request) {
      throw new NotFoundException('Solicitação de afiliado não encontrada');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.affiliateRequest.update({
        where: { id: requestId },
        data: { status: 'REJECTED' },
      });
      await tx.affiliateLink.updateMany({
        where: {
          affiliateProductId: request.affiliateProductId,
          affiliateWorkspaceId: request.affiliateWorkspaceId,
        },
        data: { active: false },
      });
    });

    await recalculateAffiliateProductCounters(this.prisma, request.affiliateProductId);

    return buildAffiliateSummary(this.prisma, req, productId);
  }

  /** Update link. */
  @Put('links/:linkId')
  async updateLink(
    @Param('productId') productId: string,
    @Param('linkId') linkId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    if (typeof body.active !== 'boolean') {
      throw new BadRequestException('Informe se o link deve ficar ativo ou não');
    }

    const link = await this.prisma.affiliateLink.findFirst({
      where: {
        id: linkId,
        affiliateProduct: {
          productId,
        },
      },
    });
    if (!link) {
      throw new NotFoundException('Link de afiliado não encontrado');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.affiliateLink.update({
        where: { id: linkId },
        data: { active: body.active },
      });

      if (body.active) {
        await tx.affiliateRequest.updateMany({
          where: {
            affiliateProductId: link.affiliateProductId,
            affiliateWorkspaceId: link.affiliateWorkspaceId,
          },
          data: { status: 'APPROVED' },
        });
      }
    });

    await recalculateAffiliateProductCounters(this.prisma, link.affiliateProductId);

    return buildAffiliateSummary(this.prisma, req, productId);
  }
}
