import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_PUBLIC_CHECKOUT_CODE_LENGTH,
  isValidPublicCheckoutCode,
  normalizePublicCheckoutCode,
} from './checkout-code.util';
import { CheckoutCatalogService } from './checkout-catalog.service';
import { CheckoutOrderService } from './checkout-order.service';
import { CheckoutProductService } from './checkout-product.service';
import { CheckoutPublicPayloadBuilder } from './checkout-public-payload.builder';

export type { CheckoutOrderStatusValue } from './checkout-order-status';
import "../../../scripts/pulse/__companions__/checkout.service.companion";
