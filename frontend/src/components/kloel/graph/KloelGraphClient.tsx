'use client';

import dynamic from 'next/dynamic';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useCallback, useMemo } from 'react';

import { KLOEL_GRAPH_NODES } from './KloelGraph.static-nodes';
import { resolveKloelGraphNodeForPathFromNodes } from './KloelGraph.routes';
import { KloelGraphOverlay } from './KloelGraphOverlay';
import { GraphThemeProvider } from './KloelGraphTheme';

// The owner-authored prototype is a browser-only artifact. Load it client-side so
// its window/canvas access never runs during SSR. Visual output is unchanged.
const KloelGraphPrototype = dynamic(() => import('./KloelGraphPrototype'), {
  ssr: false,
});

/**
 * Route-screen bridge: the prototype is the visual surface, but it ignores the
 * URL — deep links like /chat or /settings rendered nothing. When the path
 * names a real route (and ?graph=1 is not asking for the bare graph), the
 * route's page renders inside the canonical Mac-style window on top of the
 * prototype. Closing the window pushes ?graph=1 so the graph stays visible
 * and the screen does not resurrect on the same path.
 */
export function KloelGraphClient({ children }: { readonly children?: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const graphOnly = searchParams.get('graph') === '1';

  const routeNode = useMemo(
    () =>
      resolveKloelGraphNodeForPathFromNodes(
        pathname,
        new URLSearchParams(searchParams.toString()),
        KLOEL_GRAPH_NODES,
      ),
    [pathname, searchParams],
  );

  const closeScreen = useCallback(() => {
    // Next 16 propagates pushState into useSearchParams, so graph=1 alone hides the screen.
    const next = new URLSearchParams(searchParams.toString());
    next.set('graph', '1');
    window.history.pushState(null, '', `${pathname}?${next.toString()}`);
  }, [pathname, searchParams]);

  const showScreen =
    Boolean(children) && !graphOnly && pathname !== '/';

  return (
    <>
      <KloelGraphPrototype />
      {showScreen && (
        <GraphThemeProvider initialMode="dark">
          <KloelGraphOverlay activeNode={routeNode} onClose={closeScreen}>
            {children}
          </KloelGraphOverlay>
        </GraphThemeProvider>
      )}
    </>
  );
}
