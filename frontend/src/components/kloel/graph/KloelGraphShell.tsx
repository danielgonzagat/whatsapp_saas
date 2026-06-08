'use client';

import { CommandPalette } from '@/components/kloel/CommandPalette';
import useCommandPalette from '@/hooks/useCommandPalette';
import { useMemberAreas } from '@/hooks/useMemberAreas';
import { useProducts } from '@/hooks/useProducts';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import type { ReactNode } from 'react';
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  KLOEL_GRAPH_PRIMARY_NODES,
  buildKloelGraphProductNodes,
  getKloelGraphOverlayLabel,
  resolveKloelGraphNodeForPathFromNodes,
} from './KloelGraph.routes';
import type { KloelGraphArea, KloelGraphNode } from './KloelGraph.routes';
import {
  buildKloelGraphMemberAreaNodes,
  buildKloelGraphEdges,
  resolveKloelGraphNodeRoute,
  loadCheckoutGraphProducts,
  mergeGraphProducts,
} from './KloelGraphShell.helpers';
import { GRAPH_FONT, GRAPH_MONO, GraphThemeProvider, useGraphTheme } from './KloelGraphTheme';

const GRAPH_ONLY_DYNAMIC_DATA_DELAY_MS = 160;

function shouldHydrateDynamicGraphDataArea(
  area: KloelGraphArea | null,
): area is 'criar' | 'educar' {
  return area === 'criar' || area === 'educar';
}

function KloelGraphPendingOverlay({ node }: { readonly node: KloelGraphNode }) {
  const { C } = useGraphTheme();
  const label = getKloelGraphOverlayLabel(node);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight: '100%',
        display: 'grid',
        placeItems: 'center',
        padding: 32,
        color: C.text,
      }}
    >
      <div
        style={{
          display: 'grid',
          justifyItems: 'center',
          gap: 10,
          textAlign: 'center',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 34,
            height: 2,
            borderRadius: 6,
            background: C.ember,
          }}
        />
        <p
          style={{
            margin: 0,
            fontFamily: GRAPH_MONO,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 1.1,
            textTransform: 'uppercase',
            color: C.text,
          }}
        >
          Carregando {label}
        </p>
      </div>
    </div>
  );
}

