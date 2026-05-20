import {
  Body,
  Controller,
  Delete,
  Get,
  BadRequestException,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Prisma, TimerType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { toPrismaJsonValue } from '../common/prisma/prisma-json.util';
import { AuthenticatedRequest } from '../common/interfaces';
import { syncAllWorkspaceCheckoutCouponsForProduct } from '../kloel/product-coupon-sync.util';
import { Metrics } from '../observability/metrics';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutService } from './checkout.service';
import { CreateBumpDto } from './dto/create-bump.dto';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { CreatePixelDto } from './dto/create-pixel.dto';
import { CreatePlanDto } from './dto/create-plan.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateUpsellDto } from './dto/create-upsell.dto';
import { UpdateConfigDto } from './dto/update-config.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { RouteClass } from '../common/throttler/route-class.decorator';

/**
 * @cluster whatsapp_saas/backend/checkout
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
const U0300__U036F_RE = /[\u0300-\u036f]/g;
const A_Z0_9_RE = /[^a-z0-9]+/g;
const PATTERN_RE = /^-|-$/g;

function normalizeTimerType(value: unknown): TimerType | undefined {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    return undefined;
  }

  const normalized = String(value).trim().toUpperCase();

  if (normalized === 'COUNTDOWN' || normalized === 'EVERGREEN') {
    return TimerType.COUNTDOWN;
  }

  if (normalized === 'EXPIRATION' || normalized === 'FIXED') {
    return TimerType.EXPIRATION;
  }

  if (normalized === TimerType.STOCK) {
    return TimerType.STOCK;
  }

  return undefined;
}

/** Checkout controller. */
@Controller('checkout')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('mutate')
export class CheckoutController {
  constructor(
    private readonly checkoutService: CheckoutService,
    private readonly prisma: PrismaService,
  ) {}

  private buildSlug(value: string) {
    const base = String(value || 'checkout')
      .toLowerCase()
      .normalize('NFD')
      .replace(U0300__U036F_RE, '')
      .replace(A_Z0_9_RE, '-')
      .replace(PATTERN_RE, '')
      .slice(0, 48);

    return `${base || 'checkout'}-${Date.now().toString(36)}`;
  }

  private async verifyPlanOwnership(planId: string, workspaceId: string) {
    const plan = await this.prisma.checkoutProductPlan.findFirst({
      where: { id: planId },
      include: { product: { select: { workspaceId: true } } },
    });
    if (!plan || plan.product.workspaceId !== workspaceId) {
      throw new NotFoundException('Plano nao encontrado');
    }
    return plan;
  }

  private async verifyCheckoutOwnership(checkoutId: string, workspaceId: string) {
    const checkout = await this.verifyPlanOwnership(checkoutId, workspaceId);
    if (checkout.kind !== 'CHECKOUT') {
      throw new NotFoundException('Checkout nao encontrado');
    }
    return checkout;
  }

  private async verifyBumpOwnership(bumpId: string, workspaceId: string) {
    const bump = await this.prisma.orderBump.findFirst({
      where: { id: bumpId },
      include: {
        plan: { include: { product: { select: { workspaceId: true } } } },
      },
    });
    if (!bump || bump.plan.product.workspaceId !== workspaceId) {
      throw new NotFoundException('Bump nao encontrado');
    }
    return bump;
  }

  private async verifyUpsellOwnership(upsellId: string, workspaceId: string) {
    const upsell = await this.prisma.upsell.findFirst({
      where: { id: upsellId },
      include: {
        plan: { include: { product: { select: { workspaceId: true } } } },
      },
    });
    if (!upsell || upsell.plan.product.workspaceId !== workspaceId) {
      throw new NotFoundException('Upsell nao encontrado');
    }
    return upsell;
  }

  // ─── Products ──────────────────────────────────────────────────────────────

  @Post('products')
  async createProduct(@Request() req: AuthenticatedRequest, @Body() dto: CreateProductDto) {
    const start = Date.now();
    const workspaceId = req.user?.workspaceId;

    // Auto-generate slug from name if not provided
    if (!dto.slug) {
      dto.slug = `${(dto.name || 'product')
        .toLowerCase()
        .normalize('NFD')
        .replace(U0300__U036F_RE, '')
        .replace(A_Z0_9_RE, '-')
        .replace(PATTERN_RE, '')}-${Date.now().toString(36)}`;
    }

    try {
      const result = await this.checkoutService.createProduct(workspaceId, dto);
      Metrics.endpoint.success('checkout.createProduct', { workspaceId });
      Metrics.endpoint.duration('checkout.createProduct', Date.now() - start, { workspaceId });
      return result;
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? 'unknown';
      Metrics.endpoint.failure('checkout.createProduct', { workspaceId, code });
      throw err;
    }
  }

