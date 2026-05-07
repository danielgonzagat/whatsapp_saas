import {
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
import { Throttle } from '@nestjs/throttler';
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
  safeStr,
} from './helpers/common.helpers';
import { buildCheckoutData, serializeCheckout } from './helpers/plan.helpers';

/** Product checkout controller. */
@Controller('products/:productId/checkouts')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductCheckoutController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** List. */
  @Get()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async list(@Param('productId') productId: string, @Request() req: AuthenticatedRequest) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const checkouts = await this.prisma.productCheckout.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return checkouts.map(serializeCheckout);
  }

  /** Create. */
  @Post()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async create(
    @Param('productId') productId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const data = buildCheckoutData(body);
    const created = await this.prisma.productCheckout.create({
      data: {
        productId,
        name: safeStr(data.name, 'Novo checkout'),
        active: data.active !== false,
        config: (data.config || {}) as Prisma.InputJsonValue,
      },
    });

    return serializeCheckout(created);
  }

  /** Update. */
  @Put(':checkoutId')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async update(
    @Param('productId') productId: string,
    @Param('checkoutId') checkoutId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const updated = await this.prisma.$transaction(async (tx) => {
      const checkout = await tx.productCheckout.findFirst({
        where: { id: checkoutId, productId },
      });
      if (!checkout) {
        throw new NotFoundException('Checkout não encontrado');
      }

      return tx.productCheckout.update({
        where: { id: checkoutId },
        data: buildCheckoutData(body, checkout) as Prisma.ProductCheckoutUncheckedUpdateInput,
      });
    });

    return serializeCheckout(updated);
  }

  /** Delete. */
  @Delete(':checkoutId')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async delete(
    @Param('productId') productId: string,
    @Param('checkoutId') checkoutId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const checkout = await this.prisma.productCheckout.findFirst({
      where: { id: checkoutId, productId },
    });
    if (!checkout) {
      throw new NotFoundException('Checkout não encontrado');
    }

    await this.auditService.log({
      workspaceId: getWorkspaceId(req),
      action: 'DELETE_RECORD',
      resource: 'ProductCheckout',
      resourceId: checkoutId,
      details: { deletedBy: 'user', productId },
    });
    return this.prisma.productCheckout.delete({ where: { id: checkoutId } });
  }
}