function KloelGraphShellSurface({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { C } = useGraphTheme();
  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);
  const graphOnly = params.get('graph') === '1';
  const staticActiveNode = resolveKloelGraphNodeForPathFromNodes(
    pathname,
    params,
    KLOEL_GRAPH_NODES,
  );
  const routeAreaHint: KloelGraphArea | null =
    pathname.startsWith('/products') ||
    pathname.startsWith('/checkout') ||
    pathname.startsWith('/sites') ||
    pathname.startsWith('/video') ||
    pathname.startsWith('/funnels') ||
    pathname.startsWith('/canvas')
      ? 'criar'
      : pathname.startsWith('/produtos/area-membros') || pathname.startsWith('/member-areas')
        ? 'educar'
        : null;
  const dynamicDataArea = staticActiveNode?.area ?? routeAreaHint;
  const [deferredDynamicDataArea, setDeferredDynamicDataArea] = useState<KloelGraphArea | null>(
    () => (shouldHydrateDynamicGraphDataArea(dynamicDataArea) ? dynamicDataArea : null),
  );
  const hydratedDynamicDataArea =
    deferredDynamicDataArea === dynamicDataArea ? deferredDynamicDataArea : null;
  const shouldLoadProductGraphData = hydratedDynamicDataArea === 'criar';
  const shouldLoadMemberAreaGraphData = hydratedDynamicDataArea === 'educar';
  const { products } = useProducts({ enabled: shouldLoadProductGraphData });
  const { areas: memberAreas } = useMemberAreas({ enabled: shouldLoadMemberAreaGraphData });
  const { data: checkoutProducts = [] } = useSWR(
    shouldLoadProductGraphData ? 'kloel-graph-checkout-products' : null,
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
    readonly sequence: number;
  } | null>(null);
  const pendingNodeSequenceRef = useRef(0);
  const [consumedPendingNodeSequence, setConsumedPendingNodeSequence] = useState<number | null>(
    null,
  );

  useEffect(() => {
    if (!shouldHydrateDynamicGraphDataArea(dynamicDataArea)) {
      setDeferredDynamicDataArea(null);
      return undefined;
    }

    const timeoutId = window.setTimeout(
      () => setDeferredDynamicDataArea(dynamicDataArea),
      graphOnly ? GRAPH_ONLY_DYNAMIC_DATA_DELAY_MS : 0,
    );
    return () => window.clearTimeout(timeoutId);
  }, [dynamicDataArea, graphOnly]);

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

  const resolveNodeRoute = useCallback(
    (node: KloelGraphNode) =>
      resolveKloelGraphNodeRoute(node, pathname, searchParams.toString(), graphNodes),
    [graphNodes, pathname, searchParams],
  );
  const activeNode = resolveKloelGraphNodeForPathFromNodes(pathname, params, graphNodes);
  const routeSignature = `${pathname}?${params.toString()}`;
  const pendingNodeConsumed = pendingNode
    ? consumedPendingNodeSequence === pendingNode.sequence
    : false;
  const pendingNodeId =
    pendingNode && !pendingNodeConsumed && pendingNode.routeSignature === routeSignature
      ? pendingNode.id
      : null;
  const activeRouteKey = activeNode?.id ?? routeSignature;
  const graphAction = params.get('graphAction');
  const isCommandPaletteGraphAction = graphAction === 'search' || graphAction === 'recents';
  const commandPaletteMode: 'full' | 'conversations' =
    graphAction === 'recents' ? 'conversations' : paletteMode;
  const displayArea =
    manualFocus?.routeKey === activeRouteKey ? manualFocus.area : (activeNode?.area ?? 'criar');
  const edges = useMemo(() => buildKloelGraphEdges(graphNodes), [graphNodes]);
  const activeGraphNodeId = graphOnly
    ? (pendingNodeId ?? undefined)
    : (pendingNodeId ?? activeNode?.id);
  const pendingOverlayNode =
    graphOnly && pendingNodeId ? graphNodes.find((node) => node.id === pendingNodeId) : undefined;
  const hasRouteOverlay =
    (!graphOnly && !isCommandPaletteGraphAction) || Boolean(pendingOverlayNode);
  const overlayNode = graphOnly ? pendingOverlayNode : activeNode;

  useEffect(() => {
    if (!pendingNode || pendingNode.routeSignature === routeSignature) {
      return undefined;
    }
    const pendingSequence = pendingNode.sequence;
    const timeoutId = window.setTimeout(() => {
      setConsumedPendingNodeSequence((current) =>
        current === pendingSequence ? current : pendingSequence,
      );
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [pendingNode, routeSignature]);

  useEffect(() => {
    for (const node of KLOEL_GRAPH_PRIMARY_NODES) {
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
    if (paletteProps.open || !hasRouteOverlay) {
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
  }, [closeOverlay, hasRouteOverlay, paletteProps.open]);

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
      if (node.id === 'kloel-chat') {
        setPendingNode({
          id: node.id,
          routeSignature,
          sequence: (pendingNodeSequenceRef.current += 1),
        });
        router.push(node.route);
        if (typeof window !== 'undefined') {
          if (pathname === node.route) {
            window.dispatchEvent(new Event('kloel:new-chat'));
          } else {
            window.setTimeout(() => window.dispatchEvent(new Event('kloel:new-chat')), 0);
          }
        }
        return;
      }
      setPendingNode({
        id: node.id,
        routeSignature,
        sequence: (pendingNodeSequenceRef.current += 1),
      });
      router.push(resolveNodeRoute(node));
    },
    [openPalette, pathname, resolveNodeRoute, routeSignature, router],
  );

  const focusGalaxy = useCallback(
    (area: KloelGraphArea) => {
      const primaryNode = KLOEL_GRAPH_NODES.find((node) => node.area === area && !node.parentId);

      startTransition(() => {
        setManualFocus({ area, routeKey: activeRouteKey });
        setRecenterNonce((value) => value + 1);
      });

      // An open route screen (the macOS-style window) is dismissed ONLY by its red
      // control / Escape — never by interacting with the graph navigator behind it.
      // While a screen is open, the pill only teleports the camera (above), so the
      // user can keep arranging screens over a live graph without losing their place.
      if (!primaryNode || hasRouteOverlay) {
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
    [activeRouteKey, hasRouteOverlay, pushGraphOnlyRoute],
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
        ariaHidden={hasRouteOverlay || paletteProps.open}
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
      {hasRouteOverlay && (
        <KloelGraphOverlay activeNode={overlayNode} onClose={closeOverlay}>
          {pendingOverlayNode ? <KloelGraphPendingOverlay node={pendingOverlayNode} /> : children}
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
    <GraphThemeProvider initialMode="dark">
      <KloelGraphShellSurface>{children}</KloelGraphShellSurface>
    </GraphThemeProvider>
  );
}