  /** List products. */
  @Get('products')
  listProducts(@Request() req: AuthenticatedRequest) {
    const wsId = req.user?.workspaceId;
    if (!wsId) {
      throw new BadRequestException('workspaceId missing from token');
    }
    return this.checkoutService.listProducts(wsId);
  }

  /** Get product. */
  @Get('products/:id')
  getProduct(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    return this.checkoutService.getProduct(id, workspaceId);
  }

  /** Update product. */
  @Put('products/:id')
  updateProduct(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: Partial<CreateProductDto>,
  ) {
    const workspaceId = req.user?.workspaceId;
    return this.checkoutService.updateProduct(id, workspaceId, dto);
  }

  /** Delete product. */
  @Delete('products/:id')
  deleteProduct(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    return this.checkoutService.deleteProduct(id, workspaceId);
  }

  // ─── Plans ─────────────────────────────────────────────────────────────────

  @Post('products/:productId/plans')
  async createPlan(
    @Request() req: AuthenticatedRequest,
    @Param('productId') productId: string,
    @Body() dto: CreatePlanDto,
  ) {
    const start = Date.now();
    const workspaceId = req.user?.workspaceId;
    const product = await this.prisma.product.findFirst({
      where: { id: productId, workspaceId },
    });
    if (!product) {
      throw new NotFoundException('Produto nao encontrado');
    }
    dto.slug = this.buildSlug(
      dto.slug || `${product.slug || product.name || 'checkout'}-${dto.name || 'oferta'}`,
    );
    dto.brandName = dto.brandName || product.name;
    try {
      const createdPlan = await this.checkoutService.createPlan(productId, dto, workspaceId);
      await syncAllWorkspaceCheckoutCouponsForProduct(this.prisma, workspaceId, productId);
      Metrics.endpoint.success('checkout.createPlan', { workspaceId });
      Metrics.endpoint.duration('checkout.createPlan', Date.now() - start, { workspaceId });
      return createdPlan;
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? 'unknown';
      Metrics.endpoint.failure('checkout.createPlan', { workspaceId, code });
      throw err;
    }
  }

  /** Update plan. */
  @Put('plans/:id')
  async updatePlan(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: Partial<CreatePlanDto>,
  ) {
    const workspaceId = req.user?.workspaceId;
    const plan = await this.verifyPlanOwnership(id, workspaceId);
    const updatedPlan = await this.checkoutService.updatePlan(id, dto);
    await syncAllWorkspaceCheckoutCouponsForProduct(this.prisma, workspaceId, plan.productId);
    return updatedPlan;
  }

  /** Delete plan. */
  @Delete('plans/:id')
  async deletePlan(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    const plan = await this.verifyPlanOwnership(id, workspaceId);
    if (plan.kind !== 'PLAN') {
      throw new NotFoundException('Plano nao encontrado');
    }
    const deletedPlan = await this.checkoutService.deletePlan(id, workspaceId);
    await syncAllWorkspaceCheckoutCouponsForProduct(this.prisma, workspaceId, plan.productId);
    return deletedPlan;
  }

  /** Create checkout. */
  @Post('products/:productId/checkouts')
  async createCheckout(
    @Request() req: AuthenticatedRequest,
    @Param('productId') productId: string,
    @Body() dto: CreatePlanDto,
  ) {
    const start = Date.now();
    const workspaceId = req.user?.workspaceId;
    const product = await this.prisma.product.findFirst({
      where: { id: productId, workspaceId },
    });
    if (!product) {
      throw new NotFoundException('Produto nao encontrado');
    }
    dto.slug = this.buildSlug(
      dto.slug || `${product.slug || product.name || 'checkout'}-${dto.name || 'layout'}`,
    );
    dto.brandName = dto.brandName || product.name;
    try {
      const result = await this.checkoutService.createCheckout(productId, dto, workspaceId);
      Metrics.endpoint.success('checkout.createCheckout', { workspaceId });
      Metrics.endpoint.duration('checkout.createCheckout', Date.now() - start, { workspaceId });
      return result;
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? 'unknown';
      Metrics.endpoint.failure('checkout.createCheckout', { workspaceId, code });
      throw err;
    }
  }

