'use client';

import useSWR, { useSWRConfig } from 'swr';
import { sitesApi } from '@/lib/api/sites';
import type { Site, SiteDomain, SiteAppIntegration, ListSitesParams } from '@/lib/api/sites';

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

function unwrapList(data: unknown): Site[] {
  if (data === undefined || data === null) {return [];}
  if (Array.isArray(data)) {return data;}
  if (typeof data !== 'object') {throw new Error('Invalid sites list payload');}
  const d = data as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(d, 'data')) {
    if (Array.isArray(d.data)) {return d.data as Site[];}
    throw new Error('Invalid sites list payload');
  }
  if (Object.prototype.hasOwnProperty.call(d, 'sites')) {
    if (Array.isArray(d.sites)) {return d.sites as Site[];}
    throw new Error('Invalid sites list payload');
  }
  return [];
}

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

/* ── Hooks ── */

/** List sites with optional filters. */
export function useSites(
  workspaceId: string,
  params?: ListSitesParams,
) {
  const key = workspaceId ? listKey(workspaceId, params as Record<string, unknown>) : null;

  const fetcher = async () => {
    const res = await sitesApi.listSites(workspaceId, params);
    if (res.error) {throw new Error(res.error);}
    return unwrapList(res.data);
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
