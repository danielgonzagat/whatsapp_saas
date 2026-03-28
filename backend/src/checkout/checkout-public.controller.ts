import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Ip,
  Headers,
  Logger,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { CheckoutService } from './checkout.service';

@Controller('checkout/public')
@Public()
export class CheckoutPublicController {
  private readonly logger = new Logger(CheckoutPublicController.name);

  constructor(private readonly checkoutService: CheckoutService) {}

  @Get(':slug')
  getCheckoutBySlug(@Param('slug') slug: string) {
    return this.checkoutService.getCheckoutBySlug(slug);
  }

  @Get('r/:code')
  getCheckoutByCode(@Param('code') code: string) {
    return this.checkoutService.getCheckoutByCode(code);
  }

  @Post('validate-coupon')
  validateCoupon(@Body() body: { workspaceId: string; code: string; planId: string; orderValue: number }) {
    return this.checkoutService.validateCoupon(
      body.workspaceId,
      body.code,
      body.planId,
      body.orderValue,
    );
  }

  @Post('order')
  createOrder(
    @Body() body: any,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.checkoutService.createOrder({
      ...body,
      ipAddress: ip,
      userAgent,
    });
  }

  @Get('order/:orderId/status')
  getOrderStatus(@Param('orderId') orderId: string) {
    return this.checkoutService.getOrderStatus(orderId);
  }

  @Post('upsell/:orderId/accept/:upsellId')
  acceptUpsell(
    @Param('orderId') orderId: string,
    @Param('upsellId') upsellId: string,
  ) {
    return this.checkoutService.acceptUpsell(orderId, upsellId);
  }

  @Post('upsell/:orderId/decline/:upsellId')
  declineUpsell(
    @Param('orderId') orderId: string,
    @Param('upsellId') upsellId: string,
  ) {
    return this.checkoutService.declineUpsell(orderId, upsellId);
  }
}
