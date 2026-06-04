'use client';

import { CommandPalette } from '@/components/kloel/CommandPalette';
import useCommandPalette from '@/hooks/useCommandPalette';
import { useMemberAreas } from '@/hooks/useMemberAreas';
import { useProducts } from '@/hooks/useProducts';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { KloelGraphChromeButtons } from './KloelGraphChromeButtons';
import { KloelGraphFloatingNav } from './KloelGraphFloatingNav';
import {
  createDefaultKloelGraphSettings,
  KloelGraphLiteralCanvas,
} from './KloelGraphLiteralCanvas';
import { KloelGraphOverlay } from './KloelGraphOverlay';
import { KloelGraphSettingsPanel } from './KloelGraphSettingsPanel';
import {
  KLOEL_GRAPH_NODES,
  buildKloelGraphProductNodes,
  resolveKloelGraphNodeForPathFromNodes,
} from './KloelGraph.routes';
import type { KloelGraphArea, KloelGraphNode } from './KloelGraph.routes';
import {
  buildKloelGraphMemberAreaNodes,
  buildKloelGraphEdges,
  loadCheckoutGraphProducts,
  mergeGraphProducts,
} from './KloelGraphShell.helpers';
import { GRAPH_FONT, GraphThemeProvider, useGraphTheme } from './KloelGraphTheme';

