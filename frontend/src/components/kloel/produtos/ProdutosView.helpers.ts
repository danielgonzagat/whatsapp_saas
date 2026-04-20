// Pure helpers extracted from ProdutosView.tsx to reduce the host
// component's cyclomatic complexity. Each builder produces the exact
// payload shape the original inline code did — the refactor is purely
// positional; no behavioural change is intended.

export type StudentEditForm = {
  name: string;
  email: string;
  phone: string;
  status: string;
  progress: string;
};

/** Update student body type. */
export type UpdateStudentBody = {
  studentName: string;
  studentEmail: string;
  studentPhone: string | null;
  status: string;
  progress: number;
};

/** Coerce the raw edit-student form into the backend `PUT` body. Pure. */
export const buildUpdateStudentBody = (form: StudentEditForm): UpdateStudentBody => ({
  studentName: form.name,
  studentEmail: form.email,
  studentPhone: form.phone || null,
  status: form.status,
  progress: Math.max(0, Math.min(100, Number(form.progress) || 0)),
});

/** Area form input type. */
export type AreaFormInput = {
  name: string;
  slug: string;
  description: string;
  type: string;
  productId: string;
  template: string;
  logoUrl: string;
  coverUrl: string;
  primaryColor: string;
  certificates: boolean;
  quizzes: boolean;
  community: boolean;
  gamification: boolean;
  progressTrack: boolean;
  downloads: boolean;
  comments: boolean;
  active: boolean;
};

/** Create area body type. */
export type CreateAreaBody = {
  name: string;
  slug: string | undefined;
  description: string | undefined;
  type: string;
  productId: string | undefined;
  template: string;
  logoUrl: string | undefined;
  coverUrl: string | undefined;
  primaryColor: string;
  certificates: boolean;
  quizzes: boolean;
  community: boolean;
  gamification: boolean;
  progressTrack: boolean;
  downloads: boolean;
  comments: boolean;
  active: boolean;
};

/** Update area body type. */
export type UpdateAreaBody = Omit<CreateAreaBody, 'productId'> & {
  productId: string | null;
};

const normalizeOptional = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const buildAreaBaseBody = (form: AreaFormInput) => ({
  name: form.name.trim(),
  slug: normalizeOptional(form.slug),
  description: normalizeOptional(form.description),
  type: form.type,
  template: form.template,
  logoUrl: normalizeOptional(form.logoUrl),
  coverUrl: normalizeOptional(form.coverUrl),
  primaryColor: form.primaryColor,
  certificates: form.certificates,
  quizzes: form.quizzes,
  community: form.community,
  gamification: form.gamification,
  progressTrack: form.progressTrack,
  downloads: form.downloads,
  comments: form.comments,
  active: form.active,
});

/**
 * Build the POST body for creating a member area. The productId defaults to
 * `undefined` so it is stripped from the JSON payload when empty.
 */
export const buildCreateAreaBody = (form: AreaFormInput): CreateAreaBody => ({
  ...buildAreaBaseBody(form),
  productId: form.productId || undefined,
});

/**
 * Build the PUT body for updating a member area. Uses `null` (not
 * `undefined`) so the caller can explicitly clear the product association.
 */
export const buildUpdateAreaBody = (form: AreaFormInput): UpdateAreaBody => ({
  ...buildAreaBaseBody(form),
  productId: form.productId || null,
});

/** Raw product for normalization shape. */
export interface RawProductForNormalization {
  id: string;
  name: string;
  price?: number;
  totalSales?: number;
  sales?: number;
  totalRevenue?: number;
  revenue?: number;
  studentsCount?: number;
  students?: number;
  category?: string;
  status?: string;
  active?: boolean;
  format?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  plansCount?: number;
  activePlansCount?: number;
  memberAreasCount?: number;
  affiliateCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Normalized product shape. */
export interface NormalizedProduct {
  id: string;
  name: string;
  price: number;
  sales: number;
  revenue: number;
  students: number;
  category: string;
  status: 'active' | 'pending' | 'draft';
  color: string;
  format: string;
  active: boolean;
  imageUrl: string;
  plansCount: number;
  activePlansCount: number;
  minPlanPriceInCents: number | null;
  maxPlanPriceInCents: number | null;
  hasPlanPricing: boolean;
  priceLabel: string;
  memberAreasCount: number;
  affiliateCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Price summary shape. */
export interface PriceSummary {
  minPlanPriceInCents: number | null;
  maxPlanPriceInCents: number | null;
  hasPlanPricing: boolean;
  priceLabel: string;
}

function resolveProductStatus(rawStatus: string, active?: boolean): NormalizedProduct['status'] {
  const backendStatus = rawStatus.toUpperCase();
  if (backendStatus === 'APPROVED') {
    return 'active';
  }
  if (!backendStatus && active !== false) {
    return 'active';
  }
  if (backendStatus === 'PENDING') {
    return 'pending';
  }
  return 'draft';
}

/** Normalize display product. */
export function normalizeDisplayProduct(
  p: RawProductForNormalization,
  priceSummary: PriceSummary,
): NormalizedProduct {
  const status = resolveProductStatus(String(p.status || ''), p.active);
  return {
    id: p.id,
    name: p.name,
    price: p.price || 0,
    sales: p.totalSales || p.sales || 0,
    revenue: p.totalRevenue || p.revenue || 0,
    students: p.studentsCount || p.students || 0,
    category: p.category || 'Digital',
    status,
    color: '#8B5CF6',
    format: p.format || '',
    active: status === 'active',
    imageUrl: p.imageUrl || p.thumbnailUrl || '',
    plansCount: p.plansCount || 0,
    activePlansCount: p.activePlansCount || 0,
    minPlanPriceInCents: priceSummary.minPlanPriceInCents,
    maxPlanPriceInCents: priceSummary.maxPlanPriceInCents,
    hasPlanPricing: priceSummary.hasPlanPricing,
    priceLabel: priceSummary.priceLabel,
    memberAreasCount: p.memberAreasCount || 0,
    affiliateCount: p.affiliateCount || 0,
    createdAt: p.createdAt || '',
    updatedAt: p.updatedAt || '',
  };
}
