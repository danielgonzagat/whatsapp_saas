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
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePlanDto,
  UpdatePlanDto,
  CreateCheckoutDto,
  UpdateCheckoutDto,
  CreateCouponDto,
  ValidateCouponDto,
  CreateUrlDto,
  UpdateUrlDto,
  UpsertAIConfigDto,
  CreateReviewDto,
  CreateCommissionDto,
  UpdateCommissionDto,
} from './dto/product-sub-resources.dto';

// ============================================
// PRODUCT PLANS
// ============================================

@Controller('products/:productId/plans')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductPlanController {
  private readonly logger = new Logger(ProductPlanController.name);
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async listPlans(@Param('productId') productId: string, @Request() req: any) {
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
    @Body() body: CreatePlanDto,
  ) {
    return this.prisma.productPlan.create({
      data: { productId, ...body } as any,
    });
  }

  @Put(':planId')
  async updatePlan(
    @Param('planId') planId: string,
    @Body() body: UpdatePlanDto,
    @Request() req: any,
  ) {
    const workspaceId = req.user?.workspaceId || req.workspaceId;
    const plan = await this.prisma.productPlan.findFirst({
      where: { id: planId, product: { workspaceId } },
    });
    if (!plan) throw new NotFoundException('Plan not found');
    return this.prisma.productPlan.update({
      where: { id: planId },
      data: body,
    });
  }

  @Delete(':planId')
  async deletePlan(@Param('planId') planId: string, @Request() req: any) {
    const workspaceId = req.user?.workspaceId || req.workspaceId;
    const plan = await this.prisma.productPlan.findFirst({
      where: { id: planId, product: { workspaceId } },
    });
    if (!plan) throw new NotFoundException('Plan not found');
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
  async create(
    @Param('productId') productId: string,
    @Body() body: CreateCheckoutDto,
  ) {
    return this.prisma.productCheckout.create({
      data: { productId, ...body } as any,
    });
  }

  @Put(':checkoutId')
  async update(
    @Param('checkoutId') checkoutId: string,
    @Body() body: UpdateCheckoutDto,
    @Request() req: any,
  ) {
    const workspaceId = req.user?.workspaceId || req.workspaceId;
    const checkout = await this.prisma.productCheckout.findFirst({
      where: { id: checkoutId, product: { workspaceId } },
    });
    if (!checkout) throw new NotFoundException('Checkout not found');
    return this.prisma.productCheckout.update({
      where: { id: checkoutId },
      data: body as any,
    });
  }

  @Delete(':checkoutId')
  async delete(@Param('checkoutId') checkoutId: string, @Request() req: any) {
    const workspaceId = req.user?.workspaceId || req.workspaceId;
    const checkout = await this.prisma.productCheckout.findFirst({
      where: { id: checkoutId, product: { workspaceId } },
    });
    if (!checkout) throw new NotFoundException('Checkout not found');
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
  async create(
    @Param('productId') productId: string,
    @Body() body: CreateCouponDto,
  ) {
    return this.prisma.productCoupon.create({
      data: { productId, ...body } as any,
    });
  }

  @Post('validate')
  async validate(
    @Param('productId') productId: string,
    @Body() body: ValidateCouponDto,
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
  async delete(@Param('couponId') couponId: string, @Request() req: any) {
    const workspaceId = req.user?.workspaceId || req.workspaceId;
    const coupon = await this.prisma.productCoupon.findFirst({
      where: { id: couponId, product: { workspaceId } },
    });
    if (!coupon) throw new NotFoundException('Coupon not found');
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
  async list(@Param('productId') productId: string, @Request() req: any) {
    const workspaceId = req.user?.workspaceId || req.workspaceId;
    const product = await this.prisma.product.findFirst({
      where: { id: productId, workspaceId },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');
    return this.prisma.productUrl.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  async create(
    @Param('productId') productId: string,
    @Body() body: CreateUrlDto,
    @Request() req: any,
  ) {
    const workspaceId = req.user?.workspaceId || req.workspaceId;
    const product = await this.prisma.product.findFirst({
      where: { id: productId, workspaceId },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');
    return this.prisma.productUrl.create({
      data: { productId, ...body } as any,
    });
  }

  @Put(':urlId')
  async update(
    @Param('urlId') urlId: string,
    @Body() body: UpdateUrlDto,
    @Request() req: any,
  ) {
    const workspaceId = req.user?.workspaceId || req.workspaceId;
    const url = await this.prisma.productUrl.findFirst({
      where: { id: urlId, product: { workspaceId } },
    });
    if (!url) throw new NotFoundException('URL not found');
    return this.prisma.productUrl.update({
      where: { id: urlId },
      data: body as any,
    });
  }

  @Delete(':urlId')
  async delete(@Param('urlId') urlId: string, @Request() req: any) {
    const workspaceId = req.user?.workspaceId || req.workspaceId;
    const url = await this.prisma.productUrl.findFirst({
      where: { id: urlId, product: { workspaceId } },
    });
    if (!url) throw new NotFoundException('URL not found');
    return this.prisma.productUrl.delete({ where: { id: urlId } });
  }
}

// ============================================
// PRODUCT CAMPAIGNS
// ============================================

@Controller('products/:productId/campaigns')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductCampaignController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Param('productId') productId: string, @Request() req: any) {
    const workspaceId = req.user?.workspaceId || req.workspaceId;
    const product = await this.prisma.product.findFirst({
      where: { id: productId, workspaceId },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');
    return this.prisma.productCampaign.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  async create(
    @Param('productId') productId: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    const workspaceId = req.user?.workspaceId || req.workspaceId;
    const product = await this.prisma.product.findFirst({
      where: { id: productId, workspaceId },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');
    return this.prisma.productCampaign.create({
      data: { productId, name: body.name, pixelId: body.pixelId || null },
    });
  }

  @Delete(':campaignId')
  async delete(@Param('campaignId') campaignId: string, @Request() req: any) {
    const workspaceId = req.user?.workspaceId || req.workspaceId;
    const campaign = await this.prisma.productCampaign.findFirst({
      where: { id: campaignId, product: { workspaceId } },
    });
    if (!campaign) throw new NotFoundException('Campanha não encontrada');
    return this.prisma.productCampaign.delete({ where: { id: campaignId } });
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
  async upsert(
    @Param('productId') productId: string,
    @Body() body: UpsertAIConfigDto,
  ) {
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
  async create(
    @Param('productId') productId: string,
    @Body() body: CreateReviewDto,
  ) {
    return this.prisma.productReview.create({
      data: { productId, ...body } as any,
    });
  }

  @Delete(':reviewId')
  async delete(@Param('reviewId') reviewId: string, @Request() req: any) {
    const workspaceId = req.user?.workspaceId || req.workspaceId;
    const review = await this.prisma.productReview.findFirst({
      where: { id: reviewId, product: { workspaceId } },
    });
    if (!review) throw new NotFoundException('Review not found');
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
  async create(
    @Param('productId') productId: string,
    @Body() body: CreateCommissionDto,
  ) {
    return this.prisma.productCommission.create({
      data: { productId, ...body } as any,
    });
  }

  @Put(':commissionId')
  async update(
    @Param('commissionId') commissionId: string,
    @Body() body: UpdateCommissionDto,
    @Request() req: any,
  ) {
    const workspaceId = req.user?.workspaceId || req.workspaceId;
    const commission = await this.prisma.productCommission.findFirst({
      where: { id: commissionId, product: { workspaceId } },
    });
    if (!commission) throw new NotFoundException('Commission not found');
    return this.prisma.productCommission.update({
      where: { id: commissionId },
      data: body,
    });
  }

  @Delete(':commissionId')
  async delete(
    @Param('commissionId') commissionId: string,
    @Request() req: any,
  ) {
    const workspaceId = req.user?.workspaceId || req.workspaceId;
    const commission = await this.prisma.productCommission.findFirst({
      where: { id: commissionId, product: { workspaceId } },
    });
    if (!commission) throw new NotFoundException('Commission not found');
    return this.prisma.productCommission.delete({
      where: { id: commissionId },
    });
  }
}
