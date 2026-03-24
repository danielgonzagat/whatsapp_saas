import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { PrismaService } from '../prisma/prisma.service';

// ============================================
// PRODUCT PLANS
// ============================================

@Controller('products/:productId/plans')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductPlanController {
  private readonly logger = new Logger(ProductPlanController.name);
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async listPlans(
    @Param('productId') productId: string,
    @Request() req: any,
  ) {
    return this.prisma.productPlan.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get(':planId')
  async getPlan(
    @Param('productId') productId: string,
    @Param('planId') planId: string,
  ) {
    return this.prisma.productPlan.findUnique({
      where: { id: planId },
    });
  }

  @Post()
  async createPlan(
    @Param('productId') productId: string,
    @Body() body: any,
  ) {
    return this.prisma.productPlan.create({
      data: { productId, ...body },
    });
  }

  @Put(':planId')
  async updatePlan(
    @Param('planId') planId: string,
    @Body() body: any,
  ) {
    return this.prisma.productPlan.update({
      where: { id: planId },
      data: body,
    });
  }

  @Delete(':planId')
  async deletePlan(@Param('planId') planId: string) {
    return this.prisma.productPlan.delete({ where: { id: planId } });
  }
}

// ============================================
// PRODUCT CHECKOUTS
// ============================================

@Controller('products/:productId/checkouts')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductCheckoutController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Param('productId') productId: string) {
    return this.prisma.productCheckout.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  async create(@Param('productId') productId: string, @Body() body: any) {
    return this.prisma.productCheckout.create({
      data: { productId, ...body },
    });
  }

  @Put(':checkoutId')
  async update(@Param('checkoutId') checkoutId: string, @Body() body: any) {
    return this.prisma.productCheckout.update({
      where: { id: checkoutId },
      data: body,
    });
  }

  @Delete(':checkoutId')
  async delete(@Param('checkoutId') checkoutId: string) {
    return this.prisma.productCheckout.delete({ where: { id: checkoutId } });
  }
}

// ============================================
// PRODUCT COUPONS
// ============================================

@Controller('products/:productId/coupons')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductCouponController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Param('productId') productId: string) {
    return this.prisma.productCoupon.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  async create(@Param('productId') productId: string, @Body() body: any) {
    return this.prisma.productCoupon.create({
      data: { productId, ...body },
    });
  }

  @Post('validate')
  async validate(
    @Param('productId') productId: string,
    @Body() body: { code: string },
  ) {
    const coupon = await this.prisma.productCoupon.findUnique({
      where: { productId_code: { productId, code: body.code } },
    });
    if (!coupon || !coupon.active) return { valid: false, reason: 'not_found' };
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses)
      return { valid: false, reason: 'max_uses' };
    if (coupon.expiresAt && coupon.expiresAt < new Date())
      return { valid: false, reason: 'expired' };
    return { valid: true, coupon };
  }

  @Delete(':couponId')
  async delete(@Param('couponId') couponId: string) {
    return this.prisma.productCoupon.delete({ where: { id: couponId } });
  }
}

// ============================================
// PRODUCT URLS
// ============================================

@Controller('products/:productId/urls')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductUrlController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Param('productId') productId: string) {
    return this.prisma.productUrl.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  async create(@Param('productId') productId: string, @Body() body: any) {
    return this.prisma.productUrl.create({
      data: { productId, ...body },
    });
  }

  @Put(':urlId')
  async update(@Param('urlId') urlId: string, @Body() body: any) {
    return this.prisma.productUrl.update({
      where: { id: urlId },
      data: body,
    });
  }

  @Delete(':urlId')
  async delete(@Param('urlId') urlId: string) {
    return this.prisma.productUrl.delete({ where: { id: urlId } });
  }
}

// ============================================
// PRODUCT AI CONFIG
// ============================================

@Controller('products/:productId/ai-config')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductAIConfigController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get(@Param('productId') productId: string) {
    return this.prisma.productAIConfig.findUnique({
      where: { productId },
    });
  }

  @Put()
  async upsert(@Param('productId') productId: string, @Body() body: any) {
    return this.prisma.productAIConfig.upsert({
      where: { productId },
      update: body,
      create: { productId, ...body },
    });
  }
}

// ============================================
// PRODUCT REVIEWS
// ============================================

@Controller('products/:productId/reviews')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductReviewController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Param('productId') productId: string) {
    return this.prisma.productReview.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  async create(@Param('productId') productId: string, @Body() body: any) {
    return this.prisma.productReview.create({
      data: { productId, ...body },
    });
  }

  @Delete(':reviewId')
  async delete(@Param('reviewId') reviewId: string) {
    return this.prisma.productReview.delete({ where: { id: reviewId } });
  }
}

// ============================================
// PRODUCT COMMISSIONS
// ============================================

@Controller('products/:productId/commissions')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductCommissionController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Param('productId') productId: string) {
    return this.prisma.productCommission.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  async create(@Param('productId') productId: string, @Body() body: any) {
    return this.prisma.productCommission.create({
      data: { productId, ...body },
    });
  }

  @Put(':commissionId')
  async update(@Param('commissionId') commissionId: string, @Body() body: any) {
    return this.prisma.productCommission.update({
      where: { id: commissionId },
      data: body,
    });
  }

  @Delete(':commissionId')
  async delete(@Param('commissionId') commissionId: string) {
    return this.prisma.productCommission.delete({ where: { id: commissionId } });
  }
}