function KloelGraphShellSurface({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { C } = useGraphTheme();
  const { products } = useProducts();
  const { areas: memberAreas } = useMemberAreas();
  const { data: checkoutProducts = [] } = useSWR(
    'kloel-graph-checkout-products',
    loadCheckoutGraphProducts,
    { keepPreviousData: true },
  );
  const { paletteProps, executeCommand, open: openPalette } = useCommandPalette();
  const [paletteMode, setPaletteMode] = useState<'full' | 'conversations'>('full');
  const [manualFocus, setManualFocus] = useState<{
    readonly area: KloelGraphArea;
    readonly routeKey: string;
  } | null>(null);
  const [recenterNonce, setRecenterNonce] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [graphSettings, setGraphSettings] = useState(createDefaultKloelGraphSettings);
  const [pendingNode, setPendingNode] = useState<{
    readonly id: string;
    readonly routeSignature: string;
  } | null>(null);

  const pushGraphOnlyRoute = useCallback(
    (url: string) => {
      if (typeof window !== 'undefined') {
        window.history.pushState(null, '', url);
        return;
      }
      router.push(url);
    },
    [router],
  );

  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);
  const graphProducts = useMemo(
    () => mergeGraphProducts(products, checkoutProducts),
    [products, checkoutProducts],
  );
  const productNodes = useMemo(() => buildKloelGraphProductNodes(graphProducts), [graphProducts]);
  const memberAreaNodes = useMemo(() => buildKloelGraphMemberAreaNodes(memberAreas), [memberAreas]);
  const graphNodes = useMemo(
    () => [...KLOEL_GRAPH_NODES, ...productNodes, ...memberAreaNodes],
    [memberAreaNodes, productNodes],
  );
  const activeNode = resolveKloelGraphNodeForPathFromNodes(pathname, params, graphNodes);
  const routeSignature = `${pathname}?${params.toString()}`;
  const pendingNodeId = pendingNode?.routeSignature === routeSignature ? pendingNode.id : null;
  const activeRouteKey = activeNode?.id ?? routeSignature;
  const graphOnly = params.get('graph') === '1';
  const graphAction = params.get('graphAction');
  const commandPaletteMode: 'full' | 'conversations' =
    graphAction === 'recents' ? 'conversations' : paletteMode;
  const displayArea =
    manualFocus?.routeKey === activeRouteKey ? manualFocus.area : (activeNode?.area ?? 'criar');
  const edges = useMemo(() => buildKloelGraphEdges(graphNodes), [graphNodes]);
  const activeGraphNodeId = graphOnly
    ? (pendingNodeId ?? undefined)
    : (pendingNodeId ?? activeNode?.id);

  useEffect(() => {
    for (const node of KLOEL_GRAPH_NODES) {
      try {
        void router.prefetch(node.route.split('?')[0]);
      } catch {}
    }
  }, [router]);

  const closeOverlay = useCallback(() => {
    setPendingNode(null);
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('graph', '1');
    nextParams.delete('graphAction');
    const query = nextParams.toString();
    pushGraphOnlyRoute(`${pathname}${query ? `?${query}` : ''}`);
  }, [pathname, pushGraphOnlyRoute, searchParams]);

  useEffect(() => {
    if (graphOnly || paletteProps.open) {
      return;
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      closeOverlay();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [closeOverlay, graphOnly, paletteProps.open]);

  const openNode = useCallback(
    (node: KloelGraphNode) => {
      if (node.id === 'kloel-search') {
        setPendingNode(null);
        setPaletteMode('full');
        openPalette({ initialQuery: '' });
        return;
      }
      if (node.id === 'kloel-recents') {
        setPendingNode(null);
        setPaletteMode('conversations');
        openPalette({ initialQuery: '' });
        return;
      }
      setPendingNode({ id: node.id, routeSignature });
      router.push(node.route);
    },
    [openPalette, routeSignature, router],
  );

  const focusGalaxy = useCallback(
    (area: KloelGraphArea) => {
      const primaryNode = KLOEL_GRAPH_NODES.find((node) => node.area === area && !node.parentId);

      setManualFocus({ area, routeKey: activeRouteKey });
      setRecenterNonce((value) => value + 1);

      if (!primaryNode) {
        return;
      }

      const [path, queryString = ''] = primaryNode.route.split('?');
      const nextParams = new URLSearchParams(queryString);
      nextParams.set('graph', '1');
      nextParams.delete('graphAction');
      setPendingNode(null);
      const query = nextParams.toString();
      pushGraphOnlyRoute(`${path}${query ? `?${query}` : ''}`);
    },
    [activeRouteKey, pushGraphOnlyRoute],
  );

  const toggleSettings = useCallback(() => {
    setSettingsOpen((open) => !open);
  }, []);

  useEffect(() => {
    if (graphAction === 'search' || graphAction === 'recents') {
      openPalette({ initialQuery: '' });
    }
  }, [graphAction, openPalette]);

  return (
    <div
      data-testid="kloel-graph-shell"
      style={{
        position: 'fixed',
        inset: 0,
        minHeight: '100vh',
        overflow: 'hidden',
        background: C.void,
        color: C.text,
        fontFamily: GRAPH_FONT,
        touchAction: 'none',
      }}
    >
      <CommandPalette {...paletteProps} onSelect={executeCommand} mode={commandPaletteMode} />
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: C.void }} />
      <KloelGraphLiteralCanvas
        nodes={graphNodes}
        edges={edges}
        activeNodeId={activeGraphNodeId}
        focusedArea={displayArea}
        recenterNonce={recenterNonce}
        settings={graphSettings}
        onOpenNode={openNode}
        onClearSelection={() => setPendingNode(null)}
      />
      {settingsOpen && (
        <KloelGraphSettingsPanel
          settings={graphSettings}
          setSettings={setGraphSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      <KloelGraphChromeButtons settingsActive={settingsOpen} onOpenSettings={toggleSettings} />
      <KloelGraphFloatingNav focusedArea={displayArea} onFocusGalaxy={focusGalaxy} />
      {!graphOnly && (
        <KloelGraphOverlay activeNode={activeNode} onClose={closeOverlay}>
          {children}
        </KloelGraphOverlay>
      )}
    </div>
  );
}

/**
 * KloelGraph shell — the graph is the primary navigation surface and each route's
 * real screen renders inside the 80% overlay with the live graph behind it. Wraps
 * the surface in the prototype's own light/dark theme so the canvas matches the
 * canonical KloelGraph look without touching the host app theme.
 */
export function KloelGraphShell({ children }: { readonly children: ReactNode }) {
  return (
    <GraphThemeProvider>
      <KloelGraphShellSurface>{children}</KloelGraphShellSurface>
    </GraphThemeProvider>
  );
}
