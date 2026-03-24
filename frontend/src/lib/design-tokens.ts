/**
 * KLOEL COSMOS Design System
 *
 * Identidade Visual: Cosmologia Premium
 * Inspiração: James Webb Telescope — profundo, escuro, silencioso
 * Fontes: Outfit (display) + DM Sans (body) + JetBrains Mono (code)
 * Paleta: Void #06060C, Webb Blue #4E7AE0, Gold #C9A84C, Nebula #7B5EA7
 */

// ════════════════════════════════════════════
// COSMOS PALETTE
// ════════════════════════════════════════════

export const colors = {
  // Background System — "O Vazio"
  background: {
    void: '#06060C',       // O mais profundo — fundo da página
    space: '#0A0A14',      // Superfície primária — sidebar, cards
    nebula: '#10101C',     // Superfície elevada — inputs, dropdowns
    stellar: '#181828',    // Hover states, elementos interativos
    corona: '#222238',     // Elementos destacados, selected states
    // Aliases for backwards compat
    base: '#06060C',
    surface1: '#0A0A14',
    surface2: '#10101C',
    elevated: '#181828',
    obsidian: '#06060C',
  },

  // Borders — "Horizonte de Eventos"
  border: {
    void: '#16162A',       // Borda sutil, quase invisível
    space: '#1E1E34',      // Borda padrão
    glow: '#2A2A44',       // Borda strong
  },
  stroke: '#1E1E34',
  divider: 'rgba(255,255,255,0.04)',

  // Text System — "As Estrelas"
  text: {
    starlight: '#E8E6F0',  // Texto primário — branco micro-tint lilás
    moonlight: '#9896A8',  // Texto secundário
    dust: '#5C5A6E',       // Texto muted, placeholders
    void: '#3A384A',       // Texto quase invisível, hints
    // Aliases
    primary: '#E8E6F0',
    secondary: '#9896A8',
    muted: '#5C5A6E',
    inverted: '#06060C',
  },

  // Accent System — "Nebulosas"
  accent: {
    webb: '#4E7AE0',           // Azul Webb Telescope — primário
    webbHover: '#6B93F0',      // Hover
    webbActive: '#3D63C4',     // Active/pressed
    webbGlow: 'rgba(78, 122, 224, 0.15)',  // Focus ring glow
    gold: '#C9A84C',           // Dourado estelar — badges, premium
    goldDim: 'rgba(201, 168, 76, 0.12)',   // Gold background
    nebula: '#7B5EA7',         // Lilás nebulosa — terciário, raro
    nebulaGlow: 'rgba(123, 94, 167, 0.12)',
  },

  // Marca KLOEL — aliases para componentes existentes
  brand: {
    primary: '#4E7AE0',
    primaryHover: '#6B93F0',
    accent: '#C9A84C',
    accentHover: '#D4B85E',
    amber: '#E0A84E',
    amberHover: '#C99540',
    gradient: 'linear-gradient(135deg, #4E7AE0 0%, #7B5EA7 100%)',
    green: '#4E7AE0',
    greenHover: '#6B93F0',
    cyan: '#4E7AE0',
    cyanHover: '#6B93F0',
  },

  // State Colors — "Sinais do Cosmos"
  state: {
    success: '#2DD4A0',    // Verde aurora boreal
    warning: '#E0A84E',    // Amarelo solar
    error: '#E05252',      // Vermelho supernova
    info: '#4E7AE0',       // Azul Webb
  },
} as const;

// ════════════════════════════════════════════
// TYPOGRAPHY — Outfit + DM Sans
// ════════════════════════════════════════════

