'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * KloelGraph visual theme — a faithful port of the canonical prototype palette
 * (Terminator/Velvet: warm paper / void black, ember #E85D30). The graph carries
 * its own light/dark theme so the canvas can match the prototype regardless of
 * the host app theme; the real screens rendered inside the overlay keep their own
 * KLOEL theme untouched. Default is light, exactly as the prototype ships.
 */
export interface GraphThemePalette {
  readonly void: string;
  readonly paper: string;
  readonly raised: string;
  readonly border: string;
  readonly divider: string;
  readonly hi: string;
  readonly silver: string;
  readonly text: string;
  readonly muted: string;
  readonly dim: string;
  readonly faint: string;
  readonly ember: string;
  readonly emberHi: string;
  readonly emberSoft: string;
  readonly emberBorder: string;
  readonly emberGlow: string;
  readonly glass: string;
}

export type GraphThemeMode = 'light' | 'dark';

export const GRAPH_THEMES: Record<GraphThemeMode, GraphThemePalette> = {
  light: {
    void: '#FAFAF7',
    paper: '#FFFFFF',
    raised: '#FCFBF8',
    border: '#E4E2DC',
    divider: '#EFEDE7',
    hi: '#C9C6BD',
    silver: '#18181C',
    text: '#2E2E33',
    muted: '#6B6B70',
    dim: '#9C9C9F',
    faint: '#D8D5CE',
    ember: '#E85D30',
    emberHi: '#D14E26',
    emberSoft: 'rgba(232,93,48,0.06)',
    emberBorder: 'rgba(232,93,48,0.18)',
    emberGlow: 'rgba(232,93,48,0.15)',
    glass: 'rgba(255,255,255,0.85)',
  },
  dark: {
    void: '#0A0A0C',
    paper: '#0D0D10',
    raised: '#131316',
    border: '#252529',
    divider: '#1B1B1F',
    hi: '#5A5A62',
    silver: '#E8E6E1',
    text: '#C9C7C2',
    muted: '#9A9AA0',
    dim: '#6A6A72',
    faint: '#2C2C32',
    ember: '#E85D30',
    emberHi: '#FF6B3D',
    emberSoft: 'rgba(232,93,48,0.08)',
    emberBorder: 'rgba(232,93,48,0.22)',
    emberGlow: 'rgba(232,93,48,0.18)',
    glass: 'rgba(13,13,16,0.78)',
  },
};

export const GRAPH_FONT = "'Sora', system-ui, sans-serif";
export const GRAPH_MONO = "'JetBrains Mono', ui-monospace, monospace";

interface GraphThemeContextValue {
  readonly C: GraphThemePalette;
  readonly mode: GraphThemeMode;
  readonly toggle: () => void;
}

const GraphThemeContext = createContext<GraphThemeContextValue>({
  C: GRAPH_THEMES.light,
  mode: 'light',
  toggle: () => {},
});

/** Read the active graph palette + theme controls. Safe outside a provider (defaults to light). */
export function useGraphTheme(): GraphThemeContextValue {
  return useContext(GraphThemeContext);
}

/** Provides the graph light/dark theme to the canvas, nodes, nav and overlay chrome. */
export function GraphThemeProvider({
  children,
  initialMode = 'light',
}: {
  readonly children: ReactNode;
  readonly initialMode?: GraphThemeMode;
}) {
  const [mode, setMode] = useState<GraphThemeMode>(initialMode);
  const value = useMemo<GraphThemeContextValue>(
    () => ({
      C: GRAPH_THEMES[mode],
      mode,
      toggle: () => setMode((current) => (current === 'light' ? 'dark' : 'light')),
    }),
    [mode],
  );
  return <GraphThemeContext.Provider value={value}>{children}</GraphThemeContext.Provider>;
}
