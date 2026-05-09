/**
 * Severity Color Token Registry
 *
 * Single source of truth for severity-level colors used across
 * findings engines, Obsidian mirror dashboards, and graph renderers.
 *
 * Import this in any script that assigns or documents severity colors
 * instead of hardcoding hex values.
 *
 * @module scripts/shared/severity-tokens
 */

export const SEVERITY_COLORS = Object.freeze({
  CRITICAL: '#FF0000',
  HIGH: '#FF6B00',
  MEDIUM: '#FFC400',
  LOW: '#3B82F6',
});

/**
 * Obsidian graph tag colors (mapped to RGB integers for Obsidian JSON config).
 */
export const OBSIDIAN_TAG_COLORS = Object.freeze({
  DIRTY_WORKSPACE: Object.freeze({ hex: '#e0ac00', rgb: 14724096 }),
  METADATA_ONLY: Object.freeze({ hex: '#808080', rgb: 8421504 }),
});
