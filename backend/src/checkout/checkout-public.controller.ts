import { randomUUID } from 'crypto';
import { Body, Controller, Get, Headers, Ip, Logger, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import { Idempotent } from '../common/idempotency.guard';
import { CheckoutService } from './checkout.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Controller('checkout/public')
@Public()
@Throttle({ default: { limit: 30, ttl: 60000 } })
export class CheckoutPublicController {
  private readonly logger = new Logger(CheckoutPublicController.name);

  constructor(private readonly checkoutService: CheckoutService) {}

  @Get('recent-sales')
  async getRecentSales(@Query('limit') limit?: string) {
    const take = Math.min(Number.parseInt(limit || '5'), 10);
    const recent = await this.checkoutService.getRecentPaidOrders(take);
    return recent.map((order) => ({
      name: this.maskName(order.customerName || 'Cliente'),
      product: order.plan?.product?.name || order.plan?.name || 'Produto',
      time: this.timeAgo(order.paidAt || order.createdAt),
    }));
  }

  private maskName(name: string): string {
    const parts = name.trim().split(' ');
    if (parts.length === 0) return 'C***';
    const first = parts[0];
    const masked = first[0] + '***' + (first.length > 3 ? first.slice(-1) : '');
    return parts.length > 1 ? `${masked} ${parts[parts.length - 1][0]}.` : masked;
  }

  // All dates stored as UTC via Prisma DateTime (toISOString)
  private timeAgo(date: Date): string {
    const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
    if (mins < 60) return `${mins}min`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h`;
    return `${Math.floor(mins / 1440)}d`;
  }

  private resolveCorrelationId(requestId?: string, correlationId?: string) {
    const candidate = String(correlationId || requestId || '').trim();
    return candidate || randomUUID();
  }

  @Get('r/:code')
  getCheckoutByCode(
    @Param('code') code: string,
    @Headers('x-request-id') requestId?: string,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    return this.checkoutService.getCheckoutByCode(code, {
      correlationId: this.resolveCorrelationId(requestId, correlationId),
    });
  }

  @Get(':slug')
  getCheckoutBySlug(
    @Param('slug') slug: string,
    @Headers('x-request-id') requestId?: string,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    return this.checkoutService.getCheckoutBySlug(slug, {
      correlationId: this.resolveCorrelationId(requestId, correlationId),
    });
  }

  @Post('validate-coupon')
  validateCoupon(
    @Body()
    body: {
      workspaceId: string;
      code: string;
      planId: string;
      orderValue: number;
    },
  ) {
    return this.checkoutService.validateCoupon(
      body.workspaceId,
      body.code,
      body.planId,
      body.orderValue,
    );
  }

  @Post('order')
  @Idempotent()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  createOrder(
    @Body() dto: CreateOrderDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
    @Headers('x-meli-session-id') meliSessionId: string,
    @Headers('x-request-id') requestId?: string,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    return this.checkoutService.createOrder({
      ...dto,
      ipAddress: ip,
      userAgent,
      meliSessionId,
      correlationId: this.resolveCorrelationId(requestId, correlationId),
    });
  }

  @Get('order/:orderId/status')
  getOrderStatus(@Param('orderId') orderId: string) {
    return this.checkoutService.getOrderStatus(orderId);
  }

  @Post('upsell/:orderId/accept/:upsellId')
  acceptUpsell(@Param('orderId') orderId: string, @Param('upsellId') upsellId: string) {
    return this.checkoutService.acceptUpsell(orderId, upsellId);
  }

  @Post('upsell/:orderId/decline/:upsellId')
  declineUpsell(@Param('orderId') orderId: string, @Param('upsellId') upsellId: string) {
    return this.checkoutService.declineUpsell(orderId, upsellId);
  }

  @Post('shipping')
  async calculateShipping(@Body() body: { slug: string; cep: string }) {
    return this.checkoutService.calculateShipping(body.slug, body.cep);
  }
}
