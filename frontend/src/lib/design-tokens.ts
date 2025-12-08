/**
 * KLOEL Design System - "Obsidiana + Neon Orgânico"
 * 
 * Blueprint de Identidade Visual
 * Nível: Big Tech / Apple / OpenAI
 */

// ============================================
// PALETA PRINCIPAL
// ============================================

export const colors = {
  // Base (fundação) - "Obsidiana"
  background: {
    obsidian: '#050608',      // Fundo principal
    surface1: '#101217',      // Cards, chat, superfícies primárias
    surface2: '#151823',      // Hover, inputs, superfícies secundárias
  },
  
  // Bordas e divisores
  stroke: '#23283A',          // Bordas sutis
  divider: 'rgba(255,255,255,0.06)', // Hairlines
  
  // Texto
  text: {
    primary: '#F4F6FB',       // Texto principal
    secondary: '#A6ADBB',     // Texto secundário
    muted: '#737B8C',         // Texto desabilitado/sutil
  },
  
  // Marca KLOEL
  brand: {
    green: '#28E07B',         // Primária - sucesso, vida, vendas
    greenHover: '#22C96D',    // Hover state
    cyan: '#00D4FF',          // Secundária - tecnologia, inteligência
    cyanHover: '#00BFEB',     // Hover state
    gradient: 'linear-gradient(135deg, #28E07B 0%, #00D4FF 100%)',
  },
  
  // Estados (minimais, Big Tech)
  state: {
    success: '#28E07B',
    warning: '#F6C177',       // Suave, não gritante
    error: '#FF4D5E',
    info: '#6AA8FF',
  },
} as const;

// ============================================
// TIPOGRAFIA
// ============================================

export const typography = {
  fontFamily: {
    sans: 'Inter, -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
    mono: '"SF Mono", "Fira Code", Consolas, monospace',
  },
  
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  
  // Escala tipográfica (Apple-like)
  fontSize: {
    // Headlines
    hero: ['40px', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: 600 }],
    h1: ['34px', { lineHeight: '1.15', letterSpacing: '-0.015em', fontWeight: 600 }],
    h2: ['24px', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: 600 }],
    h3: ['20px', { lineHeight: '1.25', fontWeight: 600 }],
    
    // Body
    subheadline: ['18px', { lineHeight: '1.5', fontWeight: 400 }],
    body: ['16px', { lineHeight: '1.6', fontWeight: 400 }],
    bodySmall: ['15px', { lineHeight: '1.5', fontWeight: 400 }],
    
    // UI Labels
    label: ['13px', { lineHeight: '1.4', fontWeight: 500, letterSpacing: '0.01em' }],
    caption: ['12px', { lineHeight: '1.4', fontWeight: 500, letterSpacing: '0.02em' }],
    tiny: ['11px', { lineHeight: '1.3', fontWeight: 500, letterSpacing: '0.03em' }],
  },
} as const;

// ============================================
// ESPAÇAMENTO
// ============================================

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

// ============================================
// BORDAS E SOMBRAS
// ============================================

export const radius = {
  sm: '6px',
  md: '10px',
  lg: '14px',
  xl: '18px',
  '2xl': '24px',
  full: '9999px',
} as const;

export const shadows = {
  // Sombras são quase imperceptíveis - mais "profundidade" do que "drop shadow"
  subtle: '0 1px 2px rgba(0,0,0,0.3)',
  card: '0 2px 8px rgba(0,0,0,0.4), 0 0 1px rgba(0,0,0,0.3)',
  elevated: '0 8px 32px rgba(0,0,0,0.5), 0 0 1px rgba(0,0,0,0.3)',
  glow: {
    green: '0 0 20px rgba(40,224,123,0.3)',
    cyan: '0 0 20px rgba(0,212,255,0.3)',
  },
} as const;

// ============================================
// ANIMAÇÕES (orgânicas, reduzem ansiedade)
// ============================================

export const motion = {
  // Durações
  duration: {
    instant: '80ms',
    fast: '120ms',
    normal: '180ms',
    slow: '280ms',
    expansion: '220ms',
  },
  
  // Easings
  easing: {
    default: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
    enter: 'cubic-bezier(0, 0, 0.2, 1)',
    exit: 'cubic-bezier(0.4, 0, 1, 1)',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
} as const;

// ============================================
// Z-INDEX
// ============================================

export const zIndex = {
  base: 0,
  surface: 10,
  sticky: 100,
  overlay: 200,
  modal: 300,
  toast: 400,
  tooltip: 500,
} as const;

// ============================================
// CSS CUSTOM PROPERTIES (para uso global)
// ============================================

export const cssVariables = `
  :root {
    /* Background */
    --kloel-bg-obsidian: ${colors.background.obsidian};
    --kloel-bg-surface1: ${colors.background.surface1};
    --kloel-bg-surface2: ${colors.background.surface2};
    
    /* Stroke */
    --kloel-stroke: ${colors.stroke};
    --kloel-divider: ${colors.divider};
    
    /* Text */
    --kloel-text-primary: ${colors.text.primary};
    --kloel-text-secondary: ${colors.text.secondary};
    --kloel-text-muted: ${colors.text.muted};
    
    /* Brand */
    --kloel-green: ${colors.brand.green};
    --kloel-cyan: ${colors.brand.cyan};
    --kloel-gradient: ${colors.brand.gradient};
    
    /* States */
    --kloel-success: ${colors.state.success};
    --kloel-warning: ${colors.state.warning};
    --kloel-error: ${colors.state.error};
    --kloel-info: ${colors.state.info};
    
    /* Motion */
    --kloel-transition-fast: ${motion.duration.fast} ${motion.easing.default};
    --kloel-transition-normal: ${motion.duration.normal} ${motion.easing.default};
    --kloel-transition-slow: ${motion.duration.slow} ${motion.easing.default};
  }
`;

// ============================================
// BREAKPOINTS
// ============================================

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

// ============================================
// EXPORTS CONSOLIDADOS
// ============================================

export const tokens = {
  colors,
  typography,
  spacing,
  radius,
  shadows,
  motion,
  zIndex,
  breakpoints,
} as const;

export default tokens;
