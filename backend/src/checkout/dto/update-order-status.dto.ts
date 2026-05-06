import { IsIn, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { CHECKOUT_ORDER_STATUSES } from '../checkout-order-status';

/** Update order status dto. */
export class UpdateOrderStatusDto {
  /** Order status property. */
  @IsIn(CHECKOUT_ORDER_STATUSES, { message: 'Status inválido' })
  status: (typeof CHECKOUT_ORDER_STATUSES)[number];

  /** Tracking code property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  trackingCode?: string;

  /** Tracking url property. */
  @IsOptional()
  @IsString()
  @IsUrl({ require_tld: false }, { message: 'trackingUrl deve ser uma URL válida' })
  trackingUrl?: string;
}
