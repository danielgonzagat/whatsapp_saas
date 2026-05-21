// Shared view-model interfaces consumed by all organism components
// under the ProdutosView decomposition.

export interface DisplayProduct {
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
  totalSales?: number;
}

export interface DisplayLesson {
  id: string;
  name: string;
  description?: string;
  videoUrl?: string;
}

export interface DisplayModule {
  id: string;
  name: string;
  lessons?: DisplayLesson[];
}

export interface DisplayArea {
  id: string;
  name: string;
  type: string;
  description: string;
  students: number;
  modules: number;
  modulesCount: number;
  lessonsCount: number;
  completion: number;
  status: string;
  active: boolean;
  productId: string;
  productName: string;
  slug: string;
  template: string;
  primaryColor: string;
  logoUrl: string;
  coverUrl: string;
  certificates: boolean;
  quizzes: boolean;
  community: boolean;
  gamification: boolean;
  progressTrack: boolean;
  downloads: boolean;
  comments: boolean;
  createdAt: string;
  updatedAt: string;
  modules_list: DisplayModule[];
  modulesList?: DisplayModule[];
}

export interface MemberAreaStudent {
  id: string;
  studentName?: string;
  studentEmail?: string;
  studentPhone?: string | null;
  status?: string;
  progress?: number | string;
}

export interface MarketplaceItem {
  id: string;
  name?: string;
  description?: string;
  category?: string;
  producer?: string;
  price?: number;
  commission?: number;
  sales?: number;
  rating?: number;
  temperature?: number;
  thumbnailUrl?: string;
  imageUrl?: string;
  isSaved?: boolean;
  materials?: string[];
  affiliateLink?: string;
  requestStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | string;
  cookieDays?: number;
  totalAffiliates?: number;
  totalReviews?: number;
}

export interface MarketplaceStats {
  totalProducts?: number;
  topEarners?: number;
  avgCommission?: number;
  [key: string]: unknown;
}

export interface AffiliateProductSummary {
  id?: string;
  name?: string;
  affiliateLink?: string;
  isSaved?: boolean;
}

export interface AffiliateLink {
  id: string;
  url?: string;
  clicks?: number;
  sales?: number;
  active?: boolean;
  createdAt?: string;
  affiliateProduct?: AffiliateProductSummary;
}

export interface AffiliateProductItem {
  id: string;
  status?: string;
  affiliateProductId?: string;
  affiliateProduct?: AffiliateProductSummary;
}

export interface RawProductPayload {
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
  minPlanPriceInCents?: number | null;
  maxPlanPriceInCents?: number | null;
  memberAreasCount?: number;
  affiliateCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface RawAreaPayload {
  id: string;
  name: string;
  type?: string;
  description?: string;
  studentsCount?: number;
  totalStudents?: number;
  students?: number;
  modulesCount?: number;
  totalModules?: number;
  modules?: number;
  lessonsCount?: number;
  totalLessons?: number;
  avgCompletion?: number;
  completion?: number;
  status?: string;
  active?: boolean;
  productId?: string;
  slug?: string;
  template?: string;
  primaryColor?: string;
  logoUrl?: string;
  coverUrl?: string;
  certificates?: boolean;
  quizzes?: boolean;
  community?: boolean;
  gamification?: boolean;
  progressTrack?: boolean;
  downloads?: boolean;
  comments?: boolean;
  createdAt?: string;
  updatedAt?: string;
  modules_list?: DisplayModule[];
  modulesList?: DisplayModule[];
  Modules?: DisplayModule[];
}

export interface LiveFeedEvent {
  text: string;
  time: string;
}