export const typography = {
  fontFamily: {
    sans: "'DM Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    display: "'Outfit', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    serif: "'Outfit', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
  },

  fontWeight: {
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  // Escala tipográfica Cosmos
  fontSize: {
    hero: ['36px', { lineHeight: '1.1', letterSpacing: '0.02em', fontWeight: 700 }],
    h1: ['28px', { lineHeight: '1.15', letterSpacing: '0.02em', fontWeight: 600 }],
    h2: ['22px', { lineHeight: '1.2', letterSpacing: '0.02em', fontWeight: 600 }],
    h3: ['18px', { lineHeight: '1.25', letterSpacing: '0.01em', fontWeight: 600 }],
    subheadline: ['16px', { lineHeight: '1.5', fontWeight: 400 }],
    body: ['15px', { lineHeight: '1.6', fontWeight: 400 }],
    bodySmall: ['14px', { lineHeight: '1.5', fontWeight: 400 }],
    label: ['13px', { lineHeight: '1.4', fontWeight: 500, letterSpacing: '0.01em' }],
    caption: ['12px', { lineHeight: '1.4', fontWeight: 500, letterSpacing: '0.02em' }],
    tiny: ['11px', { lineHeight: '1.3', fontWeight: 600, letterSpacing: '0.08em' }],
  },

  // Tracking presets (letter-spacing)
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
  sm: '6px',
  md: '10px',
  lg: '12px',
  xl: '16px',
  '2xl': '20px',
  full: '9999px',
} as const;

export const shadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.4)',
  card: '0 2px 8px rgba(0, 0, 0, 0.3)',
  elevated: '0 8px 24px rgba(0, 0, 0, 0.6)',
  modal: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
  subtle: '0 1px 2px rgba(0, 0, 0, 0.4)',
  glow: {
    webb: '0 0 20px rgba(78, 122, 224, 0.08)',
    gold: '0 0 16px rgba(201, 168, 76, 0.06)',
    nebula: '0 0 20px rgba(123, 94, 167, 0.06)',
    focus: '0 0 0 2px rgba(78, 122, 224, 0.25)',
    primary: '0 0 20px rgba(78, 122, 224, 0.08)',
    accent: '0 0 16px rgba(201, 168, 76, 0.06)',
  },
} as const;

// ════════════════════════════════════════════
// ANIMATIONS — Gravitational
// ════════════════════════════════════════════

export const motion = {
  duration: {
    instant: '80ms',
    fast: '150ms',
    normal: '250ms',
    slow: '400ms',
    drift: '600ms',
    expansion: '350ms',
    // Decorative (loaders, orbits)
    orbit: '2000ms',
    orbitSlow: '3000ms',
    rotate: '60000ms',
  },

  easing: {
    gravity: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    orbit: 'cubic-bezier(0.37, 0, 0.63, 1)',
    // Aliases for backwards compat
    default: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    enter: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    exit: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    spring: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', // NO spring in Cosmos
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
  widthCollapsed: '56px',
  widthExpanded: '260px',
  bg: colors.background.space,
  border: colors.border.void,
  hover: colors.background.stellar,
  active: colors.background.corona,
  activeIndicator: colors.accent.webb,
} as const;

// ════════════════════════════════════════════
// CHAT
// ════════════════════════════════════════════

export const chat = {
  maxWidth: '680px',
  bubbleAI: colors.background.nebula,
  bubbleAIBorder: colors.border.void,
  bubbleUser: colors.accent.webb,
  messageSpacing: '16px',
} as const;

// ════════════════════════════════════════════
// CSS CUSTOM PROPERTIES
// ════════════════════════════════════════════

export const cssVariables = `
  :root {
    /* Cosmos Background */
    --kloel-bg-base: ${colors.background.void};
    --kloel-bg-surface1: ${colors.background.space};
    --kloel-bg-surface2: ${colors.background.nebula};
    --kloel-bg-elevated: ${colors.background.stellar};
    --kloel-bg-corona: ${colors.background.corona};

    /* Cosmos Borders */
    --kloel-stroke: ${colors.stroke};
    --kloel-divider: ${colors.divider};
    --kloel-border-subtle: ${colors.border.void};
    --kloel-border-default: ${colors.border.space};
    --kloel-border-strong: ${colors.border.glow};

    /* Cosmos Text */
    --kloel-text-primary: ${colors.text.starlight};
    --kloel-text-secondary: ${colors.text.moonlight};
    --kloel-text-muted: ${colors.text.dust};
    --kloel-text-hint: ${colors.text.void};
    --kloel-text-inverted: ${colors.text.inverted};

    /* Cosmos Accent */
    --kloel-brand-primary: ${colors.accent.webb};
    --kloel-brand-accent: ${colors.accent.gold};
    --kloel-gradient: ${colors.brand.gradient};

    /* Cosmos States */
    --kloel-success: ${colors.state.success};
    --kloel-warning: ${colors.state.warning};
    --kloel-error: ${colors.state.error};
    --kloel-info: ${colors.state.info};

    /* Motion */
    --kloel-ease-gravity: ${motion.easing.gravity};
    --kloel-ease-orbit: ${motion.easing.orbit};
    --kloel-transition-fast: ${motion.duration.fast} ${motion.easing.gravity};
    --kloel-transition-normal: ${motion.duration.normal} ${motion.easing.gravity};
    --kloel-transition-slow: ${motion.duration.slow} ${motion.easing.gravity};
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
