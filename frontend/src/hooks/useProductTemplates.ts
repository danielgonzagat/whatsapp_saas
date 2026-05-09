'use client';

import { swrFetcher } from '@/lib/fetcher';
import useSWR from 'swr';

export interface ProductTemplate {
  id: string;
  name: string;
  cat: string;
  fmt: string;
  colors: [string, string];
  w: number;
  h: number;
  json: object;
}

import { PRODUCT_TEMPLATES as STATIC_TEMPLATES } from '@/lib/canvas-product-templates';
import type { ProductTemplate as StaticTemplate } from '@/lib/canvas-product-templates';

function toProductTemplate(t: StaticTemplate): ProductTemplate {
  return {
    id: t.id,
    name: t.name,
    cat: t.cat,
    fmt: t.fmt,
    colors: t.colors,
    w: t.w,
    h: t.h,
    json: t.json,
  };
}

const FALLBACK_TEMPLATES: ProductTemplate[] = STATIC_TEMPLATES.map(toProductTemplate);

export function useProductTemplates() {
  const { data, error, isLoading } = useSWR<ProductTemplate[]>(
    '/canvas/templates',
    swrFetcher,
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
      dedupingInterval: 60000,
    },
  );

  const templates = Array.isArray(data) && data.length > 0 ? data : FALLBACK_TEMPLATES;
  const apiError = error ? (error as Error).message : null;

  return { templates, isLoading, error: apiError };
}
