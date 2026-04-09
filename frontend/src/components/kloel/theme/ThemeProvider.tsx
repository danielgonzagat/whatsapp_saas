'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { KLOEL_APP_THEME_KEY, readInitialKloelTheme, type KloelAppTheme } from '@/lib/kloel-theme';

interface ThemeContextValue {
  theme: KloelAppTheme;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (theme: KloelAppTheme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function themeColorFor(theme: KloelAppTheme) {
  return theme === 'dark' ? '#0A0A0C' : '#FFFFFF';
}

function commitThemeColor(theme: KloelAppTheme) {
  const selector = 'meta[name="theme-color"]';
  let meta = document.querySelector(selector);

  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }

  meta.setAttribute('content', themeColorFor(theme));
}

function commitTheme(theme: KloelAppTheme) {
  document.documentElement.setAttribute('data-kloel-app-theme', theme);
  document.documentElement.style.colorScheme = theme;
  window.localStorage.setItem(KLOEL_APP_THEME_KEY, theme);
  commitThemeColor(theme);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<KloelAppTheme>('light');

  useEffect(() => {
    const initialTheme = readInitialKloelTheme();
    setThemeState(initialTheme);
    commitTheme(initialTheme);
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== KLOEL_APP_THEME_KEY) return;
      const nextTheme = event.newValue === 'dark' ? 'dark' : 'light';
      setThemeState(nextTheme);
      document.documentElement.setAttribute('data-kloel-app-theme', nextTheme);
      document.documentElement.style.colorScheme = nextTheme;
      commitThemeColor(nextTheme);
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const setTheme = useCallback((nextTheme: KloelAppTheme) => {
    setThemeState(nextTheme);
    commitTheme(nextTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next = current === 'light' ? 'dark' : 'light';
      commitTheme(next);
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      isDark: theme === 'dark',
      toggleTheme,
      setTheme,
    }),
    [setTheme, theme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }

  return context;
}
