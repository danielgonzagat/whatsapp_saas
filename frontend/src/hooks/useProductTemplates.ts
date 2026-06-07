'use client';

import { PRODUCT_TEMPLATES as STATIC_TEMPLATES } from '@/lib/canvas-product-templates';
import type { ProductTemplate as StaticTemplate } from '@/lib/canvas-product-templates';

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
  return { templates: FALLBACK_TEMPLATES, isLoading: false, error: null };
}
