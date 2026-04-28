import { Body, Controller, Get, Param, Put, Request, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../../common/interfaces';
import { PrismaService } from '../../prisma/prisma.service';
import {
  normalizeProductAiConfigInput,
  serializeProductAiConfig,
} from './helpers/ai-config.helpers';
import {
  LooseObject,
  ensureWorkspaceProductAccess,
  getWorkspaceId,
} from './helpers/common.helpers';

/** Product ai config controller. */
@Controller('products/:productId/ai-config')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductAIConfigController {
  constructor(private readonly prisma: PrismaService) {}

  /** Get. */
  @Get()
  async get(@Param('productId') productId: string, @Request() req: AuthenticatedRequest) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const config = await this.prisma.productAIConfig.findUnique({
      where: { productId },
    });

    return serializeProductAiConfig(config);
  }

  /** Upsert. */
  @Put()
  async upsert(
    @Param('productId') productId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const current = await this.prisma.productAIConfig.findUnique({
      where: { productId },
    });
    const normalized = normalizeProductAiConfigInput(body, current);

    const saved = await this.prisma.productAIConfig.upsert({
      where: { productId },
      update: normalized as Prisma.InputJsonValue as Prisma.ProductAIConfigUncheckedUpdateInput,
      create: { productId, ...normalized } as Prisma.ProductAIConfigUncheckedCreateInput,
    });

    return serializeProductAiConfig(saved);
  }
}
