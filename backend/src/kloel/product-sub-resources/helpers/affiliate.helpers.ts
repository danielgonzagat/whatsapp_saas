import { BadRequestException } from '@nestjs/common';
import { generateUniquePublicCheckoutCode } from '../../../checkout/checkout-code.util';
import { buildPayCheckoutUrl } from '../../../checkout/checkout-public-url.util';
import { AuthenticatedRequest } from '../../../common/interfaces';
import { normalizeStorageUrlForRequest } from '../../../common/storage/public-storage-url.util';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  LooseObject,
  assertPercentageRange,
  isValidEmail,
  normalizeOptionalEmail,
  normalizeOptionalText,
  parseNumber,
  safeStr,
  toStringList,
} from './common.helpers';

export type AffiliateCodeClient = Pick<
  PrismaService,
  'checkoutProductPlan' | 'checkoutPlanLink' | 'affiliateLink'
>;

export const COMMISSION_ROLE_VALUES = ['COPRODUCER', 'MANAGER', 'AFFILIATE'] as const;
export const COMMISSION_PARTNER_INVITE_ROLES = new Set(['COPRODUCER', 'MANAGER']);
export const PRODUCT_COMMISSION_TYPE_VALUES = [
  'first_click',
  'last_click',
  'proportional',
] as const;

function normalizeCommissionRole(value: unknown): string | null {
  const role = safeStr(value).trim().toUpperCase();
  return (COMMISSION_ROLE_VALUES as readonly string[]).includes(role) ? role : null;
}

function resolveCommissionRole(body: LooseObject, current?: LooseObject): string {
  const role = normalizeCommissionRole(body.role ?? current?.role);
  if (!role) {
    throw new BadRequestException('Role da comissão é obrigatório e precisa ser válido');
  }
  return role;
}

function resolveCommissionPercentage(body: LooseObject, current?: LooseObject): number {
  const percentage = parseNumber(body.percentage ?? current?.percentage);
  if (percentage === undefined) {
    throw new BadRequestException('Percentual da comissão é obrigatório');
  }
  assertPercentageRange(percentage, 'O percentual da comissão');
  return percentage;
}

function resolveCommissionPartner(body: LooseObject, current?: LooseObject) {
  const agentName = normalizeOptionalText(body.agentName ?? current?.agentName);
  const agentEmail = normalizeOptionalEmail(body.agentEmail ?? current?.agentEmail);

  if (!agentName && !agentEmail) {
    throw new BadRequestException('Informe ao menos nome ou e-mail do parceiro desta comissão');
  }

  if (agentEmail && !isValidEmail(agentEmail)) {
    throw new BadRequestException('E-mail do parceiro é inválido');
  }

  return { agentName, agentEmail };
}

export function buildCommissionPayload(body: LooseObject, current?: LooseObject) {
  const role = resolveCommissionRole(body, current);
  const percentage = resolveCommissionPercentage(body, current);
  const { agentName, agentEmail } = resolveCommissionPartner(body, current);

  return { role, percentage, agentName, agentEmail };
}

export async function ensureNoDuplicateCommission(
  prisma: PrismaService,
  productId: string,
  payload: {
    role: string;
    agentName: string | null;
    agentEmail: string | null;
  },
  ignoreCommissionId?: string,
) {
  const existing = await prisma.productCommission.findMany({
    where: {
      productId,
      role: payload.role,
      ...(ignoreCommissionId ? { id: { not: ignoreCommissionId } } : {}),
    },
    select: {
      id: true,
      agentName: true,
      agentEmail: true,
    },
  });

  const normalizedName = normalizeOptionalText(payload.agentName);
  const normalizedEmail = normalizeOptionalEmail(payload.agentEmail);
  const matchesByEmail = (entryEmail: string | null) =>
    Boolean(normalizedEmail && entryEmail === normalizedEmail);
  const matchesByName = (entryName: string | null) =>
    Boolean(
      !normalizedEmail &&
      normalizedName &&
      entryName &&
      entryName.toLowerCase() === normalizedName.toLowerCase(),
    );
  const duplicate = existing.find((entry) => {
    const entryEmail = normalizeOptionalEmail(entry.agentEmail);
    const entryName = normalizeOptionalText(entry.agentName);
    return matchesByEmail(entryEmail) || matchesByName(entryName);
  });

  if (duplicate) {
    throw new BadRequestException(
      'Já existe uma comissão com esse parceiro e papel para este produto',
    );
  }
}

async function isPublicCheckoutCodeTaken(prisma: AffiliateCodeClient, code: string) {
  const [plan, checkoutLink, affiliateLink] = await Promise.all([
    prisma.checkoutProductPlan.findFirst({
      where: { referenceCode: code },
      select: { id: true },
    }),
    prisma.checkoutPlanLink.findFirst({
      where: { referenceCode: code },
      select: { id: true },
    }),
    prisma.affiliateLink.findFirst({
      where: { code },
      select: { id: true },
    }),
  ]);

  return Boolean(plan || checkoutLink || affiliateLink);
}

export async function generateAffiliatePublicCode(prisma: AffiliateCodeClient) {
  return generateUniquePublicCheckoutCode((candidate) =>
    isPublicCheckoutCodeTaken(prisma, candidate),
  );
}

function serializeAffiliateProductForResponse(
  req: AuthenticatedRequest,
  product: LooseObject | null,
) {
  if (!product) {
    return product;
  }

  return {
    ...product,
    thumbnailUrl:
      normalizeStorageUrlForRequest(product.thumbnailUrl as string | null | undefined, req) || null,
  };
}

