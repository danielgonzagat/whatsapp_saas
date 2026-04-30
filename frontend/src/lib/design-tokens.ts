/**
 * KLOEL MONITOR Design System
 *
 * Identidade Visual: Monitor — Preciso, Cirurgico, Monochrome + Ember
 * Fontes: Sora (everything) + JetBrains Mono (numbers/metrics ONLY)
 * Paleta: Void colors.background.void, Surface colors.background.surface, Elevated colors.background.elevated, Border colors.border.space
 * Accent: Ember colors.ember.primary — the ONLY color
 */

// ════════════════════════════════════════════
// MONITOR PALETTE
// ════════════════════════════════════════════

const themeColor = (variable: string, fallback: string) => `var(${variable}, ${fallback})`;

/** Colors. */
export const colors = {
  // Background System
  background: {
    void: themeColor('--bg-void', 'colors.background.void'),
    surface: themeColor('--bg-surface', 'colors.background.surface'),
    elevated: themeColor('--bg-elevated', 'colors.background.elevated'),
    border: themeColor('--bg-border', 'colors.border.space'),
    hoverBg: themeColor('--app-bg-hover', '#1E1E22'),
    activeBg: themeColor('--app-accent-light', 'rgba(232,93,48,0.06)'),
    // Aliases for backwards compat
    base: themeColor('--bg-void', 'colors.background.void'),
    surface1: themeColor('--bg-surface', 'colors.background.surface'),
    surface2: themeColor('--bg-elevated', 'colors.background.elevated'),
    obsidian: themeColor('--bg-void', 'colors.background.void'),
    // Legacy aliases (mapped to Monitor equivalents)
    space: themeColor('--bg-space', 'colors.background.surface'),
    nebula: themeColor('--bg-nebula', 'colors.background.elevated'),
    stellar: themeColor('--bg-stellar', 'colors.background.elevated'),
    corona: themeColor('--bg-corona', 'colors.border.space'),
  },

  // Borders
  border: {
    void: themeColor('--border-void', 'colors.background.elevated'),
    space: themeColor('--border-space', 'colors.border.space'),
    glow: themeColor('--border-glow', 'colors.border.default'),
  },
  stroke: themeColor('--border-space', 'colors.border.space'),
  divider: themeColor('--border-void', 'colors.background.elevated'),

  // Text System
  text: {
    silver: themeColor('--text-silver', 'colors.text.silver'),
    muted: themeColor('--text-muted', 'colors.text.muted'),
    dim: themeColor('--text-dim', 'colors.text.dim'),
    primary: themeColor('--text-silver', 'colors.text.silver'),
    secondary: themeColor('--text-muted', 'colors.text.muted'),
    inverted: themeColor('--app-text-inverse', 'colors.background.void'),
    // Legacy aliases
    starlight: themeColor('--text-starlight', 'colors.text.silver'),
    moonlight: themeColor('--text-moonlight', 'colors.text.muted'),
    dust: themeColor('--text-dust', 'colors.text.dim'),
    void: themeColor('--text-void', 'colors.text.dim'),
  },

  // Ember — the ONLY color
  ember: {
    primary: 'colors.ember.primary',
    bg: 'rgba(232,93,48,0.06)',
    glow10: 'rgba(232,93,48,0.1)',
    glow30: 'rgba(232,93,48,0.3)',
    glow40: 'rgba(232,93,48,0.4)',
    glow80: 'rgba(232,93,48,0.8)',
  },

  // Accent — Legacy aliases pointing to Ember
  accent: {
    webb: 'colors.ember.primary',
    webbHover: 'colors.ember.primary',
    webbActive: 'colors.ember.primary',
    webbGlow: 'rgba(232,93,48,0.1)',
    gold: 'colors.ember.primary',
    goldDim: 'rgba(232,93,48,0.06)',
    nebula: 'colors.ember.primary',
    nebulaGlow: 'rgba(232,93,48,0.06)',
  },

  // Brand
  brand: {
    primary: 'colors.ember.primary',
    primaryHover: 'colors.ember.primary',
    accent: 'colors.ember.primary',
    accentHover: 'colors.ember.primary',
    amber: 'colors.ember.primary',
    amberHover: 'colors.ember.primary',
    gradient: 'none',
    green: 'colors.ember.primary',
    greenHover: 'colors.ember.primary',
    cyan: 'colors.ember.primary',
    cyanHover: 'colors.ember.primary',
  },

  // State Colors
  state: {
    success: 'colors.text.silver',
    warning: 'colors.text.muted',
    error: 'colors.ember.primary',
    info: 'colors.text.muted',
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
