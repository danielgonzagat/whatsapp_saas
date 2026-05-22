/**
 * KLOEL MONITOR Design System
 *
 * Identidade Visual: Monitor — Preciso, Cirurgico, Monochrome + Ember
 * Fontes: Sora (everything) + JetBrains Mono (numbers/metrics ONLY)
 * Paleta: Void rgb(10, 10, 12), Surface rgb(17, 17, 19), Elevated rgb(25, 25, 28), Border rgb(34, 34, 38)
 * Accent: Ember rgb(232, 93, 48) — the ONLY color
 */

// ════════════════════════════════════════════
// MONITOR PALETTE
// ════════════════════════════════════════════

const themeColor = (variable: string, fallback: string) => `var(${variable}, ${fallback})`;

/** Colors. */
export const colors = {
  // Background System
  background: {
    void: themeColor('--bg-void', 'rgb(10, 10, 12)'),
    surface: themeColor('--bg-surface', 'rgb(17, 17, 19)'),
    elevated: themeColor('--bg-elevated', 'rgb(25, 25, 28)'),
    border: themeColor('--bg-border', 'rgb(34, 34, 38)'),
    hoverBg: themeColor('--app-bg-hover', 'rgb(30, 30, 34)'),
    activeBg: themeColor('--app-accent-light', 'rgba(232,93,48,0.06)'),
    // Aliases for backwards compat
    base: themeColor('--bg-void', 'rgb(10, 10, 12)'),
    surface1: themeColor('--bg-surface', 'rgb(17, 17, 19)'),
    surface2: themeColor('--bg-elevated', 'rgb(25, 25, 28)'),
    obsidian: themeColor('--bg-void', 'rgb(10, 10, 12)'),
    // Legacy aliases (mapped to Monitor equivalents)
    space: themeColor('--bg-space', 'rgb(17, 17, 19)'),
    nebula: themeColor('--bg-nebula', 'rgb(25, 25, 28)'),
    stellar: themeColor('--bg-stellar', 'rgb(25, 25, 28)'),
    corona: themeColor('--bg-corona', 'rgb(34, 34, 38)'),
  },

  // Borders
  border: {
    void: themeColor('--border-void', 'rgb(25, 25, 28)'),
    space: themeColor('--border-space', 'rgb(34, 34, 38)'),
    glow: themeColor('--border-glow', 'rgb(51, 51, 56)'),
  },
  stroke: themeColor('--border-space', 'rgb(34, 34, 38)'),
  divider: themeColor('--border-void', 'rgb(25, 25, 28)'),

  // Text System
  text: {
    silver: themeColor('--text-silver', 'rgb(224, 221, 216)'),
    muted: themeColor('--text-muted', 'rgb(110, 110, 115)'),
    dim: themeColor('--text-dim', 'rgb(58, 58, 63)'),
    primary: themeColor('--text-silver', 'rgb(224, 221, 216)'),
    secondary: themeColor('--text-muted', 'rgb(110, 110, 115)'),
    inverted: themeColor('--app-text-inverse', 'rgb(10, 10, 12)'),
    faint: 'rgb(155, 155, 160)',
    faintLight: 'rgb(173, 173, 176)',
    // Legacy aliases
    starlight: themeColor('--text-starlight', 'rgb(224, 221, 216)'),
    moonlight: themeColor('--text-moonlight', 'rgb(110, 110, 115)'),
    dust: themeColor('--text-dust', 'rgb(58, 58, 63)'),
    void: themeColor('--text-void', 'rgb(58, 58, 63)'),
  },

  // Ember — the ONLY color
  ember: {
    primary: 'rgb(232, 93, 48)',
    hover: 'rgb(208, 78, 37)',
    bg: 'rgba(232,93,48,0.06)',
    glow10: 'rgba(232,93,48,0.1)',
    glow30: 'rgba(232,93,48,0.3)',
    glow40: 'rgba(232,93,48,0.4)',
    glow80: 'rgba(232,93,48,0.8)',
  },

  // Accent — Legacy aliases pointing to Ember
  accent: {
    webb: 'rgb(232, 93, 48)',
    webbHover: 'rgb(232, 93, 48)',
    webbActive: 'rgb(232, 93, 48)',
    webbGlow: 'rgba(232,93,48,0.1)',
    gold: 'rgb(232, 93, 48)',
    goldDim: 'rgba(232,93,48,0.06)',
    nebula: 'rgb(232, 93, 48)',
    nebulaGlow: 'rgba(232,93,48,0.06)',
  },

  // Brand
  brand: {
    primary: 'rgb(232, 93, 48)',
    primaryHover: 'rgb(232, 93, 48)',
    accent: 'rgb(232, 93, 48)',
    accentHover: 'rgb(232, 93, 48)',
    amber: 'rgb(232, 93, 48)',
    amberHover: 'rgb(232, 93, 48)',
    gradient: 'none',
    green: 'rgb(232, 93, 48)',
    greenHover: 'rgb(232, 93, 48)',
    cyan: 'rgb(232, 93, 48)',
    cyanHover: 'rgb(232, 93, 48)',
  },

  // State Colors
  state: {
    success: 'rgb(224, 221, 216)',
    warning: 'rgb(110, 110, 115)',
    error: 'rgb(232, 93, 48)',
    info: 'rgb(110, 110, 115)',
  },

  // Semantic Colors — status indicators and alerts
  semantic: {
    success: 'rgb(16, 185, 129)',
    successText: 'rgb(127, 226, 188)',
    successBg: 'rgba(16,185,129,0.12)',
    error: 'rgb(239, 68, 68)',
    errorSoft: 'rgb(224, 82, 82)',
    errorText: 'rgb(247, 168, 168)',
    errorBg: 'rgba(224,82,82,0.12)',
    warning: 'rgb(245, 158, 11)',
    info: 'rgb(59, 130, 246)',
    infoText: 'rgb(147, 197, 253)',
    infoBg: 'rgba(59,130,246,0.12)',
    purple: 'rgb(139, 92, 246)',
    purpleText: 'rgb(167, 139, 250)',
  },

  // Checkout theme
  checkout: {
    accent: 'rgb(212, 175, 55)',
    textPrimary: 'rgb(232, 230, 225)',
    textMuted: 'rgb(138, 138, 142)',
    bg: 'rgb(20, 20, 22)',
    border: 'rgb(42, 42, 46)',
    surface: 'rgb(26, 26, 30)',
    surfaceLight: 'rgb(245, 245, 245)',
    success: 'rgb(34, 197, 94)',
    successDark: 'rgb(22, 163, 74)',
    successBg: 'rgb(15, 31, 15)',
    danger: 'rgb(255, 107, 107)',
    dangerBg: 'rgb(42, 26, 26)',
    dangerBorder: 'rgb(102, 34, 34)',
  },

  // Canvas surface tones (near-Monitor, editor-specific)
  canvas: {
    border: 'rgb(28, 28, 31)',
    surface: 'rgb(22, 22, 24)',
    surfaceAlt: 'rgb(21, 21, 23)',
    void: 'rgb(13, 13, 15)',
    hover: 'rgb(42, 42, 46)',
    accent: 'rgb(242, 120, 75)',
    pink: 'rgb(236, 72, 153)',
    cyan: 'rgb(6, 182, 212)',
    lime: 'rgb(45, 212, 160)',
  },
} as const;

