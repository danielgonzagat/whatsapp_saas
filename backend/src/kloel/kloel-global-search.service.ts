import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KloelThreadSearchService, type ThreadSearchResult } from './kloel-thread-search.service';

const WHITESPACE_RE = /\s+/g;
const MIN_QUERY_LENGTH = 2;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 30;
const PER_SOURCE_LIMIT = 5;

type SearchTextFilter = { contains: string; mode: 'insensitive' };

export type KloelGlobalSearchResultType =
  | 'conversation'
  | 'product'
  | 'contact'
  | 'sale'
  | 'campaign'
  | 'course';

export interface KloelGlobalSearchResult {
  id: string;
  type: KloelGlobalSearchResultType;
  title: string;
  href: string;
  subtitle?: string | undefined;
  preview?: string | undefined;
  updatedAt?: string | undefined;
  metadata?: Record<string, string | number | boolean | null> | undefined;
}

export interface KloelGlobalSearchResponse {
  query: string;
  total: number;
  results: KloelGlobalSearchResult[];
}

type ProductSearchRow = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  sku: string | null;
  status: string;
  updatedAt: Date;
};

type ContactSearchRow = {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  updatedAt: Date;
};

type SaleSearchRow = {
  id: string;
  productName: string | null;
  leadPhone: string | null;
  amount: number;
  status: string;
  createdAt: Date;
};

type CampaignSearchRow = {
  id: string;
  name: string;
  status: string;
  updatedAt: Date;
};

type MemberAreaSearchRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  updatedAt: Date;
};

function normalizeQuery(rawQuery: string): string {
  return String(rawQuery || '')
    .replace(WHITESPACE_RE, ' ')
    .trim();
}

function clampLimit(rawLimit: string | undefined): number {
  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_LIMIT);
}

function textFilter(query: string): SearchTextFilter {
  return { contains: query, mode: 'insensitive' };
}

function toIso(value?: Date | string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function joinParts(parts: Array<string | null | undefined>): string | undefined {
  const value = parts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' - ');
  return value || undefined;
}

