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
import { WorkspaceGuard } from '../../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../../common/interfaces';
import { PrismaService } from '../../prisma/prisma.service';
import {
  LooseObject,
  ensureWorkspaceProductAccess,
  getWorkspaceId,
  removeUndefined,
} from './helpers/common.helpers';

/** Product url controller. */
@Controller('products/:productId/urls')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductUrlController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** List. */
  @Get()
  async list(@Param('productId') productId: string, @Request() req: AuthenticatedRequest) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    return this.prisma.productUrl.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Create. */
  @Post()
  async create(
    @Param('productId') productId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    if (!body.description || !body.url) {
      throw new BadRequestException('Descrição e URL são obrigatórias');
    }

    return this.prisma.productUrl.create({
      data: {
        productId,
        description: body.description,
        url: body.url,
        isPrivate: body.isPrivate ?? false,
        active: body.active ?? true,
        aiLearning: body.aiLearning ?? false,
        aiTopics: body.aiTopics,
        aiLearnFreq: body.aiLearnFreq,
        aiLearnStatus: body.aiLearnStatus,
        chatEnabled: body.chatEnabled ?? false,
        chatConfig: body.chatConfig,
      } as Prisma.ProductUrlUncheckedCreateInput,
    });
  }

  /** Update. */
  @Put(':urlId')
  async update(
    @Param('productId') productId: string,
    @Param('urlId') urlId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const url = await this.prisma.productUrl.findFirst({
      where: { id: urlId, productId },
    });
    if (!url) {
      throw new NotFoundException('URL não encontrada');
    }

    return this.prisma.productUrl.update({
      where: { id: urlId },
      data: removeUndefined({
        description: body.description,
        url: body.url,
        isPrivate: body.isPrivate,
        active: body.active,
        aiLearning: body.aiLearning,
        aiTopics: body.aiTopics,
        aiLearnFreq: body.aiLearnFreq,
        aiLearnStatus: body.aiLearnStatus,
        chatEnabled: body.chatEnabled,
        chatConfig: body.chatConfig,
      }) as Prisma.ProductUrlUncheckedUpdateInput,
    });
  }

  /** Delete. */
  @Delete(':urlId')
  async delete(
    @Param('productId') productId: string,
    @Param('urlId') urlId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const url = await this.prisma.productUrl.findFirst({
      where: { id: urlId, productId },
    });
    if (!url) {
      throw new NotFoundException('URL não encontrada');
    }

    await this.auditService.log({
      workspaceId: getWorkspaceId(req),
      action: 'DELETE_RECORD',
      resource: 'ProductUrl',
      resourceId: urlId,
      details: { deletedBy: 'user', productId },
    });
    return this.prisma.productUrl.delete({ where: { id: urlId } });
  }
}
