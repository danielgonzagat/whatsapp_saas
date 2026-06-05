import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CampaignsService } from '../../campaigns/campaigns.service';
import { WorkspaceGuard } from '../../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../../common/interfaces';
import { PrismaService } from '../../prisma/prisma.service';
import {
  LooseObject,
  ensureWorkspaceProductAccess,
  parseObject,
  removeUndefined,
  safeStr,
  toStringList,
} from './helpers/common.helpers';
import {
  buildDefaultCampaignMessage,
  findLinkedCampaignForProductCampaign,
  serializeProductCampaignRecord,
} from './helpers/campaign.helpers';

/** Product campaign controller. */
import { RouteClass } from '../../common/throttler/route-class.decorator';
import { resolveWorkspaceId } from '../../auth/workspace-access';

@Controller('products/:productId/campaigns')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('mutate')
export class ProductCampaignController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly campaignsService: CampaignsService,
  ) {}

  private buildCampaignFilters(
    productId: string,
    productCampaign: LooseObject,
    body?: LooseObject,
  ) {
    const input = parseObject(body);
    return removeUndefined({
      productId,
      productCampaignId: productCampaign.id,
      productCampaignCode: productCampaign.code,
      pixelId: input.pixelId ?? productCampaign.pixelId ?? null,
      tags: toStringList(input.tags),
      smartTime: input.smartTime === true,
    });
  }

  private async listWorkspaceCampaigns(workspaceId: string) {
    return this.prisma.campaign.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        status: true,
        scheduledAt: true,
        messageTemplate: true,
        filters: true,
        stats: true,
        aiStrategy: true,
        parentId: true,
        createdAt: true,
        updatedAt: true,
      },
      take: 500,
      orderBy: { createdAt: 'desc' },
    });
  }

  private serializeWithDeliveryReadiness(
    productCampaign: LooseObject,
    linkedCampaign: LooseObject | null,
    deliveryReadiness: Awaited<ReturnType<CampaignsService['getDeliveryReadiness']>>,
  ) {
    return {
      ...serializeProductCampaignRecord(productCampaign, linkedCampaign),
      deliveryReady: deliveryReadiness.ready,
      deliveryMissing: deliveryReadiness.missing,
      deliveryGapMessage: deliveryReadiness.message,
    };
  }

  private async ensureLinkedCampaign(
    workspaceId: string,
    product: LooseObject,
    productCampaign: LooseObject,
    body?: LooseObject,
  ) {
    const campaigns = await this.listWorkspaceCampaigns(workspaceId);
    const linkedCampaign = findLinkedCampaignForProductCampaign(campaigns, productCampaign);
    const linkedFilters = parseObject(linkedCampaign?.filters);
    const nextFilters = {
      ...linkedFilters,
      ...this.buildCampaignFilters(safeStr(product.id), productCampaign, body),
    } as Prisma.InputJsonValue;
    const nextMessage =
      safeStr(body?.messageTemplate || linkedCampaign?.messageTemplate).trim() ||
      buildDefaultCampaignMessage(product);
    const nextStrategy = safeStr(body?.aiStrategy || linkedCampaign?.aiStrategy, 'BALANCED').trim();

    if (linkedCampaign) {
      const linkedCampaignId = safeStr(linkedCampaign.id);
      await this.prisma.campaign.updateMany({
        where: { id: linkedCampaignId, workspaceId },
        data: {
          name: safeStr(body?.name || productCampaign.name),
          messageTemplate: nextMessage,
          filters: nextFilters,
          aiStrategy: nextStrategy,
        },
      });
      return this.prisma.campaign.findFirstOrThrow({
        where: { id: linkedCampaignId, workspaceId },
      });
    }

    return this.campaignsService.create(workspaceId, {
      name: safeStr(body?.name || productCampaign.name),
      messageTemplate: nextMessage,
      filters: nextFilters,
      aiStrategy: nextStrategy,
    });
  }

  /** List. */
  @Get()
  async list(@Param('productId') productId: string, @Request() req: AuthenticatedRequest) {
    const workspaceId = resolveWorkspaceId(req);
    await ensureWorkspaceProductAccess(this.prisma, productId, workspaceId);

    const [productCampaigns, workspaceCampaigns, deliveryReadiness] = await Promise.all([
      this.prisma.productCampaign.findMany({
        where: { productId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.listWorkspaceCampaigns(workspaceId),
      this.campaignsService.getDeliveryReadiness(workspaceId),
    ]);

    return productCampaigns.map((campaign) =>
      this.serializeWithDeliveryReadiness(
        campaign,
        findLinkedCampaignForProductCampaign(workspaceCampaigns, campaign),
        deliveryReadiness,
      ),
    );
  }

  /** Create. */
  @Post()
  async create(
    @Param('productId') productId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const product = await ensureWorkspaceProductAccess(this.prisma, productId, workspaceId);

    if (!safeStr(body.name).trim()) {
      throw new BadRequestException('Nome da campanha é obrigatório');
    }

    const createdProductCampaign = await this.prisma.productCampaign.create({
      data: {
        productId,
        name: safeStr(body.name).trim(),
        pixelId: body.pixelId ? safeStr(body.pixelId).trim() : null,
      },
    });

    const linkedCampaign = await this.ensureLinkedCampaign(
      workspaceId,
      product,
      createdProductCampaign,
      body,
    );
    const deliveryReadiness = await this.campaignsService.getDeliveryReadiness(workspaceId);

    return this.serializeWithDeliveryReadiness(
      createdProductCampaign,
      linkedCampaign,
      deliveryReadiness,
    );
  }

  /** Update. */
  @Put(':campaignId')
  async update(
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const product = await ensureWorkspaceProductAccess(this.prisma, productId, workspaceId);

    const productCampaign = await this.prisma.productCampaign.findFirst({
      where: { id: campaignId, productId },
    });
    if (!productCampaign) {
      throw new NotFoundException('Campanha não encontrada');
    }

    const updatedProductCampaign = await this.prisma.productCampaign.update({
      where: { id: campaignId },
      data: removeUndefined({
        ...(body.name !== undefined ? { name: safeStr(body.name).trim() } : {}),
        ...(body.pixelId !== undefined ? { pixelId: safeStr(body.pixelId).trim() || null } : {}),
      }),
    });

    const linkedCampaign = await this.ensureLinkedCampaign(
      workspaceId,
      product,
      updatedProductCampaign,
      body,
    );
    const deliveryReadiness = await this.campaignsService.getDeliveryReadiness(workspaceId);

    return this.serializeWithDeliveryReadiness(
      updatedProductCampaign,
      linkedCampaign,
      deliveryReadiness,
    );
  }

  /** Launch. */
  @Post(':campaignId/launch')
  async launch(
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    const product = await ensureWorkspaceProductAccess(this.prisma, productId, resolveWorkspaceId(req));

    const productCampaign = await this.prisma.productCampaign.findFirst({
      where: { id: campaignId, productId },
    });
    if (!productCampaign) {
      throw new NotFoundException('Campanha não encontrada');
    }

    const linkedCampaign = await this.ensureLinkedCampaign(
      resolveWorkspaceId(req),
      product,
      productCampaign,
      body,
    );

    return this.campaignsService.launch(
      resolveWorkspaceId(req),
      linkedCampaign.id,
      body.smartTime === true,
    );
  }

  /** Pause. */
  @Post(':campaignId/pause')
  async pause(
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, resolveWorkspaceId(req));

    const productCampaign = await this.prisma.productCampaign.findFirst({
      where: { id: campaignId, productId },
    });
    if (!productCampaign) {
      throw new NotFoundException('Campanha não encontrada');
    }

    const linkedCampaign = findLinkedCampaignForProductCampaign(
      await this.listWorkspaceCampaigns(resolveWorkspaceId(req)),
      productCampaign,
    );
    if (!linkedCampaign) {
      throw new NotFoundException('Campanha operacional não encontrada');
    }

    return this.campaignsService.pause(resolveWorkspaceId(req), safeStr(linkedCampaign.id));
  }

  /** Delete. */
  @Delete(':campaignId')
  async delete(
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, resolveWorkspaceId(req));

    const campaign = await this.prisma.productCampaign.findFirst({
      where: { id: campaignId, productId },
    });
    if (!campaign) {
      throw new NotFoundException('Campanha não encontrada');
    }

    const linkedCampaign = findLinkedCampaignForProductCampaign(
      await this.listWorkspaceCampaigns(resolveWorkspaceId(req)),
      campaign,
    );

    await this.auditService.log({
      workspaceId: resolveWorkspaceId(req),
      action: 'DELETE_RECORD',
      resource: 'ProductCampaign',
      resourceId: campaignId,
      details: { deletedBy: 'user', productId },
    });

    const workspaceId = resolveWorkspaceId(req);
    if (linkedCampaign) {
      await this.prisma.campaign.deleteMany({
        where: { id: safeStr(linkedCampaign.id), workspaceId },
      });
    }

    return this.prisma.productCampaign.delete({ where: { id: campaignId } });
  }
}
