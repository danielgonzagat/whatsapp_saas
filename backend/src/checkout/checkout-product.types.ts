/**
 * Input shapes for CheckoutProductService.
 * Extracted to keep the service file under the architecture line budget.
 */
import type { Prisma } from '@prisma/client';

export interface CreateProductInput {
  name: string;
  slug?: string;
  description?: string;
  images?: Prisma.InputJsonValue;
  weight?: number;
  dimensions?: Prisma.InputJsonValue;
  sku?: string;
  stock?: number;
  category?: string;
  status?: string;
  price?: number;
}

export interface CreatePlanInput {
  name: string;
  slug?: string;
  priceInCents: number;
  compareAtPrice?: number;
  currency?: string;
  maxInstallments?: number;
  installmentsFee?: boolean;
  quantity?: number;
  freeShipping?: boolean;
  shippingPrice?: number;
  brandName?: string;
}

export type CreateCheckoutInput = CreatePlanInput;
