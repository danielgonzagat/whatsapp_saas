import { Module } from '@nestjs/common';
import { CheckoutController } from './checkout.controller';
import { CheckoutPublicController } from './checkout-public.controller';
import { CheckoutService } from './checkout.service';

@Module({
  controllers: [CheckoutController, CheckoutPublicController],
  providers: [CheckoutService],
  exports: [CheckoutService],
})
export class CheckoutModule {}