function withQuery(path: string, params: Record<string, string | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

function compareByUpdatedAtDesc(left: KloelGlobalSearchResult, right: KloelGlobalSearchResult) {
  const leftTime = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
  const rightTime = right.updatedAt ? new Date(right.updatedAt).getTime() : 0;
  return rightTime - leftTime;
}

/** Workspace-scoped global search for the authenticated Kloel graph. */
@Injectable()
export class KloelGlobalSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly threadSearch: KloelThreadSearchService,
  ) {}

  async search(
    workspaceId: string,
    rawQuery: string,
    rawLimit?: string,
  ): Promise<KloelGlobalSearchResponse> {
    const query = normalizeQuery(rawQuery);
    const limit = clampLimit(rawLimit);
    if (!workspaceId || query.length < MIN_QUERY_LENGTH) {
      return { query, total: 0, results: [] };
    }

    const perSourceLimit = Math.min(PER_SOURCE_LIMIT, limit);
    const [conversations, products, contacts, sales, campaigns, courses] = await Promise.all([
      this.threadSearch.search(workspaceId, query, String(perSourceLimit)),
      this.searchProducts(workspaceId, query, perSourceLimit),
      this.searchContacts(workspaceId, query, perSourceLimit),
      this.searchSales(workspaceId, query, perSourceLimit),
      this.searchCampaigns(workspaceId, query, perSourceLimit),
      this.searchCourses(workspaceId, query, perSourceLimit),
    ]);

    const results = [
      ...conversations.map((row) => this.mapConversation(row)),
      ...products.map((row) => this.mapProduct(row)),
      ...contacts.map((row) => this.mapContact(row)),
      ...sales.map((row) => this.mapSale(row)),
      ...campaigns.map((row) => this.mapCampaign(row)),
      ...courses.map((row) => this.mapCourse(row)),
    ]
      .sort(compareByUpdatedAtDesc)
      .slice(0, limit);

    return { query, total: results.length, results };
  }

  private searchProducts(
    workspaceId: string,
    query: string,
    take: number,
  ): Promise<ProductSearchRow[]> {
    const contains = textFilter(query);
    return this.prisma.product.findMany({
      where: {
        workspaceId,
        OR: [
          { name: contains },
          { description: contains },
          { category: contains },
          { sku: contains },
          { slug: contains },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take,
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        sku: true,
        status: true,
        updatedAt: true,
      },
    });
  }

  private searchContacts(
    workspaceId: string,
    query: string,
    take: number,
  ): Promise<ContactSearchRow[]> {
    const contains = textFilter(query);
    return this.prisma.contact.findMany({
      where: {
        workspaceId,
        OR: [{ name: contains }, { email: contains }, { phone: contains }],
      },
      orderBy: { updatedAt: 'desc' },
      take,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        updatedAt: true,
      },
    });
  }

  private searchSales(workspaceId: string, query: string, take: number): Promise<SaleSearchRow[]> {
    const contains = textFilter(query);
    return this.prisma.kloelSale.findMany({
      where: {
        workspaceId,
        OR: [
          { productName: contains },
          { leadPhone: contains },
          { externalPaymentId: contains },
          { externalId: contains },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        productName: true,
        leadPhone: true,
        amount: true,
        status: true,
        createdAt: true,
      },
    });
  }

  private searchCampaigns(
    workspaceId: string,
    query: string,
    take: number,
  ): Promise<CampaignSearchRow[]> {
    const contains = textFilter(query);
    return this.prisma.campaign.findMany({
      where: {
        workspaceId,
        OR: [{ name: contains }, { messageTemplate: contains }, { aiStrategy: contains }],
      },
      orderBy: { updatedAt: 'desc' },
      take,
      select: {
        id: true,
        name: true,
        status: true,
        updatedAt: true,
      },
    });
  }

  private searchCourses(
    workspaceId: string,
    query: string,
    take: number,
  ): Promise<MemberAreaSearchRow[]> {
    const contains = textFilter(query);
    return this.prisma.memberArea.findMany({
      where: {
        workspaceId,
        OR: [{ name: contains }, { slug: contains }, { description: contains }, { type: contains }],
      },
      orderBy: { updatedAt: 'desc' },
      take,
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        updatedAt: true,
      },
    });
  }

  private mapConversation(row: ThreadSearchResult): KloelGlobalSearchResult {
    return {
      id: row.id,
      type: 'conversation',
      title: row.title || 'Nova conversa',
      href: withQuery('/chat', { conversationId: row.id }),
      subtitle: 'Conversa Kloel',
      preview: row.matchedContent || row.previewHtml,
      updatedAt: toIso(row.updatedAt),
    };
  }

  private mapProduct(row: ProductSearchRow): KloelGlobalSearchResult {
    return {
      id: row.id,
      type: 'product',
      title: row.name,
      href: `/products/${encodeURIComponent(row.id)}`,
      subtitle: joinParts(['Produto', row.category, row.status, row.sku]),
      preview: row.description || row.sku || undefined,
      updatedAt: toIso(row.updatedAt),
      metadata: { status: row.status, category: row.category, sku: row.sku },
    };
  }

  private mapContact(row: ContactSearchRow): KloelGlobalSearchResult {
    return {
      id: row.id,
      type: 'contact',
      title: row.name || row.phone || row.email || 'Cliente',
      href: withQuery('/inbox', { phone: row.phone }),
      subtitle: joinParts(['Cliente', row.email, row.phone]),
      preview: row.email || row.phone,
      updatedAt: toIso(row.updatedAt),
    };
  }

  private mapSale(row: SaleSearchRow): KloelGlobalSearchResult {
    return {
      id: row.id,
      type: 'sale',
      title: row.productName || `Venda ${row.id}`,
      href: withQuery('/vendas/gestao-vendas', { search: row.id }),
      subtitle: joinParts(['Venda', row.status, row.leadPhone]),
      preview: `R$ ${row.amount.toFixed(2)}`,
      updatedAt: toIso(row.createdAt),
      metadata: { amount: row.amount, status: row.status },
    };
  }

  private mapCampaign(row: CampaignSearchRow): KloelGlobalSearchResult {
    return {
      id: row.id,
      type: 'campaign',
      title: row.name,
      href: '/anuncios',
      subtitle: joinParts(['Campanha', row.status]),
      preview: row.status,
      updatedAt: toIso(row.updatedAt),
      metadata: { status: row.status },
    };
  }

  private mapCourse(row: MemberAreaSearchRow): KloelGlobalSearchResult {
    return {
      id: row.id,
      type: 'course',
      title: row.name,
      href: withQuery('/produtos/area-membros', { area: row.slug }),
      subtitle: 'Area de membros',
      preview: row.description || row.slug,
      updatedAt: toIso(row.updatedAt),
    };
  }
}
