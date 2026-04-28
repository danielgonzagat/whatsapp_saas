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
import { ValidateCouponDto } from '../dto/product-sub-resources.dto';
import {
  findConflictingProductCouponInWorkspace,
  syncWorkspaceCheckoutCouponForProduct,
} from '../product-coupon-sync.util';
import {
  LooseObject,
  ensureWorkspaceProductAccess,
  getWorkspaceId,
} from './helpers/common.helpers';
import { buildCouponData, serializeCoupon } from './helpers/plan.helpers';

/** Product coupon controller. */
@Controller('products/:productId/coupons')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductCouponController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** List. */
  @Get()
  async list(@Param('productId') productId: string, @Request() req: AuthenticatedRequest) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const coupons = await this.prisma.productCoupon.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return coupons.map(serializeCoupon);
  }

  /** Create. */
  @Post()
  async create(
    @Param('productId') productId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    const product = await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const payload = buildCouponData(body);
    const conflict = await findConflictingProductCouponInWorkspace(
      this.prisma,
      getWorkspaceId(req),
      payload.code,
    );
    if (conflict) {
      throw new BadRequestException(
        `O cupom ${payload.code} já está em uso no produto ${conflict.product?.name || conflict.productId}.`,
      );
    }

    const created = await this.prisma.productCoupon.create({
      data: {
        productId,
        ...payload,
      } as Prisma.ProductCouponUncheckedCreateInput,
    });

    await syncWorkspaceCheckoutCouponForProduct(
      this.prisma,
      getWorkspaceId(req),
      product.id,
      created.code,
    );

    return serializeCoupon(created);
  }

  /** Update. */
  @Put(':couponId')
  async update(
    @Param('productId') productId: string,
    @Param('couponId') couponId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const coupon = await this.prisma.productCoupon.findFirst({
      where: { id: couponId, productId },
    });
    if (!coupon) {
      throw new NotFoundException('Cupom não encontrado');
    }

    const payload = buildCouponData({ ...coupon, ...body });
    const conflict = await findConflictingProductCouponInWorkspace(
      this.prisma,
      getWorkspaceId(req),
      payload.code,
      couponId,
    );
    if (conflict) {
      throw new BadRequestException(
        `O cupom ${payload.code} já está em uso no produto ${conflict.product?.name || conflict.productId}.`,
      );
    }

    const updated = await this.prisma.productCoupon.update({
      where: { id: couponId },
      data: payload as Prisma.ProductCouponUncheckedUpdateInput,
    });

    if (coupon.code !== updated.code) {
      await syncWorkspaceCheckoutCouponForProduct(
        this.prisma,
        getWorkspaceId(req),
        productId,
        coupon.code,
      );
    }
    await syncWorkspaceCheckoutCouponForProduct(
      this.prisma,
      getWorkspaceId(req),
      productId,
      updated.code,
    );

    return serializeCoupon(updated);
  }

  /** Validate. */
  @Post('validate')
  async validate(@Param('productId') productId: string, @Body() body: ValidateCouponDto) {
    const coupon = await this.prisma.productCoupon.findUnique({
      where: {
        productId_code: {
          productId,
          code: String(body.code || '').toUpperCase(),
        },
      },
    });

    if (!coupon || !coupon.active) {
      return { valid: false, reason: 'not_found' };
    }
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
      return { valid: false, reason: 'max_uses' };
    }
    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      return { valid: false, reason: 'expired' };
    }

    return { valid: true, coupon: serializeCoupon(coupon) };
  }

  /** Delete. */
  @Delete(':couponId')
  async delete(
    @Param('productId') productId: string,
    @Param('couponId') couponId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const coupon = await this.prisma.productCoupon.findFirst({
      where: { id: couponId, productId },
    });
    if (!coupon) {
      throw new NotFoundException('Cupom não encontrado');
    }

    await this.auditService.log({
      workspaceId: getWorkspaceId(req),
      action: 'DELETE_RECORD',
      resource: 'ProductCoupon',
      resourceId: couponId,
      details: { deletedBy: 'user', productId },
    });
    const deleted = await this.prisma.productCoupon.delete({
      where: { id: couponId },
    });
    await syncWorkspaceCheckoutCouponForProduct(
      this.prisma,
      getWorkspaceId(req),
      productId,
      deleted.code,
    );
    return deleted;
  }
}
