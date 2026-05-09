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

export const SEVERITY_COLORS = {
  CRITICAL: '#FF0000',
  HIGH: '#FF6B00',
  MEDIUM: '#FFC400',
  LOW: '#3B82F6',
} as const;

/**
 * Obsidian graph tag colors (mapped to RGB integers for Obsidian JSON config).
 */
export const OBSIDIAN_TAG_COLORS = {
  DIRTY_WORKSPACE: { hex: '#e0ac00', rgb: 14724096 },
  METADATA_ONLY: { hex: '#808080', rgb: 8421504 },
} as const;
