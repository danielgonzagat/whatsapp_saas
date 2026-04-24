import type { AffiliateProduct, Prisma } from '@prisma/client';
import { buildPayCheckoutUrl } from '../checkout/checkout-public-url.util';
import { normalizeStorageUrlForRequest } from '../common/storage/public-storage-url.util';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../prisma/prisma.service';

/** Shared lookup type for enriching affiliate products. */
export interface AffiliateProductLookup {
  productById: Map<
    string,
    {
      id: string;
      workspaceId: string;
      name: string;
      description: string | null;
      price: number | null;
      category: string | null;
      imageUrl: string | null;
      tags: string[];
    }
  >;
  workspaceById: Map<string, string>;
  ratingByProductId: Map<string, { average: number; total: number }>;
  requestByAffiliateProductId: Map<string, { affiliateProductId: string; status: string }>;
  linkByAffiliateProductId: Map<string, { affiliateProductId: string; code: string }>;
}

/** Serialize an affiliate product for an HTTP response (normalizes thumbnailUrl). */
export function serializeAffiliateProductForResponse<T extends { thumbnailUrl: string | null }>(
  req: AuthenticatedRequest,
  product: T | null | undefined,
): (T & { thumbnailUrl: string | null }) | null {
  if (!product) {
    return null;
  }
  return {
    ...product,
    thumbnailUrl: normalizeStorageUrlForRequest(product.thumbnailUrl, req) || null,
  };
}

/** Build a full affiliate link URL from a short code. */
export function buildAffiliateLinkUrl(req: AuthenticatedRequest, code: string | null | undefined) {
  return buildPayCheckoutUrl(req, code);
}

/** Normalize promoMaterials from a Prisma JSON value into a string[]. */
export function normalizePromoMaterials(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry) => typeof entry === 'string');
  }
  if (
    value &&
    typeof value === 'object' &&
    'items' in value &&
    Array.isArray((value as { items?: unknown[] }).items)
  ) {
    return ((value as { items: unknown[] }).items || []).filter(
      (entry): entry is string => typeof entry === 'string',
    );
  }
  return [];
}

/** Build the Prisma where clause for marketplace queries. */
export function buildMarketplaceWhere(
  baseWhere: Prisma.AffiliateProductWhereInput,
): Prisma.AffiliateProductWhereInput {
  return baseWhere;
}

/** Enrich a list of AffiliateProducts with product/workspace/rating/request/link data. */
export async function enrichAffiliateProducts(
  prisma: PrismaService,
  req: AuthenticatedRequest,
  affiliateProducts: AffiliateProduct[],
  viewerWorkspaceId?: string,
) {
  if (!affiliateProducts.length) {
    return [];
  }

  const productIds = affiliateProducts.map((item) => item.productId);
  const affiliateProductIds = affiliateProducts.map((item) => item.id);

  const [products, ratings, viewerRequests, viewerLinks] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        workspaceId: true,
        name: true,
        description: true,
        price: true,
        category: true,
        imageUrl: true,
        tags: true,
      },
    }),
    prisma.productReview.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds } },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    viewerWorkspaceId
      ? prisma.affiliateRequest.findMany({
          where: {
            affiliateWorkspaceId: viewerWorkspaceId,
            affiliateProductId: { in: affiliateProductIds },
          },
        })
      : Promise.resolve([]),
    viewerWorkspaceId
      ? prisma.affiliateLink.findMany({
          where: {
            affiliateWorkspaceId: viewerWorkspaceId,
            affiliateProductId: { in: affiliateProductIds },
          },
        })
      : Promise.resolve([]),
  ]);

  const workspaceIds = [...new Set(products.map((product) => product.workspaceId))];
  const workspaces = workspaceIds.length
    ? await prisma.workspace.findMany({
        where: { id: { in: workspaceIds } },
        select: { id: true, name: true },
      })
    : [];

  const productById = new Map(products.map((product) => [product.id, product]));
  const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace.name]));
  const ratingByProductId = new Map(
    ratings.map((rating) => [
      rating.productId,
      {
        average: Number(rating._avg.rating || 0),
        total: rating._count._all,
      },
    ]),
  );
  const requestByAffiliateProductId = new Map(
    viewerRequests.map((request) => [request.affiliateProductId, request]),
  );
  const linkByAffiliateProductId = new Map(
    viewerLinks.map((link) => [link.affiliateProductId, link]),
  );

  const lookup: AffiliateProductLookup = {
    productById,
    workspaceById,
    ratingByProductId,
    requestByAffiliateProductId,
    linkByAffiliateProductId,
  };

  return affiliateProducts.map((affiliateProduct) =>
    buildEnrichedAffiliateProduct(req, affiliateProduct, lookup),
  );
}

/** Build a single enriched affiliate product object. */
export function buildEnrichedAffiliateProduct(
  req: AuthenticatedRequest,
  affiliateProduct: AffiliateProduct,
  lookup: AffiliateProductLookup,
) {
  const product = lookup.productById.get(affiliateProduct.productId);
  const request = lookup.requestByAffiliateProductId.get(affiliateProduct.id);
  const link = lookup.linkByAffiliateProductId.get(affiliateProduct.id);
  const rating = lookup.ratingByProductId.get(affiliateProduct.productId);
  const thumbnailUrl =
    normalizeStorageUrlForRequest(affiliateProduct.thumbnailUrl || product?.imageUrl, req) || null;
  const status = request?.status;

  return {
    ...serializeAffiliateProductForResponse(req, affiliateProduct),
    name: product?.name || 'Produto',
    description: product?.description || '',
    price: Number(product?.price || 0),
    category: affiliateProduct.category || product?.category || 'Geral',
    tags: affiliateProduct.tags?.length > 0 ? affiliateProduct.tags : product?.tags || [],
    thumbnailUrl,
    imageUrl: thumbnailUrl,
    producer: lookup.workspaceById.get(product?.workspaceId || '') || 'Kloel',
    commission: affiliateProduct.commissionPct,
    rating: Number((rating?.average || 0).toFixed(1)),
    totalReviews: rating?.total || 0,
    materials: normalizePromoMaterials(affiliateProduct.promoMaterials),
    requestStatus: status || null,
    affiliateLink: buildAffiliateLinkUrl(req, link?.code),
    isSaved: status === 'SAVED',
    isApproved: status === 'APPROVED',
    isPending: status === 'PENDING',
  };
}
