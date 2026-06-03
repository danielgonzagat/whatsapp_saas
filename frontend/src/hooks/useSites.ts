'use client';

import useSWR, { useSWRConfig } from 'swr';
import { apiFetch } from '@/lib/api/core';
import { sitesApi } from '@/lib/api/sites';
import type {
  Site,
  SiteStatus,
  SiteDomain,
  SiteAppIntegration,
  ListSitesParams,
} from '@/lib/api/sites';

/* ── SWR key builders ── */

function listKey(ws: string, params?: Record<string, unknown>) {
  const suffix = params ? ':' + JSON.stringify(params) : '';
  return 'sites:list:' + ws + suffix;
}
function detailKey(ws: string, id: string) {
  return 'sites:detail:' + ws + ':' + id;
}
function domainsKey(ws: string, siteId: string) {
  return 'sites:domains:' + ws + ':' + siteId;
}
function appsKey(ws: string, siteId: string) {
  return 'sites:apps:' + ws + ':' + siteId;
}

/* ── Response unwrappers ── */

function unwrapItem(data: unknown): Site | null {
  if (!data) {return null;}
  if (typeof data === 'object' && data !== null && 'id' in data) {return data as Site;}
  const d = data as Record<string, unknown> | undefined;
  if (d?.data && typeof d.data === 'object' && 'id' in (d.data as object)) {return d.data as Site;}
  if (d?.site) {return d.site as Site;}
  return null;
}

function unwrapRelatedList<T>(data: unknown, message: string): T[] {
  if (data === undefined || data === null) {return [];}
  if (Array.isArray(data)) {return data as T[];}
  if (typeof data !== 'object') {throw new Error(message);}
  const d = data as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(d, 'data')) {
    if (Array.isArray(d.data)) {return d.data as T[];}
    throw new Error(message);
  }
  return [];
}

/* ── KloelSite (canonical create store) → Site shape ── */

interface KloelSiteRow {
  id: string;
  workspaceId: string;
  name: string;
  slug: string | null;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

const invalidSitesListPayloadMessage = 'Invalid sites list payload';

function isKloelSiteRow(value: unknown): value is KloelSiteRow {
  if (typeof value !== 'object' || value === null) {return false;}
  const row = value as Partial<Record<keyof KloelSiteRow, unknown>>;
  return (
    typeof row.id === 'string' &&
    typeof row.workspaceId === 'string' &&
    typeof row.name === 'string' &&
    (typeof row.slug === 'string' || row.slug === null) &&
    typeof row.published === 'boolean' &&
    typeof row.createdAt === 'string' &&
    typeof row.updatedAt === 'string'
  );
}

function unwrapKloelSiteRows(data: unknown): KloelSiteRow[] {
  if (data === undefined || data === null) {return [];}
  if (typeof data !== 'object') {throw new Error(invalidSitesListPayloadMessage);}
  const envelope = data as { sites?: unknown };
  if (envelope.sites === undefined || envelope.sites === null) {return [];}
  if (!Array.isArray(envelope.sites) || !envelope.sites.every(isKloelSiteRow)) {
    throw new Error(invalidSitesListPayloadMessage);
  }
  return envelope.sites;
}

function mapKloelSiteToSite(row: KloelSiteRow): Site {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    slug: row.slug ?? '',
    status: (row.published ? 'PUBLISHED' : 'DRAFT') as SiteStatus,
    template: null,
    content: {},
    seoMeta: {},
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    publishedAt: null,
  };
}

/* ── Hooks ── */

/** List sites with optional filters. */
export function useSites(
  workspaceId: string,
  params?: ListSitesParams,
) {
  const key = workspaceId ? listKey(workspaceId, params as Record<string, unknown>) : null;

  const fetcher = async () => {
    // Read the canonical KloelSite store (where CriarSite/EditarSite actually
    // write) instead of the parallel RAC_Site `/sites` table — otherwise the
    // overview shows "Nenhum site" forever even after the user creates one.
    const res = await apiFetch<{ sites: KloelSiteRow[] }>('/kloel/site/list');
    if (res.error) {throw new Error(res.error);}
    const sites = unwrapKloelSiteRows(res.data);
    return sites.map(mapKloelSiteToSite);
  };

  const { data, error, isLoading, mutate } = useSWR(key, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });

  return {
    sites: (data ?? []) as Site[],
    isLoading,
    error,
    mutate,
  };
}

