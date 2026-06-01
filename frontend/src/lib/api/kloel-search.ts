import { apiFetch } from './core';

const WHITESPACE_RE = /\s+/g;
const MIN_QUERY_LENGTH = 2;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 30;

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

function normalizeQuery(query: string): string {
  return String(query || '')
    .replace(WHITESPACE_RE, ' ')
    .trim();
}

function clampLimit(limit?: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.max(Math.trunc(Number(limit)), 1), MAX_LIMIT);
}

function emptySearch(query: string): KloelGlobalSearchResponse {
  return { query, total: 0, results: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSearchResultType(value: unknown): value is KloelGlobalSearchResultType {
  return (
    value === 'conversation' ||
    value === 'product' ||
    value === 'contact' ||
    value === 'sale' ||
    value === 'campaign' ||
    value === 'course'
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isMetadataValue(value: unknown): value is string | number | boolean | null {
  if (value === null) {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  return typeof value === 'string' || typeof value === 'boolean';
}

function isSearchMetadata(value: unknown): value is KloelGlobalSearchResult['metadata'] {
  if (value === undefined) {
    return true;
  }
  return isRecord(value) && Object.values(value).every(isMetadataValue);
}

function isSearchResult(value: unknown): value is KloelGlobalSearchResult {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.id) &&
    isSearchResultType(value.type) &&
    isNonEmptyString(value.title) &&
    isNonEmptyString(value.href) &&
    isOptionalString(value.subtitle) &&
    isOptionalString(value.preview) &&
    isOptionalString(value.updatedAt) &&
    isSearchMetadata(value.metadata)
  );
}

function isSearchResponse(value: unknown): value is KloelGlobalSearchResponse {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.query === 'string' &&
    typeof value.total === 'number' &&
    Number.isInteger(value.total) &&
    value.total >= 0 &&
    Array.isArray(value.results) &&
    value.results.every(isSearchResult)
  );
}

export async function searchKloelGlobal(
  query: string,
  limit = DEFAULT_LIMIT,
): Promise<KloelGlobalSearchResponse> {
  const normalizedQuery = normalizeQuery(query);
  if (normalizedQuery.length < MIN_QUERY_LENGTH) {
    return emptySearch(normalizedQuery);
  }

  const safeLimit = clampLimit(limit);
  const res = await apiFetch<KloelGlobalSearchResponse>(
    `/kloel/search?q=${encodeURIComponent(normalizedQuery)}&limit=${safeLimit}`,
  );
  if (res.error) {
    throw new Error(res.error);
  }

  const data = res.data;
  if (!isSearchResponse(data)) {
    throw new Error('Invalid Kloel search payload');
  }

  return {
    query: normalizeQuery(data.query || normalizedQuery),
    total: data.total,
    results: data.results,
  };
}
