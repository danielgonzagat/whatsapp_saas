import type { JsonRecord } from './product-nerve-center.shared';

// Pure helpers extracted from ProductNerveCenterComissaoTab.tsx to reduce
// the host component's cyclomatic complexity; behaviour is unchanged.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const DOMPurify = typeof window !== 'undefined' ? require('dompurify') : null;

export function sanitizeHtml(html: string): string {
  if (!DOMPurify) return html;
  return (DOMPurify as { sanitize: (html: string, opts: JsonRecord) => string }).sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'u', 'a', 'br', 'p', 'span'],
    ALLOWED_ATTR: ['href', 'target'],
  });
}

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function parseLocalePercent(value: string, fallback: number) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? clampNumber(parsed, 0, 100) : fallback;
}

export function formatPercentInput(value: unknown, fallback: number) {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? clampNumber(parsed, 0, 100) : fallback;
  return String(safe).replace('.', ',');
}

export function clampIntegerValue(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) ? clampNumber(parsed, min, max) : fallback;
}
