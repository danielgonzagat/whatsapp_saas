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
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CheckoutService } from './checkout.service';

@Controller('checkout')
@UseGuards(JwtAuthGuard)
export class CheckoutController {
  private readonly logger = new Logger(CheckoutController.name);

  constructor(private readonly checkoutService: CheckoutService) {}

  // ─── Products ──────────────────────────────────────────────────────────────

  @Post('products')
  createProduct(@Request() req: any, @Body() body: any) {
    const workspaceId = req.user?.workspaceId || body.workspaceId;
    return this.checkoutService.createProduct(workspaceId, body);
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
  updateProduct(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    const workspaceId = req.user?.workspaceId;
    return this.checkoutService.updateProduct(id, workspaceId, body);
  }

  @Delete('products/:id')
  deleteProduct(@Request() req: any, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    return this.checkoutService.deleteProduct(id, workspaceId);
  }

  // ─── Plans ─────────────────────────────────────────────────────────────────

  @Post('products/:productId/plans')
  createPlan(@Param('productId') productId: string, @Body() body: any) {
    return this.checkoutService.createPlan(productId, body);
  }

  @Put('plans/:id')
  updatePlan(@Param('id') id: string, @Body() body: any) {
    return this.checkoutService.updatePlan(id, body);
  }

  @Delete('plans/:id')
  deletePlan(@Param('id') id: string) {
    return this.checkoutService.deletePlan(id);
  }

  // ─── Checkout Config ──────────────────────────────────────────────────────

  @Get('plans/:planId/config')
  getConfig(@Param('planId') planId: string) {
    return this.checkoutService.getConfig(planId);
  }

  @Patch('plans/:planId/config')
  updateConfig(@Param('planId') planId: string, @Body() body: any) {
    return this.checkoutService.updateConfig(planId, body);
  }

  // ─── Order Bumps ──────────────────────────────────────────────────────────

  @Get('plans/:planId/bumps')
  listBumps(@Param('planId') planId: string) {
    return this.checkoutService.listBumps(planId);
  }

  @Post('plans/:planId/bumps')
  createBump(@Param('planId') planId: string, @Body() body: any) {
    return this.checkoutService.createBump(planId, body);
  }

  @Put('bumps/:id')
  updateBump(@Param('id') id: string, @Body() body: any) {
    return this.checkoutService.updateBump(id, body);
  }

  @Delete('bumps/:id')
  deleteBump(@Param('id') id: string) {
    return this.checkoutService.deleteBump(id);
  }

  // ─── Upsells ──────────────────────────────────────────────────────────────

  @Get('plans/:planId/upsells')
  listUpsells(@Param('planId') planId: string) {
    return this.checkoutService.listUpsells(planId);
  }

  @Post('plans/:planId/upsells')
  createUpsell(@Param('planId') planId: string, @Body() body: any) {
    return this.checkoutService.createUpsell(planId, body);
  }

  @Put('upsells/:id')
  updateUpsell(@Param('id') id: string, @Body() body: any) {
    return this.checkoutService.updateUpsell(id, body);
  }

  @Delete('upsells/:id')
  deleteUpsell(@Param('id') id: string) {
    return this.checkoutService.deleteUpsell(id);
  }

  // ─── Coupons ──────────────────────────────────────────────────────────────

  @Get('coupons')
  listCoupons(@Request() req: any, @Query('workspaceId') workspaceId?: string) {
    const wsId = workspaceId || req.user?.workspaceId;
    return this.checkoutService.listCoupons(wsId);
  }

  @Post('coupons')
  createCoupon(@Request() req: any, @Body() body: any) {
    const workspaceId = req.user?.workspaceId || body.workspaceId;
    return this.checkoutService.createCoupon(workspaceId, body);
  }

  @Put('coupons/:id')
  updateCoupon(@Param('id') id: string, @Body() body: any) {
    return this.checkoutService.updateCoupon(id, body);
  }

  @Delete('coupons/:id')
  deleteCoupon(@Param('id') id: string) {
    return this.checkoutService.deleteCoupon(id);
  }

  // ─── Pixels ───────────────────────────────────────────────────────────────

  @Post('config/:configId/pixels')
  createPixel(@Param('configId') configId: string, @Body() body: any) {
    return this.checkoutService.createPixel(configId, body);
  }

  @Put('pixels/:id')
  updatePixel(@Param('id') id: string, @Body() body: any) {
    return this.checkoutService.updatePixel(id, body);
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
