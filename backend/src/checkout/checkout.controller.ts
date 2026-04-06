import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
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
import { Throttle } from '@nestjs/throttler';
import { CheckoutService } from './checkout.service';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdateConfigDto } from './dto/update-config.dto';
import { CreateBumpDto } from './dto/create-bump.dto';
import { CreateUpsellDto } from './dto/create-upsell.dto';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { CreatePixelDto } from './dto/create-pixel.dto';
import { syncAllWorkspaceCheckoutCouponsForProduct } from '../kloel/product-coupon-sync.util';

@Controller('checkout')
@UseGuards(JwtAuthGuard)
@Throttle({ default: { limit: 30, ttl: 60000 } })
export class CheckoutController {
  private readonly logger = new Logger(CheckoutController.name);

  constructor(
    private readonly checkoutService: CheckoutService,
    private readonly prisma: PrismaService,
  ) {}

  private buildSlug(value: string) {
    const base = String(value || 'checkout')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
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
  createProduct(@Request() req: any, @Body() dto: CreateProductDto) {
    const workspaceId = req.user?.workspaceId as string;

    // Auto-generate slug from name if not provided
    if (!dto.slug) {
      dto.slug =
        (dto.name || 'product')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') +
        '-' +
        Date.now().toString(36);
    }

    return this.checkoutService.createProduct(workspaceId, dto);
  }

  @Get('products')
  listProducts(@Request() req: any, @Query('workspaceId') workspaceId?: string) {
    const wsId = workspaceId || req.user?.workspaceId;
    return this.checkoutService.listProducts(wsId);
  }

  @Get('products/:id')
  getProduct(@Request() req: any, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    return this.checkoutService.getProduct(id, workspaceId);
  }

  @Put('products/:id')
  updateProduct(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: Partial<CreateProductDto>,
  ) {
    const workspaceId = req.user?.workspaceId;
    return this.checkoutService.updateProduct(id, workspaceId, dto);
  }

  @Delete('products/:id')
  deleteProduct(@Request() req: any, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    return this.checkoutService.deleteProduct(id, workspaceId);
  }

  // ─── Plans ─────────────────────────────────────────────────────────────────

  @Post('products/:productId/plans')
  async createPlan(
    @Request() req: any,
    @Param('productId') productId: string,
    @Body() dto: CreatePlanDto,
  ) {
    const workspaceId = req.user?.workspaceId;
    const product = await this.prisma.product.findFirst({
      where: { id: productId, workspaceId },
    });
    if (!product) throw new NotFoundException('Produto nao encontrado');
    dto.slug = this.buildSlug(
      dto.slug || `${product.slug || product.name || 'checkout'}-${dto.name || 'oferta'}`,
    );
    dto.brandName = dto.brandName || product.name;
    const createdPlan = await this.checkoutService.createPlan(productId, dto);
    await syncAllWorkspaceCheckoutCouponsForProduct(this.prisma, workspaceId, productId);
    return createdPlan;
  }

  @Put('plans/:id')
  async updatePlan(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: Partial<CreatePlanDto>,
  ) {
    const workspaceId = req.user?.workspaceId;
    const plan = await this.verifyPlanOwnership(id, workspaceId);
    const updatedPlan = await this.checkoutService.updatePlan(id, dto);
    await syncAllWorkspaceCheckoutCouponsForProduct(this.prisma, workspaceId, plan.productId);
    return updatedPlan;
  }

  @Delete('plans/:id')
  async deletePlan(@Request() req: any, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    const plan = await this.verifyPlanOwnership(id, workspaceId);
    if (plan.kind !== 'PLAN') {
      throw new NotFoundException('Plano nao encontrado');
    }
    const deletedPlan = await this.checkoutService.deletePlan(id);
    await syncAllWorkspaceCheckoutCouponsForProduct(this.prisma, workspaceId, plan.productId);
    return deletedPlan;
  }

  @Post('products/:productId/checkouts')
  async createCheckout(
    @Request() req: any,
    @Param('productId') productId: string,
    @Body() dto: CreatePlanDto,
  ) {
    const workspaceId = req.user?.workspaceId;
    const product = await this.prisma.product.findFirst({
      where: { id: productId, workspaceId },
    });
    if (!product) throw new NotFoundException('Produto nao encontrado');
    dto.slug = this.buildSlug(
      dto.slug || `${product.slug || product.name || 'checkout'}-${dto.name || 'layout'}`,
    );
    dto.brandName = dto.brandName || product.name;
    return this.checkoutService.createCheckout(productId, dto);
  }

  @Post('checkouts/:id/duplicate')
  async duplicateCheckout(@Request() req: any, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyCheckoutOwnership(id, workspaceId);
    return this.checkoutService.duplicateCheckout(id);
  }

  @Put('checkouts/:id/links')
  async syncCheckoutLinks(
    @Request() req: any,
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

  @Delete('checkouts/:id')
  async deleteCheckout(@Request() req: any, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyCheckoutOwnership(id, workspaceId);
    return this.checkoutService.deletePlan(id, workspaceId);
  }

  // ─── Checkout Config ──────────────────────────────────────────────────────

  @Get('plans/:planId/config')
  async getConfig(@Request() req: any, @Param('planId') planId: string) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyPlanOwnership(planId, workspaceId);
    return this.checkoutService.getConfig(planId);
  }

  @Patch('plans/:planId/config')
  async updateConfig(
    @Request() req: any,
    @Param('planId') planId: string,
    @Body() dto: UpdateConfigDto,
  ) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyPlanOwnership(planId, workspaceId);
    return this.checkoutService.updateConfig(
      planId,
      dto as unknown as Prisma.CheckoutConfigUpdateInput,
    );
  }

