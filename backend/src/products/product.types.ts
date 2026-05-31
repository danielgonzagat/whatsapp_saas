import type { Product } from '@prisma/client';

export interface CreateProductDto {
  name: string;
  description?: string;
  price: number;
  category?: string;
  sku?: string;
  tags?: string[];
  format?: 'PHYSICAL' | 'DIGITAL' | 'HYBRID';
  imageUrl?: string;
  salesPageUrl?: string;
  thankyouUrl?: string;
  thankyouBoletoUrl?: string;
  thankyouPixUrl?: string;
  reclameAquiUrl?: string;
  supportEmail?: string;
  warrantyDays?: number;
  shippingType?: string;
  shippingValue?: number;
  originCep?: string;
  affiliateEnabled?: boolean;
  affiliateVisible?: boolean;
  affiliateAutoApprove?: boolean;
  affiliateAccessData?: boolean;
  affiliateAccessAbandoned?: boolean;
  affiliateFirstInstallment?: boolean;
  commissionType?: string;
  commissionPercent?: number;
  commissionCookieDays?: number;
  stockQuantity?: number;
  trackStock?: boolean;
}

export interface UpdateProductDto extends Partial<CreateProductDto> {
  active?: boolean;
  status?: string;
}

export interface ProductListFilters {
  search?: string;
  category?: string;
  active?: boolean;
  status?: string;
  format?: string;
  page?: number;
  limit?: number;
}

export interface ProductResult {
  success: boolean;
  product?: Product;
  message?: string;
}

export interface ProductListResult {
  success: boolean;
  products: Product[];
  count: number;
  page: number;
  limit: number;
}