// ════════════════════════════════════════════
// TYPOGRAPHY — Sora + JetBrains Mono
// ════════════════════════════════════════════

export const typography = {
  fontFamily: {
    sans: "'Sora', sans-serif",
    display: "'Sora', sans-serif",
    serif: "'Sora', sans-serif",
    mono: "'JetBrains Mono', monospace",
  },

  fontWeight: {
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  fontSize: {
    hero: ['36px', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: 700 }],
    h1: ['28px', { lineHeight: '1.15', letterSpacing: '-0.01em', fontWeight: 600 }],
    h2: ['22px', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: 600 }],
    h3: ['18px', { lineHeight: '1.25', letterSpacing: '-0.01em', fontWeight: 600 }],
    subheadline: ['16px', { lineHeight: '1.5', fontWeight: 400 }],
    body: ['15px', { lineHeight: '1.6', fontWeight: 400 }],
    bodySmall: ['14px', { lineHeight: '1.5', fontWeight: 400 }],
    label: ['13px', { lineHeight: '1.4', fontWeight: 500, letterSpacing: '0.01em' }],
    caption: ['12px', { lineHeight: '1.4', fontWeight: 500, letterSpacing: '0.02em' }],
    tiny: ['11px', { lineHeight: '1.3', fontWeight: 600, letterSpacing: '0.08em' }],
  },

  tracking: {
    tight: '-0.01em',
    normal: '0',
    wide: '0.05em',
    wider: '0.08em',
    widest: '0.12em',
  },
} as const;