function buildAffiliateLinkUrl(req: AuthenticatedRequest, code: string | null | undefined) {
  return buildPayCheckoutUrl(req, code);
}

function normalizeAffiliatePromoMaterials(product: LooseObject) {
  const materials = new Set<string>();
  const merchandContent = safeStr(product.merchandContent).trim();
  const affiliateTerms = safeStr(product.affiliateTerms).trim();

  for (const entry of toStringList(product.promoMaterials)) {
    materials.add(entry);
  }

  if (merchandContent) {
    materials.add(merchandContent);
  }

  if (affiliateTerms) {
    materials.add(`TERMOS\n${affiliateTerms}`);
  }

  return Array.from(materials);
}

export function buildAffiliateProductData(product: LooseObject) {
  return {
    listed: Boolean(product.affiliateEnabled) && Boolean(product.affiliateVisible),
    commissionPct: parseNumber(product.commissionPercent) ?? 30,
    commissionType: 'PERCENTAGE',
    cookieDays: parseNumber(product.commissionCookieDays) ?? 180,
    approvalMode: product.affiliateAutoApprove === false ? 'MANUAL' : 'AUTO',
    category: normalizeOptionalText(product.category) ?? '',
    tags: toStringList(product.tags),
    thumbnailUrl: normalizeOptionalText(product.imageUrl),
    promoMaterials: normalizeAffiliatePromoMaterials(product),
  };
}

type AffiliateLinkCounter = {
  affiliateWorkspaceId: string | null;
  active: boolean | null;
  sales: number | null;
  revenue: number | null;
};

function computeAffiliateCounters(links: AffiliateLinkCounter[]) {
  const totalAffiliates = new Set(
    links
      .filter((link) => link.active)
      .map((link) => link.affiliateWorkspaceId)
      .filter(Boolean),
  ).size;
  const totalSales = links.reduce((sum, link) => sum + Number(link.sales || 0), 0);
  const totalRevenue = links.reduce((sum, link) => sum + Number(link.revenue || 0), 0);
  return { totalAffiliates, totalSales, totalRevenue };
}

export async function recalculateAffiliateProductCounters(
  prisma: PrismaService,
  affiliateProductId: string,
) {
  const links = await prisma.affiliateLink.findMany({
    where: { affiliateProductId },
    select: {
      affiliateWorkspaceId: true,
      active: true,
      sales: true,
      revenue: true,
    },
  });

  await prisma.affiliateProduct.update({
    where: { id: affiliateProductId },
    data: computeAffiliateCounters(links),
  });
}

function emptyAffiliateSummary() {
  return {
    affiliateProduct: null,
    requests: [],
    links: [],
    stats: {
      requests: 0,
      pendingRequests: 0,
      approvedRequests: 0,
      rejectedRequests: 0,
      activeLinks: 0,
      clicks: 0,
      sales: 0,
      revenue: 0,
      commission: 0,
    },
  };
}

export async function buildAffiliateSummary(
  prisma: PrismaService,
  req: AuthenticatedRequest,
  productId: string,
) {
  const affiliateProduct = await prisma.affiliateProduct.findUnique({
    where: { productId },
    include: {
      requests: { orderBy: { createdAt: 'desc' } },
      links: { orderBy: { createdAt: 'desc' } },
    },
  });

  if (!affiliateProduct) {
    return emptyAffiliateSummary();
  }

  const workspaceIds = [
    ...new Set(
      [
        ...affiliateProduct.requests.map((request) => request.affiliateWorkspaceId),
        ...affiliateProduct.links.map((link) => link.affiliateWorkspaceId),
      ].filter(Boolean),
    ),
  ];

  const workspaces = workspaceIds.length
    ? await prisma.workspace.findMany({
        where: { id: { in: workspaceIds } },
        select: { id: true, name: true },
      })
    : [];
  const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace.name]));

  const requests = affiliateProduct.requests.map((request) => ({
    ...request,
    affiliateName:
      request.affiliateName || workspaceById.get(request.affiliateWorkspaceId) || 'Afiliado',
  }));

  const requestByWorkspaceId = new Map(
    requests.map((request) => [request.affiliateWorkspaceId, request]),
  );

  const links = affiliateProduct.links.map((link) => {
    const linkedRequest = requestByWorkspaceId.get(link.affiliateWorkspaceId);
    return {
      ...link,
      affiliateName:
        linkedRequest?.affiliateName || workspaceById.get(link.affiliateWorkspaceId) || 'Afiliado',
      affiliateEmail: linkedRequest?.affiliateEmail || null,
      slug: link.code,
      url: buildAffiliateLinkUrl(req, link.code),
    };
  });

  const pendingRequests = requests.filter((request) => request.status === 'PENDING').length;
  const approvedRequests = requests.filter((request) => request.status === 'APPROVED').length;
  const rejectedRequests = requests.filter((request) => request.status === 'REJECTED').length;
  const activeLinks = links.filter((link) => link.active).length;
  const clicks = links.reduce((sum, link) => sum + Number(link.clicks || 0), 0);
  const sales = links.reduce((sum, link) => sum + Number(link.sales || 0), 0);
  const revenue = links.reduce((sum, link) => sum + Number(link.revenue || 0), 0);
  const commission = links.reduce((sum, link) => sum + Number(link.commissionEarned || 0), 0);

  return {
    affiliateProduct: serializeAffiliateProductForResponse(req, affiliateProduct),
    requests,
    links,
    stats: {
      requests: requests.length,
      pendingRequests,
      approvedRequests,
      rejectedRequests,
      activeLinks,
      clicks,
      sales,
      revenue,
      commission,
    },
  };
}
