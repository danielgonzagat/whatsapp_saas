import { mutate } from 'swr';
import { apiFetch } from './core';

/* ── Prisma-aligned types ── */

/** Site status enum (matches Prisma SiteStatus). */
export type SiteStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

/** DNS status enum (matches Prisma DnsStatus). */
export type DnsStatus = 'PENDING' | 'VERIFIED' | 'FAILED';

/** Site model — matches Prisma RAC_Site. */
export interface Site {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  status: SiteStatus;
  template: string | null;
  content: Record<string, unknown>;
  seoMeta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  domains?: SiteDomain[];
  apps?: SiteAppIntegration[];
}

/** Site domain — matches Prisma RAC_SiteDomain. */
export interface SiteDomain {
  id: string;
  siteId: string;
  hostname: string;
  isCustom: boolean;
  dnsStatus: DnsStatus;
  sslStatus: string;
  createdAt: string;
}

/** Site app integration — Prisma RAC_SiteAppIntegration. */
export interface SiteAppIntegration {
  id: string;
  siteId: string;
  appKey: string;
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
}

/* ── Request shapes ── */

export interface ListSitesParams {
  status?: SiteStatus;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateSiteBody {
  name: string;
  slug?: string;
  template?: string;
}

export interface UpdateSiteBody {
  name?: string;
  content?: Record<string, unknown>;
  seoMeta?: Record<string, unknown>;
}

export interface AddSiteDomainBody {
  hostname: string;
}

export interface UpsertSiteAppBody {
  enabled?: boolean;
  config?: Record<string, unknown>;
}

/* ── Helpers ── */

function qs(params: ListSitesParams): string {
  const parts: string[] = [];
  if (params.status) {parts.push('status=' + encodeURIComponent(params.status));}
  if (params.search) {parts.push('search=' + encodeURIComponent(params.search));}
  if (params.page !== undefined) {parts.push('page=' + params.page);}
  if (params.limit !== undefined) {parts.push('limit=' + params.limit);}
  return parts.length > 0 ? '?' + parts.join('&') : '';
}

function invalidateSites() {
  mutate((key: unknown) => typeof key === 'string' && key.startsWith('sites:'));
}

/* ── API client ── */

/** Sites API client — all 12 backend endpoints. */
export const sitesApi = {
  /** GET /sites — list sites (paginated, filterable). */
  listSites: (_workspaceId: string, params?: ListSitesParams) =>
    apiFetch<Site[]>('/sites' + (params ? qs(params) : '')),

  /** POST /sites — create a new site. */
  createSite: async (_workspaceId: string, body: CreateSiteBody) => {
    const res = await apiFetch<Site>('/sites', { method: 'POST', body });
    invalidateSites();
    return res;
  },

  /** GET /sites/:id — get site detail. */
  getSite: (_workspaceId: string, id: string) =>
    apiFetch<Site>('/sites/' + encodeURIComponent(id)),

  /** PUT /sites/:id — update site content/seoMeta. */
  updateSite: async (_workspaceId: string, id: string, body: UpdateSiteBody) => {
    const res = await apiFetch<Site>('/sites/' + encodeURIComponent(id), {
      method: 'PUT',
      body,
    });
    invalidateSites();
    return res;
  },

  /** DELETE /sites/:id — archive a site. */
  deleteSite: async (_workspaceId: string, id: string) => {
    const res = await apiFetch<Site>('/sites/' + encodeURIComponent(id), {
      method: 'DELETE',
    });
    invalidateSites();
    return res;
  },

  /** POST /sites/:id/publish — publish (DRAFT → PUBLISHED). */
  publishSite: async (_workspaceId: string, id: string) => {
    const res = await apiFetch<Site>('/sites/' + encodeURIComponent(id) + '/publish', {
      method: 'POST',
    });
    invalidateSites();
    return res;
  },

  /** POST /sites/:id/unpublish — unpublish (PUBLISHED → DRAFT). */
  unpublishSite: async (_workspaceId: string, id: string) => {
    const res = await apiFetch<Site>('/sites/' + encodeURIComponent(id) + '/unpublish', {
      method: 'POST',
    });
    invalidateSites();
    return res;
  },

  /** GET /sites/:id/domains — list domains for a site. */
  listDomains: (_workspaceId: string, siteId: string) =>
    apiFetch<SiteDomain[]>('/sites/' + encodeURIComponent(siteId) + '/domains'),

  /** POST /sites/:id/domains — add a custom domain. */
  addDomain: async (_workspaceId: string, siteId: string, body: AddSiteDomainBody) => {
    const res = await apiFetch<SiteDomain>(
      '/sites/' + encodeURIComponent(siteId) + '/domains',
      { method: 'POST', body },
    );
    invalidateSites();
    return res;
  },

  /** DELETE /sites/:id/domains/:domainId — remove a domain. */
  deleteDomain: async (_workspaceId: string, siteId: string, domainId: string) => {
    const res = await apiFetch<void>(
      '/sites/' + encodeURIComponent(siteId) + '/domains/' + encodeURIComponent(domainId),
      { method: 'DELETE' },
    );
    invalidateSites();
    return res;
  },

  /** GET /sites/:id/apps — list app integrations for a site. */
  listApps: (_workspaceId: string, siteId: string) =>
    apiFetch<SiteAppIntegration[]>('/sites/' + encodeURIComponent(siteId) + '/apps'),

  /** PUT /sites/:id/apps/:appKey — upsert an app integration. */
  upsertApp: async (
    _workspaceId: string,
    siteId: string,
    appKey: string,
    body: UpsertSiteAppBody,
  ) => {
    const res = await apiFetch<SiteAppIntegration>(
      '/sites/' + encodeURIComponent(siteId) + '/apps/' + encodeURIComponent(appKey),
      { method: 'PUT', body },
    );
    invalidateSites();
    return res;
  },
};
