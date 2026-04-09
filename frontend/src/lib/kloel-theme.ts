export type KloelAppTheme = 'light' | 'dark';

export const KLOEL_APP_THEME_KEY = 'kloel-app-theme';

export const themeVar = (name: string) => `var(${name})`;

export const KLOEL_THEME = {
  bgPrimary: themeVar('--app-bg-primary'),
  bgSecondary: themeVar('--app-bg-secondary'),
  bgTertiary: themeVar('--app-bg-tertiary'),
  bgElevated: themeVar('--app-bg-elevated'),
  bgHover: themeVar('--app-bg-hover'),
  bgActive: themeVar('--app-bg-active'),
  bgSidebar: themeVar('--app-bg-sidebar'),
  bgInput: themeVar('--app-bg-input'),
  bgCard: themeVar('--app-bg-card'),
  bgOverlay: themeVar('--app-bg-overlay'),
  borderPrimary: themeVar('--app-border-primary'),
  borderSecondary: themeVar('--app-border-secondary'),
  borderSubtle: themeVar('--app-border-subtle'),
  borderInput: themeVar('--app-border-input'),
  borderFocus: themeVar('--app-border-focus'),
  textPrimary: themeVar('--app-text-primary'),
  textSecondary: themeVar('--app-text-secondary'),
  textTertiary: themeVar('--app-text-tertiary'),
  textInverse: themeVar('--app-text-inverse'),
  textOnAccent: themeVar('--app-text-on-accent'),
  textPlaceholder: themeVar('--app-text-placeholder'),
  accent: themeVar('--app-accent'),
  accentHover: themeVar('--app-accent-hover'),
  accentLight: themeVar('--app-accent-light'),
  accentMedium: themeVar('--app-accent-medium'),
  success: themeVar('--app-success'),
  successBg: themeVar('--app-success-bg'),
  warning: themeVar('--app-warning'),
  warningBg: themeVar('--app-warning-bg'),
  error: themeVar('--app-error'),
  errorBg: themeVar('--app-error-bg'),
  info: themeVar('--app-info'),
  infoBg: themeVar('--app-info-bg'),
  shadowSm: themeVar('--app-shadow-sm'),
  shadowMd: themeVar('--app-shadow-md'),
  shadowLg: themeVar('--app-shadow-lg'),
  shadowXl: themeVar('--app-shadow-xl'),
  ringFocus: themeVar('--app-ring-focus'),
} as const;

export function readInitialKloelTheme(): KloelAppTheme {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-kloel-app-theme');
    if (attr === 'dark' || attr === 'light') {
      return attr;
    }
  }

  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem(KLOEL_APP_THEME_KEY);
    if (stored === 'dark' || stored === 'light') {
      return stored;
    }
  }

  return 'light';
}
