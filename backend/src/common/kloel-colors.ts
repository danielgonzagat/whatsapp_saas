/**
 * KLOEL Monitor Design System — Backend Color Tokens
 *
 * Single source of truth for KLOEL brand colors used in backend-generated
 * HTML (emails, 404 pages, AI prompts, canvas defaults, etc.) and in DB
 * seed defaults (pipeline stages, tags, member areas).
 *
 * This mirrors the frontend tokens in `frontend/src/lib/design-tokens.ts`
 * and the canonical palette in `ops/kloel-design-tokens.json`.
 */

// ─────────────────────────────────────────────────────────────────
// BRAND IDENTITY — Monitor Palette
// ─────────────────────────────────────────────────────────────────

export const BRAND_COLORS = {
  /** Void dark background — the canvas of KLOEL. */
  VOID: '#0A0A0C',
  /** Ember — the ONLY accent color. Never add a second accent. */
  EMBER: '#E85D30',
  /** Silver — primary text on dark backgrounds. */
  SILVER: '#E0DDD8',
  /** Card / section surface on dark backgrounds. */
  CARD_SURFACE: '#151517',
  /** Light text variant used in older email templates. Prefer SILVER. */
  LIGHT_TEXT: '#e0e0e0',
} as const;

// ─────────────────────────────────────────────────────────────────
// EMAIL TEMPLATE COLORS
// ─────────────────────────────────────────────────────────────────

export const EMAIL_COLORS = {
  /** Outer email wrapper background (light theme). */
  OUTER_BG: '#f5f5f5',
  /** Alternative outer wrapper background. */
  OUTER_BG_ALT: '#f6f6f6',
  /** Inner card background (light theme). */
  CARD_BG: '#ffffff',
  /** Heading text (light theme). */
  HEADING: '#1a1a1a',
  /** Heading text (dark-slate variant). */
  HEADING_DARK: '#0f172a',
  /** Body paragraph text. */
  BODY_TEXT: '#666',
  /** Footer / muted text. */
  FOOTER_TEXT: '#999',
  /** Slate-500 — label text. */
  LABEL_SLATE: '#64748b',
  /** Slate-700 — paragraph text on light cards. */
  PARAGRAPH_SLATE: '#334155',
} as const;

// ─────────────────────────────────────────────────────────────────
// PIPELINE / CRM STAGE DEFAULTS
// ─────────────────────────────────────────────────────────────────

export const PIPELINE_STAGE_COLORS = {
  LEAD_BLUE: '#3b82f6',
  NEGOTIATION_YELLOW: '#facc15',
  WON_GREEN: '#22c55e',
  LEAD_LIGHT: '#E5E7EB',
  CONTACTED_LIGHT: '#FEF3C7',
  PROPOSAL_LIGHT: '#DBEAFE',
  WON_LIGHT: '#D1FAE5',
  LOST_LIGHT: '#FEE2E2',
} as const;

// ─────────────────────────────────────────────────────────────────
// TAG DEFAULTS
// ─────────────────────────────────────────────────────────────────

export const TAG_DEFAULT_COLORS = {
  WHATSAPP_OPTIN_GREEN: '#16a34a',
  CRM_AUTO_BLUE: '#3B82F6',
} as const;

// ─────────────────────────────────────────────────────────────────
// CANVAS DEFAULTS
// ─────────────────────────────────────────────────────────────────

export const CANVAS_COLORS = {
  DEFAULT_BG: '#0A0A0C',
  DEFAULT_ACCENT: '#E85D30',
  DEFAULT_TEXT: '#E0DDD8',
} as const;

// ─────────────────────────────────────────────────────────────────
// MEMBER AREA DEFAULTS
// ─────────────────────────────────────────────────────────────────

export const MEMBER_AREA_COLORS = {
  DEFAULT_PRIMARY: '#E85D30',
} as const;