  @Post('plans/:planId/config/reset')
  async resetConfig(@Request() req: any, @Param('planId') planId: string) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyPlanOwnership(planId, workspaceId);
    return this.checkoutService.resetConfig(planId);
  }

  // ─── Order Bumps ──────────────────────────────────────────────────────────

  @Get('plans/:planId/bumps')
  async listBumps(@Request() req: any, @Param('planId') planId: string) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyPlanOwnership(planId, workspaceId);
    return this.checkoutService.listBumps(planId);
  }

  @Post('plans/:planId/bumps')
  async createBump(
    @Request() req: any,
    @Param('planId') planId: string,
    @Body() dto: CreateBumpDto,
  ) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyPlanOwnership(planId, workspaceId);
    return this.checkoutService.createBump(planId, dto);
  }

  @Put('bumps/:id')
  async updateBump(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: Partial<CreateBumpDto>,
  ) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyBumpOwnership(id, workspaceId);
    return this.checkoutService.updateBump(id, dto);
  }

  @Delete('bumps/:id')
  async deleteBump(@Request() req: any, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyBumpOwnership(id, workspaceId);
    return this.checkoutService.deleteBump(id);
  }

  // ─── Upsells ──────────────────────────────────────────────────────────────

  @Get('plans/:planId/upsells')
  async listUpsells(@Request() req: any, @Param('planId') planId: string) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyPlanOwnership(planId, workspaceId);
    return this.checkoutService.listUpsells(planId);
  }

  @Post('plans/:planId/upsells')
  async createUpsell(
    @Request() req: any,
    @Param('planId') planId: string,
    @Body() dto: CreateUpsellDto,
  ) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyPlanOwnership(planId, workspaceId);
    return this.checkoutService.createUpsell(planId, dto);
  }

  @Put('upsells/:id')
  async updateUpsell(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: Partial<CreateUpsellDto>,
  ) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyUpsellOwnership(id, workspaceId);
    return this.checkoutService.updateUpsell(id, dto);
  }

  @Delete('upsells/:id')
  async deleteUpsell(@Request() req: any, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyUpsellOwnership(id, workspaceId);
    return this.checkoutService.deleteUpsell(id);
  }

  // ─── Coupons ──────────────────────────────────────────────────────────────

  @Get('coupons')
  listCoupons(@Request() req: any, @Query('workspaceId') workspaceId?: string) {
    const wsId = workspaceId || req.user?.workspaceId;
    return this.checkoutService.listCoupons(wsId);
  }

  @Post('coupons')
  createCoupon(@Request() req: any, @Body() dto: CreateCouponDto) {
    const workspaceId = req.user?.workspaceId as string;
    return this.checkoutService.createCoupon(workspaceId, dto);
  }

  @Put('coupons/:id')
  updateCoupon(@Param('id') id: string, @Body() dto: Partial<CreateCouponDto>) {
    return this.checkoutService.updateCoupon(id, dto);
  }

  @Delete('coupons/:id')
  deleteCoupon(@Param('id') id: string) {
    return this.checkoutService.deleteCoupon(id);
  }

  // ─── Pixels ───────────────────────────────────────────────────────────────

  @Post('config/:configId/pixels')
  createPixel(@Param('configId') configId: string, @Body() dto: CreatePixelDto) {
    return this.checkoutService.createPixel(configId, dto);
  }

  @Put('pixels/:id')
  updatePixel(@Param('id') id: string, @Body() dto: Partial<CreatePixelDto>) {
    return this.checkoutService.updatePixel(id, dto);
  }

  @Delete('pixels/:id')
  deletePixel(@Param('id') id: string) {
    return this.checkoutService.deletePixel(id);
  }

  // ─── Orders (Dashboard) ──────────────────────────────────────────────────

  @Get('orders')
  listOrders(
    @Request() req: any,
    @Query('workspaceId') workspaceId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const wsId = workspaceId || req.user?.workspaceId;
    const clampedPage = page ? Math.max(parseInt(page, 10) || 1, 1) : undefined;
    const clampedLimit = limit ? Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100) : undefined;
    return this.checkoutService.listOrders(wsId, {
      status,
      page: clampedPage,
      limit: clampedLimit,
    });
  }

  @Get('orders/:id')
  getOrder(@Param('id') id: string) {
    return this.checkoutService.getOrder(id);
  }

  @Patch('orders/:id/status')
  updateOrderStatus(
    @Param('id') id: string,
    @Body()
    body: { status: string; trackingCode?: string; trackingUrl?: string },
  ) {
    const { status, ...extra } = body;
    return this.checkoutService.updateOrderStatus(
      id,
      status,
      Object.keys(extra).length > 0 ? extra : undefined,
    );
  }
}
