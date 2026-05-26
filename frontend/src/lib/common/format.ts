/**
 * Canonical compact number formatting (K-suffix).
 * DUP-007: Merged from MarketingShared.channels.tsx and SitesViewIcons.tsx.
 *
 * Formats numbers ≥ 1000 as e.g. "1.5K", else returns the number as a string.
 */
export function fmtCompact(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}K` : value.toString();
}