  /** Duplicate checkout. */
  @Post('checkouts/:id/duplicate')
  async duplicateCheckout(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyCheckoutOwnership(id, workspaceId);
    return this.checkoutService.duplicateCheckout(id, workspaceId);
  }

  /** Sync checkout links. */
  @Put('checkouts/:id/links')
  async syncCheckoutLinks(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { planIds?: string[] },
  ) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyCheckoutOwnership(id, workspaceId);
    return this.checkoutService.syncCheckoutLinks(
      id,
      Array.isArray(body?.planIds) ? body.planIds : [],
    );
  }

  /** Delete checkout. */
  @Delete('checkouts/:id')
  async deleteCheckout(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyCheckoutOwnership(id, workspaceId);
    return this.checkoutService.deletePlan(id, workspaceId);
  }

  // ─── Checkout Config ──────────────────────────────────────────────────────

  @Get('plans/:planId/config')
  async getConfig(@Request() req: AuthenticatedRequest, @Param('planId') planId: string) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyPlanOwnership(planId, workspaceId);
    return this.checkoutService.getConfig(planId);
  }

  /** Update config. */
  @Patch('plans/:planId/config')
  async updateConfig(
    @Request() req: AuthenticatedRequest,
    @Param('planId') planId: string,
    @Body() dto: UpdateConfigDto,
  ) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyPlanOwnership(planId, workspaceId);
    const {
      orderBumps: _orderBumps,
      upsells: _upsells,
      pixels: _pixels,
      timerType,
      testimonials,
      trustBadges,
      ...configDto
    } = dto;
    const normalizedTimer = timerType !== undefined ? normalizeTimerType(timerType) : undefined;
    const normalizedTestimonials =
      testimonials !== undefined ? toPrismaJsonValue(testimonials) : undefined;
    const normalizedTrustBadges =
      trustBadges !== undefined ? toPrismaJsonValue(trustBadges) : undefined;

    const configInput: Prisma.CheckoutConfigUpdateInput = {
      ...(normalizedTimer !== undefined ? { timerType: normalizedTimer } : {}),
      ...(normalizedTestimonials !== undefined ? { testimonials: normalizedTestimonials } : {}),
      ...(normalizedTrustBadges !== undefined ? { trustBadges: normalizedTrustBadges } : {}),
    };
    for (const [key, value] of Object.entries(configDto)) {
      if (value !== undefined) {
        (configInput as Record<string, unknown>)[key] = value;
      }
    }
    return this.checkoutService.updateConfig(planId, configInput);
  }

  /** Reset config. */
  @Post('plans/:planId/config/reset')
  async resetConfig(@Request() req: AuthenticatedRequest, @Param('planId') planId: string) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyPlanOwnership(planId, workspaceId);
    return this.checkoutService.resetConfig(planId);
  }

  // ─── Order Bumps ──────────────────────────────────────────────────────────

  @Get('plans/:planId/bumps')
  async listBumps(@Request() req: AuthenticatedRequest, @Param('planId') planId: string) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyPlanOwnership(planId, workspaceId);
    return this.checkoutService.listBumps(planId);
  }

  /** Create bump. */
  @Post('plans/:planId/bumps')
  async createBump(
    @Request() req: AuthenticatedRequest,
    @Param('planId') planId: string,
    @Body() dto: CreateBumpDto,
  ) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyPlanOwnership(planId, workspaceId);
    return this.checkoutService.createBump(planId, dto);
  }

  /** Update bump. */
  @Put('bumps/:id')
  async updateBump(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: Partial<CreateBumpDto>,
  ) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyBumpOwnership(id, workspaceId);
    return this.checkoutService.updateBump(id, dto);
  }

  /** Delete bump. */
  @Delete('bumps/:id')
  async deleteBump(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyBumpOwnership(id, workspaceId);
    return this.checkoutService.deleteBump(id);
  }

  // ─── Upsells ──────────────────────────────────────────────────────────────

  @Get('plans/:planId/upsells')
  async listUpsells(@Request() req: AuthenticatedRequest, @Param('planId') planId: string) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyPlanOwnership(planId, workspaceId);
    return this.checkoutService.listUpsells(planId);
  }

  /** Create upsell. */
  @Post('plans/:planId/upsells')
  async createUpsell(
    @Request() req: AuthenticatedRequest,
    @Param('planId') planId: string,
    @Body() dto: CreateUpsellDto,
  ) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyPlanOwnership(planId, workspaceId);
    return this.checkoutService.createUpsell(planId, dto);
  }

  /** Update upsell. */
  @Put('upsells/:id')
  async updateUpsell(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: Partial<CreateUpsellDto>,
  ) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyUpsellOwnership(id, workspaceId);
    return this.checkoutService.updateUpsell(id, dto);
  }

  /** Delete upsell. */
  @Delete('upsells/:id')
  async deleteUpsell(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyUpsellOwnership(id, workspaceId);
    return this.checkoutService.deleteUpsell(id);
  }

  // ─── Coupons ──────────────────────────────────────────────────────────────

  @Get('coupons')
  listCoupons(@Request() req: AuthenticatedRequest) {
    const wsId = req.user?.workspaceId;
    if (!wsId) {
      throw new BadRequestException('workspaceId missing from token');
    }
    return this.checkoutService.listCoupons(wsId);
  }

  /** Create coupon. */
  @Post('coupons')
  async createCoupon(@Request() req: AuthenticatedRequest, @Body() dto: CreateCouponDto) {
    const start = Date.now();
    const workspaceId = req.user?.workspaceId;
    try {
      const result = await this.checkoutService.createCoupon(workspaceId, dto);
      Metrics.endpoint.success('checkout.createCoupon', { workspaceId });
      Metrics.endpoint.duration('checkout.createCoupon', Date.now() - start, { workspaceId });
      return result;
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? 'unknown';
      Metrics.endpoint.failure('checkout.createCoupon', { workspaceId, code });
      throw err;
    }
  }

  /** Update coupon. */
  @Put('coupons/:id')
  updateCoupon(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: Partial<CreateCouponDto>,
  ) {
    return this.checkoutService.updateCoupon(id, req.user?.workspaceId, dto);
  }

  /** Delete coupon. */
  @Delete('coupons/:id')
  deleteCoupon(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.checkoutService.deleteCoupon(id, req.user?.workspaceId);
  }

  // ─── Pixels ───────────────────────────────────────────────────────────────

  @Post('config/:configId/pixels')
  createPixel(@Param('configId') configId: string, @Body() dto: CreatePixelDto) {
    return this.checkoutService.createPixel(configId, dto);
  }

  /** Update pixel. */
  @Put('pixels/:id')
  updatePixel(@Param('id') id: string, @Body() dto: Partial<CreatePixelDto>) {
    return this.checkoutService.updatePixel(id, dto);
  }

  /** Delete pixel. */
  @Delete('pixels/:id')
  deletePixel(@Param('id') id: string) {
    return this.checkoutService.deletePixel(id);
  }

  // ─── Orders (Dashboard) ──────────────────────────────────────────────────

  @Get('orders')
  listOrders(
    @Request() req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const wsId = req.user?.workspaceId;
    if (!wsId) {
      throw new BadRequestException('workspaceId missing from token');
    }
    const clampedPage = page ? Math.max(Number.parseInt(page, 10) || 1, 1) : undefined;
    const clampedLimit = limit
      ? Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100)
      : undefined;
    return this.checkoutService.listOrders(wsId, {
      ...(status !== undefined ? { status } : {}),
      ...(clampedPage !== undefined ? { page: clampedPage } : {}),
      ...(clampedLimit !== undefined ? { limit: clampedLimit } : {}),
    });
  }

  /** Get order. */
  @Get('orders/:id')
  getOrder(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.checkoutService.getOrder(id, req.user?.workspaceId);
  }

  /** Update order status. */
  @Patch('orders/:id/status')
  async updateOrderStatus(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    const start = Date.now();
    const workspaceId = req.user?.workspaceId;
    const { status, ...extra } = dto;
    try {
      const result = await this.checkoutService.updateOrderStatus(
        id,
        workspaceId,
        status,
        Object.keys(extra).length > 0 ? extra : undefined,
      );
      Metrics.endpoint.success('checkout.updateOrderStatus', { workspaceId });
      Metrics.endpoint.duration('checkout.updateOrderStatus', Date.now() - start, { workspaceId });
      return result;
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? 'unknown';
      Metrics.endpoint.failure('checkout.updateOrderStatus', { workspaceId, code });
      throw err;
    }
  }
}