// ════════════════════════════════════════════
// SPACING
// ════════════════════════════════════════════

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  '2xl': '32px',
  '3xl': '48px',
  '4xl': '64px',
  '5xl': '96px',
} as const;

// ════════════════════════════════════════════
// BORDERS & SHADOWS
// ════════════════════════════════════════════

export const radius = {
  sm: '4px',
  md: '6px',
  lg: '6px',
  xl: '6px',
  '2xl': '6px',
  full: '6px',
} as const;

/** Shadows. */
export const shadows = {
  sm: 'none',
  card: 'none',
  elevated: 'none',
  modal: 'none',
  subtle: 'none',
  popup: '0 -4px 20px rgba(0,0,0,0.4)',
  glow: {
    webb: 'none',
    gold: 'none',
    nebula: 'none',
    focus: 'none',
    primary: 'none',
    accent: 'none',
  },
} as const;

// ════════════════════════════════════════════
// ANIMATIONS — 150ms ease. No bounce. No spring.
// ════════════════════════════════════════════

export const motion = {
  duration: {
    instant: '80ms',
    fast: '150ms',
    normal: '150ms',
    slow: '150ms',
    drift: '150ms',
    expansion: '200ms',
    orbit: '150ms',
    orbitSlow: '150ms',
    rotate: '150ms',
  },

  easing: {
    gravity: 'ease',
    orbit: 'ease',
    default: 'ease',
    enter: 'ease',
    exit: 'ease',
    spring: 'ease',
  },
} as const;

// ════════════════════════════════════════════
// Z-INDEX
// ════════════════════════════════════════════

export const zIndex = {
  base: 0,
  surface: 10,
  sticky: 100,
  overlay: 200,
  modal: 300,
  toast: 400,
  tooltip: 500,
} as const;

// ════════════════════════════════════════════
// BREAKPOINTS
// ════════════════════════════════════════════

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

// ════════════════════════════════════════════
// SIDEBAR
// ════════════════════════════════════════════

export const sidebar = {
  widthCollapsed: '52px',
  widthExpanded: '240px',
  bg: colors.background.void,
  border: colors.border.void,
  hover: colors.background.surface,
  active: colors.background.activeBg,
  activeIndicator: colors.ember.primary,
} as const;

// ════════════════════════════════════════════
// CHAT
// ════════════════════════════════════════════

export const chat = {
  maxWidth: '660px',
  bubbleAI: colors.background.surface,
  bubbleAIBorder: colors.border.space,
  bubbleUser: colors.ember.primary,
  messageSpacing: '16px',
} as const;

// ════════════════════════════════════════════
// CSS CUSTOM PROPERTIES
// ════════════════════════════════════════════

export const cssVariables = `
  :root {
    /* Monitor Background */
    --kloel-bg-base: ${colors.background.void};
    --kloel-bg-surface1: ${colors.background.surface};
    --kloel-bg-surface2: ${colors.background.elevated};
    --kloel-bg-elevated: ${colors.background.elevated};
    --kloel-bg-corona: ${colors.background.border};

    /* Monitor Borders */
    --kloel-stroke: ${colors.stroke};
    --kloel-divider: ${colors.divider};
    --kloel-border-subtle: ${colors.border.void};
    --kloel-border-default: ${colors.border.space};
    --kloel-border-strong: ${colors.border.glow};

    /* Monitor Text */
    --kloel-text-primary: ${colors.text.silver};
    --kloel-text-secondary: ${colors.text.muted};
    --kloel-text-muted: ${colors.text.dim};
    --kloel-text-hint: ${colors.text.dim};
    --kloel-text-inverted: ${colors.text.inverted};

    /* Ember */
    --kloel-brand-primary: ${colors.ember.primary};
    --kloel-brand-accent: ${colors.ember.primary};
    --kloel-gradient: none;

    /* Monitor States */
    --kloel-success: ${colors.state.success};
    --kloel-warning: ${colors.state.warning};
    --kloel-error: ${colors.state.error};
    --kloel-info: ${colors.state.info};

    /* Motion */
    --kloel-ease-gravity: ease;
    --kloel-ease-orbit: ease;
    --kloel-transition-fast: 150ms ease;
    --kloel-transition-normal: 150ms ease;
    --kloel-transition-slow: 150ms ease;
  }
`;

// ════════════════════════════════════════════
// CONSOLIDATED EXPORT
// ════════════════════════════════════════════

export const tokens = {
  colors,
  typography,
  spacing,
  radius,
  shadows,
  motion,
  zIndex,
  breakpoints,
  sidebar,
  chat,
} as const;

export default tokens;
