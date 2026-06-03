/**
 * Canonical compact number formatting (K-suffix).
 * DUP-007: Merged from MarketingShared.channels.tsx and SitesViewIcons.tsx.
 *
 * Formats numbers ≥ 1000 as e.g. "1.5K", else returns the number as a string.
 */
export function fmtCompact(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}K` : value.toString();
}

/**
 * Format a duration in **seconds** as a zero-padded `mm:ss` clock string.
 * Consolidates two byte-identical checkout copies (`pix/page`, `upsell.helpers`).
 */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