/** Single site detail. */
export function useSite(workspaceId: string, id: string | null) {
  const key = workspaceId && id ? detailKey(workspaceId, id) : null;

  const fetcher = async () => {
    const res = await sitesApi.getSite(workspaceId, id!);
    if (res.error) {throw new Error(res.error);}
    return unwrapItem(res.data);
  };

  const { data, error, isLoading, mutate } = useSWR(key, fetcher, {
    revalidateOnFocus: false,
  });

  return {
    site: (data ?? null) as Site | null,
    isLoading,
    error,
    mutate,
  };
}

/** List domains for a site. */
export function useSiteDomains(workspaceId: string, siteId: string | null) {
  const key = workspaceId && siteId ? domainsKey(workspaceId, siteId) : null;

  const fetcher = async () => {
    const res = await sitesApi.listDomains(workspaceId, siteId!);
    if (res.error) {throw new Error(res.error);}
    return unwrapRelatedList<SiteDomain>(res.data, 'Invalid site domains payload');
  };

  const { data, error, isLoading, mutate } = useSWR(key, fetcher, {
    revalidateOnFocus: false,
  });

  return {
    domains: (data ?? []) as SiteDomain[],
    isLoading,
    error,
    mutate,
  };
}

/** List app integrations for a site. */
export function useSiteApps(workspaceId: string, siteId: string | null) {
  const key = workspaceId && siteId ? appsKey(workspaceId, siteId) : null;

  const fetcher = async () => {
    const res = await sitesApi.listApps(workspaceId, siteId!);
    if (res.error) {throw new Error(res.error);}
    return unwrapRelatedList<SiteAppIntegration>(res.data, 'Invalid site apps payload');
  };

  const { data, error, isLoading, mutate } = useSWR(key, fetcher, {
    revalidateOnFocus: false,
  });

  return {
    apps: (data ?? []) as SiteAppIntegration[],
    isLoading,
    error,
    mutate,
  };
}

/** Mutations — CRUD + publish/unpublish + domains + apps. */
export function useSiteMutations(workspaceId: string) {
  const { mutate: globalMutate } = useSWRConfig();

  const invalidate = () =>
    globalMutate((key: unknown) => typeof key === 'string' && key.startsWith('sites:'));

  const create = async (body: { name: string; slug?: string; template?: string }) => {
    const res = await sitesApi.createSite(workspaceId, body);
    await invalidate();
    return res;
  };

  const update = async (id: string, body: { name?: string; content?: Record<string, unknown>; seoMeta?: Record<string, unknown> }) => {
    const res = await sitesApi.updateSite(workspaceId, id, body);
    await invalidate();
    return res;
  };

  const del = async (id: string) => {
    const res = await sitesApi.deleteSite(workspaceId, id);
    await invalidate();
    return res;
  };

  const publish = async (id: string) => {
    const res = await sitesApi.publishSite(workspaceId, id);
    await invalidate();
    return res;
  };

  const unpublish = async (id: string) => {
    const res = await sitesApi.unpublishSite(workspaceId, id);
    await invalidate();
    return res;
  };

  const addDomain = async (siteId: string, body: { hostname: string }) => {
    const res = await sitesApi.addDomain(workspaceId, siteId, body);
    await invalidate();
    return res;
  };

  const deleteDomain = async (siteId: string, domainId: string) => {
    const res = await sitesApi.deleteDomain(workspaceId, siteId, domainId);
    await invalidate();
    return res;
  };

  const upsertApp = async (siteId: string, appKey: string, body: { enabled?: boolean; config?: Record<string, unknown> }) => {
    const res = await sitesApi.upsertApp(workspaceId, siteId, appKey, body);
    await invalidate();
    return res;
  };

  return { create, update, delete: del, publish, unpublish, addDomain, deleteDomain, upsertApp };
}
