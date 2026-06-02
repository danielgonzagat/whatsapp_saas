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
    void: 'rgb(250,250,247)',
    paper: 'rgb(255,255,255)',
    raised: 'rgb(252,251,248)',
    border: 'rgb(228,226,220)',
    divider: 'rgb(239,237,231)',
    hi: 'rgb(201,198,189)',
    silver: 'rgb(24,24,28)',
    text: 'rgb(46,46,51)',
    muted: 'rgb(107,107,112)',
    dim: 'rgb(156,156,159)',
    faint: 'rgb(216,213,206)',
    ember: 'rgb(232,93,48)',
    emberHi: 'rgb(209,78,38)',
    emberSoft: 'rgba(232,93,48,0.06)',
    emberBorder: 'rgba(232,93,48,0.18)',
    emberGlow: 'rgba(232,93,48,0.15)',
    glass: 'rgba(255,255,255,0.85)',
  },
  dark: {
    void: 'rgb(10,10,12)',
    paper: 'rgb(13,13,16)',
    raised: 'rgb(19,19,22)',
    border: 'rgb(37,37,41)',
    divider: 'rgb(27,27,31)',
    hi: 'rgb(90,90,98)',
    silver: 'rgb(232,230,225)',
    text: 'rgb(201,199,194)',
    muted: 'rgb(154,154,160)',
    dim: 'rgb(106,106,114)',
    faint: 'rgb(44,44,50)',
    ember: 'rgb(232,93,48)',
    emberHi: 'rgb(255,107,61)',
    emberSoft: 'rgba(232,93,48,0.08)',
    emberBorder: 'rgba(232,93,48,0.22)',
    emberGlow: 'rgba(232,93,48,0.18)',
    glass: 'rgba(13,13,16,0.78)',
  },
};

export const GRAPH_FONT = "'Sora', system-ui, sans-serif";
export const GRAPH_MONO = "'JetBrains Mono', ui-monospace, monospace";

/**
 * Intentional fully-rounded graph chrome: the floating nav is a pill (99px) and
 * graph nodes are circles (50%). These are deliberately rounded shapes, not card
 * radii — kept as named constants so the values live in one place.
 */
export const GRAPH_RADIUS = { pill: 99, circle: '50%' } as const;

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
