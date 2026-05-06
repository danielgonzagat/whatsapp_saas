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
} from './helpers/common.helpers';
import { buildPlanData, serializePlan } from './helpers/plan.helpers';

/** Product plan controller. */
@Controller('products/:productId/plans')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductPlanController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** List plans. */
  @Get()
  async listPlans(@Param('productId') productId: string, @Request() req: AuthenticatedRequest) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const plans = await this.prisma.productPlan.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return plans.map(serializePlan);
  }

  /** Get plan. */
  @Get(':planId')
  async getPlan(
    @Param('productId') productId: string,
    @Param('planId') planId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const plan = await this.prisma.productPlan.findFirst({
      where: { id: planId, productId },
    });

    if (!plan) {
      throw new NotFoundException('Plano não encontrado');
    }

    return serializePlan(plan);
  }

  /** Create plan. */
  @Post()
  async createPlan(
    @Param('productId') productId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const data = buildPlanData(body);
    if (!data.name) {
      throw new BadRequestException('Nome do plano é obrigatório');
    }

    const created = await this.prisma.productPlan.create({
      data: {
        productId,
        ...data,
        price: data.price ?? 0,
        itemsPerPlan: data.itemsPerPlan ?? 1,
      } as Prisma.ProductPlanUncheckedCreateInput,
    });

    return serializePlan(created);
  }

  /** Update plan. */
  @Put(':planId')
  async updatePlan(
    @Param('productId') productId: string,
    @Param('planId') planId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const updated = await this.prisma.$transaction(async (tx) => {
      const plan = await tx.productPlan.findFirst({
        where: { id: planId, productId },
      });
      if (!plan) {
        throw new NotFoundException('Plano não encontrado');
      }

      return tx.productPlan.update({
        where: { id: planId },
        data: buildPlanData(body, plan) as Prisma.ProductPlanUncheckedUpdateInput,
      });
    });

    return serializePlan(updated);
  }

  /** Delete plan. */
  @Delete(':planId')
  async deletePlan(
    @Param('productId') productId: string,
    @Param('planId') planId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const plan = await this.prisma.productPlan.findFirst({
      where: { id: planId, productId },
    });
    if (!plan) {
      throw new NotFoundException('Plano não encontrado');
    }

    await this.auditService.log({
      workspaceId: getWorkspaceId(req),
      action: 'DELETE_RECORD',
      resource: 'ProductPlan',
      resourceId: planId,
      details: { deletedBy: 'user', productId },
    });
    return this.prisma.productPlan.delete({ where: { id: planId } });
  }
}
