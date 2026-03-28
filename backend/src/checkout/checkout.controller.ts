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
import { CheckoutService } from './checkout.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdateConfigDto } from './dto/update-config.dto';
import { CreateBumpDto } from './dto/create-bump.dto';
import { CreateUpsellDto } from './dto/create-upsell.dto';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { CreatePixelDto } from './dto/create-pixel.dto';

@Controller('checkout')
@UseGuards(JwtAuthGuard)
export class CheckoutController {
  private readonly logger = new Logger(CheckoutController.name);

  constructor(
    private readonly checkoutService: CheckoutService,
    private readonly prisma: PrismaService,
  ) {}

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

  private async verifyBumpOwnership(bumpId: string, workspaceId: string) {
    const bump = await this.prisma.orderBump.findFirst({
      where: { id: bumpId },
      include: { plan: { include: { product: { select: { workspaceId: true } } } } },
    });
    if (!bump || bump.plan.product.workspaceId !== workspaceId) {
      throw new NotFoundException('Bump nao encontrado');
    }
    return bump;
  }

  private async verifyUpsellOwnership(upsellId: string, workspaceId: string) {
    const upsell = await this.prisma.upsell.findFirst({
      where: { id: upsellId },
      include: { plan: { include: { product: { select: { workspaceId: true } } } } },
    });
    if (!upsell || upsell.plan.product.workspaceId !== workspaceId) {
      throw new NotFoundException('Upsell nao encontrado');
    }
    return upsell;
  }

  // ─── Products ──────────────────────────────────────────────────────────────

  @Post('products')
  createProduct(@Request() req: any, @Body() dto: CreateProductDto) {
    const workspaceId = req.user?.workspaceId || (dto as any).workspaceId;
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
  updateProduct(@Request() req: any, @Param('id') id: string, @Body() dto: Partial<CreateProductDto>) {
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
  async createPlan(@Request() req: any, @Param('productId') productId: string, @Body() dto: CreatePlanDto) {
    const workspaceId = req.user?.workspaceId;
    const product = await this.prisma.physicalProduct.findFirst({ where: { id: productId, workspaceId } });
    if (!product) throw new NotFoundException('Produto nao encontrado');
    return this.checkoutService.createPlan(productId, dto);
  }

  @Put('plans/:id')
  async updatePlan(@Request() req: any, @Param('id') id: string, @Body() dto: Partial<CreatePlanDto>) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyPlanOwnership(id, workspaceId);
    return this.checkoutService.updatePlan(id, dto);
  }

  @Delete('plans/:id')
  async deletePlan(@Request() req: any, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyPlanOwnership(id, workspaceId);
    return this.checkoutService.deletePlan(id);
  }

  // ─── Checkout Config ──────────────────────────────────────────────────────

  @Get('plans/:planId/config')
  async getConfig(@Request() req: any, @Param('planId') planId: string) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyPlanOwnership(planId, workspaceId);
    return this.checkoutService.getConfig(planId);
  }

  @Patch('plans/:planId/config')
  async updateConfig(@Request() req: any, @Param('planId') planId: string, @Body() dto: UpdateConfigDto) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyPlanOwnership(planId, workspaceId);
    return this.checkoutService.updateConfig(planId, dto);
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
  async createBump(@Request() req: any, @Param('planId') planId: string, @Body() dto: CreateBumpDto) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyPlanOwnership(planId, workspaceId);
    return this.checkoutService.createBump(planId, dto);
  }

  @Put('bumps/:id')
  async updateBump(@Request() req: any, @Param('id') id: string, @Body() dto: Partial<CreateBumpDto>) {
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
  async createUpsell(@Request() req: any, @Param('planId') planId: string, @Body() dto: CreateUpsellDto) {
    const workspaceId = req.user?.workspaceId;
    await this.verifyPlanOwnership(planId, workspaceId);
    return this.checkoutService.createUpsell(planId, dto);
  }

  @Put('upsells/:id')
  async updateUpsell(@Request() req: any, @Param('id') id: string, @Body() dto: Partial<CreateUpsellDto>) {
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
    const workspaceId = req.user?.workspaceId || (dto as any).workspaceId;
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
    return this.checkoutService.listOrders(wsId, {
      status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('orders/:id')
  getOrder(@Param('id') id: string) {
    return this.checkoutService.getOrder(id);
  }

  @Patch('orders/:id/status')
  updateOrderStatus(@Param('id') id: string, @Body() body: { status: string; trackingCode?: string; trackingUrl?: string }) {
    const { status, ...extra } = body;
    return this.checkoutService.updateOrderStatus(id, status, Object.keys(extra).length > 0 ? extra : undefined);
  }
}
