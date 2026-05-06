// Pure helpers extracted from KloelDashboard.tsx to reduce cyclomatic
// complexity. No React, no JSX — these are data-shape transforms only.

import { secureRandomFloat } from '@/lib/secure-random';
import {
  KLOEL_CHAT_CAPABILITY_PLACEHOLDERS,
  type KloelChatAttachment,
  type KloelChatCapability,
  type KloelLinkedProduct,
} from '@/lib/kloel-chat';

export interface OwnedProductSummary {
  id?: string | null;
  name?: string | null;
  imageUrl?: string | null;
  status?: string | null;
  active?: boolean | null;
  category?: string | null;
}

export interface OwnedProductsPayload {
  products?: OwnedProductSummary[] | null;
}

export interface AffiliateCatalogProduct {
  id?: string | null;
  productId?: string | null;
  name?: string | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  price?: number | null;
  category?: string | null;
}

export type AffiliateRequestRow = {
  id: string;
  status?: string | null;
  affiliateProductId?: string | null;
  affiliateProduct?: AffiliateCatalogProduct | null;
};

/** Json record type. */
export type JsonRecord = Record<string, unknown>;

/** Is record. */
export function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Unwrap api payload. */
export function unwrapApiPayload<T>(payload: unknown): T {
  if (isRecord(payload) && payload.data !== undefined) {
    return payload.data as T;
  }
  return payload as T;
}

/** To message metadata. */
export function toMessageMetadata(metadata: unknown): JsonRecord | null {
  return isRecord(metadata) ? metadata : null;
}

/** To error message. */
export function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (isRecord(error) && typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

/** Capability prompt label. */
export function capabilityPromptLabel(
  capability: KloelChatCapability | null,
  hasMessages: boolean,
) {
  if (capability) {
    return KLOEL_CHAT_CAPABILITY_PLACEHOLDERS[capability];
  }
  return hasMessages ? 'Responder...' : 'Como posso ajudar você hoje?';
}

/** Create client request id. */
export function createClientRequestId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `kloel_${Date.now()}_${secureRandomFloat().toString(36).slice(2, 10)}`
  );
}

/** Has dragged files. */
export function hasDraggedFiles(dataTransfer: DataTransfer | null | undefined) {
  if (!dataTransfer) {
    return false;
  }
  if (dataTransfer.files && dataTransfer.files.length > 0) {
    return true;
  }
  return Array.from(dataTransfer.items || []).some((item) => item.kind === 'file');
}

/** Get greeting. */
export function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return 'Bom dia';
  }
  if (hour >= 12 && hour < 18) {
    return 'Boa tarde';
  }
  if (hour >= 18) {
    return 'Boa noite';
  }
  return 'Boa madrugada';
}

/** Compute attachment kind. */
export function computeAttachmentKind(file: File): KloelChatAttachment['kind'] {
  if (file.type.startsWith('image/')) {
    return 'image';
  }
  if (file.type.startsWith('audio/')) {
    return 'audio';
  }
  return 'document';
}

/** Compute drain step. */
export function computeDrainStep(bufferLength: number) {
  if (bufferLength > 280) {
    return 28;
  }
  if (bufferLength > 120) {
    return 18;
  }
  if (bufferLength > 48) {
    return 10;
  }
  return 5;
}

function resolveOwnedProductStatus(product: OwnedProductSummary): KloelLinkedProduct['status'] {
  const rawStatus = String(product.status || '')
    .trim()
    .toUpperCase();
  if (product.active || rawStatus === 'PUBLISHED' || rawStatus === 'APPROVED') {
    return 'published';
  }
  return 'draft';
}

/** Map linkable products from API payloads. */
export function mapLinkableProducts(payload: {
  owned: OwnedProductsPayload | null;
  affiliate: {
    items?: AffiliateRequestRow[] | null;
    products?: AffiliateRequestRow[] | null;
  } | null;
}): KloelLinkedProduct[] {
  const ownedProducts = Array.isArray(payload.owned?.products) ? payload.owned?.products : [];
  const affiliateItems = Array.isArray(payload.affiliate?.products)
    ? payload.affiliate?.products
    : Array.isArray(payload.affiliate?.items)
      ? payload.affiliate?.items
      : [];

  const owned = ownedProducts.map((product) => ({
    id: String(product.id || ''),
    source: 'owned' as const,
    name: String(product.name || 'Produto sem nome').trim() || 'Produto sem nome',
    imageUrl: typeof product.imageUrl === 'string' ? product.imageUrl : null,
    status: resolveOwnedProductStatus(product),
    productId: String(product.id || ''),
    subtitle:
      typeof product.category === 'string' && product.category.trim()
        ? product.category.trim()
        : null,
  }));

  const affiliate = affiliateItems
    .filter((request) => {
      const status = String(request.status || '')
        .trim()
        .toUpperCase();
      return status === 'APPROVED' || request.affiliateProduct;
    })
    .map((request) => {
      const affiliateProduct = request.affiliateProduct || {};
      const affiliateProductId = String(
        affiliateProduct.id || request.affiliateProductId || '',
      ).trim();
      return {
        id: affiliateProductId,
        source: 'affiliate' as const,
        name: String(affiliateProduct.name || 'Produto afiliado').trim() || 'Produto afiliado',
        imageUrl:
          typeof affiliateProduct.imageUrl === 'string'
            ? affiliateProduct.imageUrl
            : typeof affiliateProduct.thumbnailUrl === 'string'
              ? affiliateProduct.thumbnailUrl
              : null,
        status: 'affiliate' as const,
        productId:
          typeof affiliateProduct.productId === 'string' ? affiliateProduct.productId : null,
        affiliateProductId,
        subtitle:
          typeof affiliateProduct.category === 'string' && affiliateProduct.category.trim()
            ? affiliateProduct.category.trim()
            : 'Marketplace',
      };
    })
    .filter((product) => product.id);

  return [...owned, ...affiliate];
}
