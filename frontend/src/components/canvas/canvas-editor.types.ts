import { UI } from '@/lib/ui-tokens';
// Shared types and style constants for the CanvasEditor split files.
// No 'use client' — pure type/constant module.

export const FONT_SORA = "var(--font-sora), 'Sora', sans-serif";
export const FONT_JETBRAINS = "var(--font-jetbrains), 'JetBrains Mono', monospace";

export const SIDEBAR_TABS = [
  { id: 'templates', label: 'Modelos', icon: 'grid' },
  { id: 'elements', label: 'Elementos', icon: 'apps' },
  { id: 'text', label: 'Texto', icon: 'type' },
  { id: 'uploads', label: 'Uploads', icon: 'upload' },
  { id: 'background', label: 'Fundo', icon: 'bg' },
  { id: 'layers', label: 'Camadas', icon: 'layers' },
  { id: 'tools', label: 'Ferramentas', icon: 'tool' },
] as const;

export type SidebarTabId = (typeof SIDEBAR_TABS)[number]['id'] | null;

export type SelectedCanvasObject = {
  type?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: string;
  underline?: boolean;
  textAlign?: string;
  fill?: string | null | object;
  stroke?: string | null | object;
  strokeWidth?: number;
  opacity?: number;
};

/* ═══ Shared inline styles ═══ */
export const panelHeading: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: UI.text,
  fontFamily: FONT_SORA,
  letterSpacing: '0.04em',
  marginBottom: 12,
  textTransform: 'uppercase',
};

export const panelSubtext: React.CSSProperties = {
  fontSize: 11,
  color: UI.muted,
  fontFamily: FONT_SORA,
  lineHeight: 1.5,
};

export const cardBtn: React.CSSProperties = {
  border: '1px solid UI.border',
  borderRadius: UI.radiusMd,
  background: UI.surface,
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 10,
  gap: 6,
  transition: 'border-color 200ms, background 200ms',
};

export const pillStyle: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: UI.radiusSm,
  background: UI.border,
  color: UI.text,
  fontSize: 10,
  fontFamily: FONT_SORA,
  border: 'none',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

export const accentBtn: React.CSSProperties = {
  width: '100%',
  padding: '10px 0',
  borderRadius: UI.radiusMd,
  background: UI.accent,
  color: UI.bg,
  fontSize: 12,
  fontWeight: 700,
  fontFamily: FONT_SORA,
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
};
