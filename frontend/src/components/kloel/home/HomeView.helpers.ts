// Pure helpers extracted from HomeView.tsx to reduce the host
// component's cyclomatic complexity. Behaviour is byte-identical to the
// original inline implementation so no visual/behavioural delta is
// introduced.

import type { DashboardHomePeriod } from '@/lib/api/home';

const FIRST_NAME_SPLIT_RE = /\s+/;

/** Default fallback first name when `userName` is empty/unknown. */
export const DEFAULT_FIRST_NAME = 'Daniel';

/** Default greeting when no reference date is available. */
export const DEFAULT_GREETING = 'Olá';

/**
 * Compute the localized greeting for the given reference date based on the
 * hour-of-day. Mirrors the original branching in HomeView so the visual
 * contract (greeting copy) is preserved exactly.
 */
export function getGreeting(referenceDate?: Date | null): string {
  if (!referenceDate) {
    return DEFAULT_GREETING;
  }
  const hour = referenceDate.getHours();
  if (hour >= 5 && hour < 12) {
    return 'Bom dia';
  }
  if (hour >= 12 && hour < 18) {
    return 'Boa tarde';
  }
  if (hour >= 18) {
    return 'Boa noite';
  }
  return 'Boa madrugada';
}

/**
 * Parse a date-like string from the dashboard payload (`generatedAt` or
 * `range.endDate`) into a `Date`. Returns `null` for empty/invalid input so
 * callers can fall back to a neutral display.
 */
export function parseReferenceDate(value?: string | null): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Extract the first name from the auth `userName` field. Falls back to
 * `DEFAULT_FIRST_NAME` when the input is empty, whitespace-only or null.
 */
export function getFirstName(userName?: string | null): string {
  const trimmed = String(userName || DEFAULT_FIRST_NAME).trim();
  const first = trimmed.split(FIRST_NAME_SPLIT_RE)[0];
  return first || DEFAULT_FIRST_NAME;
}

/**
 * Convert an ISO-style `YYYY-MM-DD` date string into the BR display format
 * (`DD/MM/YYYY`) used by the custom-range label. Returns the original string
 * if it cannot be split (so the helper is safe for unexpected inputs).
 */
export function formatBrDate(isoDate: string): string {
  if (!isoDate) {
    return '';
  }
  return isoDate.split('-').reverse().join('/');
}

/**
 * Build the "DD/MM/YYYY até DD/MM/YYYY" label shown when the user selects a
 * custom date range. Returns `null` when the range is incomplete so the
 * caller can fall back to the server-provided label.
 */
export function formatCustomDateRangeLabel(
  startDate: string,
  endDate: string,
): string | null {
  if (!startDate || !endDate) {
    return null;
  }
  return `${formatBrDate(startDate)} até ${formatBrDate(endDate)}`;
}

/**
 * Resolve the active range label for the current period selection.
 * Order of preference matches the original HomeView ternary:
 *   1. custom period with both dates  → "DD/MM/YYYY até DD/MM/YYYY"
 *   2. server-provided `home.range.label`
 *   3. localized fallback (caller-provided)
 */
export function resolveActiveRangeLabel(args: {
  period: DashboardHomePeriod;
  customStartDate: string;
  customEndDate: string;
  serverLabel?: string | null | undefined;
  fallbackLabel: string;
}): string {
  const { period, customStartDate, customEndDate, serverLabel, fallbackLabel } = args;
  if (period === 'custom') {
    const custom = formatCustomDateRangeLabel(customStartDate, customEndDate);
    if (custom) {
      return custom;
    }
  }
  return serverLabel || fallbackLabel;
}

/**
 * Decide whether the period popover should escape its parent (overflow visible
 * + bumped z-index). Pure derivation so the visual contract test can lock it.
 */
export function shouldFloatRangePopover(rangePopoverOpen: boolean): boolean {
  return rangePopoverOpen === true;
}

/** True when both ends of a custom range are present and non-empty. */
export function isCustomRangeReady(startDate: string, endDate: string): boolean {
  return Boolean(startDate) && Boolean(endDate);
}
