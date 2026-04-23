import DOMPurify from 'dompurify';

// Pure helpers extracted from ProductNerveCenterComissaoTab.tsx to reduce
// the host component's cyclomatic complexity; behaviour is unchanged.

const brlAmountFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const oneDecimalPercentFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Sanitize html. */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'u', 'a', 'br', 'p', 'span'],
    ALLOWED_ATTR: ['href', 'target'],
  });
}

/** Clamp number. */
export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Parse locale percent. */
export function parseLocalePercent(value: string, fallback: number) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? clampNumber(parsed, 0, 100) : fallback;
}

/** Format percent input. */
export function formatPercentInput(value: unknown, fallback: number) {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? clampNumber(parsed, 0, 100) : fallback;
  return String(safe).replace('.', ',');
}

/** Clamp integer value. */
export function clampIntegerValue(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) ? clampNumber(parsed, min, max) : fallback;
}

/** Format brl amount. */
export function formatBrlAmount(value: unknown) {
  const parsed = Number(value);
  return brlAmountFormatter.format(Number.isFinite(parsed) ? parsed : 0);
}

/** Format one decimal percent. */
export function formatOneDecimalPercent(value: unknown) {
  const parsed = Number(value);
  return `${oneDecimalPercentFormatter.format(Number.isFinite(parsed) ? parsed : 0)}%`;
}

/** Normalize link url. */
export function normalizeLinkUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const hasProtocol = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed);
    return new URL(hasProtocol ? trimmed : `https://${trimmed}`).toString();
  } catch {
    return null;
  }
}

/** Read editable html. */
export function readEditableHtml(
  source: Pick<HTMLDivElement, 'innerHTML'> | null | undefined,
  fallback: string,
) {
  return sanitizeHtml(source?.innerHTML || fallback);
}

/** Sync editable html. */
export function syncEditableHtml(target: HTMLDivElement | null, html: string) {
  if (!target) {
    return;
  }

  const nextHtml = sanitizeHtml(html);
  if (target.innerHTML !== nextHtml) {
    target.innerHTML = nextHtml;
  }
}
