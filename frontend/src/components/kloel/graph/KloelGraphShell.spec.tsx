import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const graphCanvasSource = readFileSync(
  'src/components/kloel/graph/KloelGraphLiteralCanvas.tsx',
  'utf8',
);
let pathname = '/products';
let searchParams = new URLSearchParams();
const push = vi.fn();
const prefetch = vi.fn();
const openPalette = vi.fn();
const useProductsMock = vi.hoisted(() =>
  vi.fn(() => ({
    products: [
      {
        id: 'prod_1',
        name: 'Produto real',
        category: 'Dermocosmeticos',
        status: 'active',
        plans: [{ id: 'plan_1', name: 'Plano principal', active: true }],
        checkouts: [{ id: 'checkout_1', name: 'Checkout principal', active: true }],
      },
    ],
  })),
);
const useMemberAreasMock = vi.hoisted(() =>
  vi.fn(() => ({
    areas: memberAreas,
    isLoading: false,
    error: null,
    mutate: vi.fn(),
  })),
);
const useSWRMock = vi.hoisted(() => vi.fn(() => ({ data: [] })));
let memberAreas = [
  {
    id: 'area_1',
    name: 'Curso real',
    description: 'Area real do backend',
    active: true,
  },
];

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push, prefetch }),
  useSearchParams: () => searchParams,
}));

vi.mock('@/hooks/useProducts', () => ({
  useProducts: useProductsMock,
}));

vi.mock('@/hooks/useMemberAreas', () => ({
  useMemberAreas: useMemberAreasMock,
}));

vi.mock('swr', () => ({
  default: useSWRMock,
}));

vi.mock('@/hooks/useCommandPalette', () => ({
  default: () => ({
    paletteProps: { open: false, onClose: vi.fn() },
    executeCommand: vi.fn(),
    open: openPalette,
  }),
}));

vi.mock('@/components/kloel/CommandPalette', () => ({
  CommandPalette: () => null,
}));

vi.mock('@/components/kloel/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { KLOEL_GRAPH_PRIMARY_NODES } from './KloelGraph.routes';
import { KloelGraphShell } from './KloelGraphShell';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  pathname = '/products';
  searchParams = new URLSearchParams();
  memberAreas = [
    {
      id: 'area_1',
      name: 'Curso real',
      description: 'Area real do backend',
      active: true,
    },
  ];
  push.mockClear();
  prefetch.mockClear();
  openPalette.mockClear();
  useProductsMock.mockClear();
  useMemberAreasMock.mockClear();
  useSWRMock.mockClear();
});

function renderShell(children: ReactNode = <div>Real screen</div>) {
  return render(<KloelGraphShell>{children}</KloelGraphShell>);
}

async function settleGraphAnimationFrames(count = 24) {
  for (let index = 0; index < count; index += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    });
  }
}

function readGraphHitbox(container: HTMLElement, nodeId: string) {
  const rect = container.querySelector(`[data-node-hitbox="${nodeId}"]`) as SVGRectElement | null;
  expect(rect, nodeId).toBeTruthy();
  const group = rect?.closest('g');
  const transform = group?.getAttribute('transform') || '';
  const match = /translate\(([-0-9.]+), ([-0-9.]+)\)/.exec(transform);
  expect(match, nodeId).toBeTruthy();

  const left = Number(match?.[1]) + Number(rect?.getAttribute('x'));
  const top = Number(match?.[2]) + Number(rect?.getAttribute('y'));
  const width = Number(rect?.getAttribute('width'));
  const height = Number(rect?.getAttribute('height'));
  return {
    bottom: top + height,
    left,
    right: left + width,
    top,
  };
}

function graphHitboxesOverlap(
  a: ReturnType<typeof readGraphHitbox>,
  b: ReturnType<typeof readGraphHitbox>,
) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

describe('KloelGraphShell', () => {
  it('does not fetch Criar or Educar dynamic graph data while Conversar is active', () => {
    pathname = '/inbox';

    renderShell(<main>Inbox real</main>);

    expect(useProductsMock).toHaveBeenCalledWith({ enabled: false });
    expect(useMemberAreasMock).toHaveBeenCalledWith({ enabled: false });
    expect(useSWRMock).toHaveBeenCalledWith(null, expect.any(Function), {
      keepPreviousData: true,
    });
  });

  it('prefetches only primary galaxy routes instead of every graph node', async () => {
    renderShell(<main>ProdutosView real</main>);

    await waitFor(() => expect(prefetch).toHaveBeenCalledTimes(KLOEL_GRAPH_PRIMARY_NODES.length));
    expect(prefetch.mock.calls.map(([route]) => route)).toEqual(
      KLOEL_GRAPH_PRIMARY_NODES.map((node) => node.route.split('?')[0]),
    );
  });

  it('does not allow graph motion loops to run for hundreds of React-rendered frames', () => {
    expect(graphCanvasSource).not.toContain('frames > 240');
    expect(graphCanvasSource).not.toContain('0.0228');
    expect(graphCanvasSource).not.toContain('setZoom(z1)');
    expect(graphCanvasSource).not.toContain('setPan({ x: px1, y: py1 })');
    expect(graphCanvasSource).not.toContain('const alphaDecay = 0.08;');
    expect(graphCanvasSource).toContain('const maxSettlingFrames = 14;');
    expect(graphCanvasSource).toContain('Math.max(alphaRef.current, 0.55)');
    expect(graphCanvasSource).toContain('[ariaHidden, focusedArea, visibleEdges, visibleNodes]');
  });

  it('defaults the graph chrome to dark mode so the constellation matches the near-black app shell', () => {
    renderShell(<main>ProdutosView real</main>);

    const shell = screen.getByTestId('kloel-graph-shell');
    // Dark palette void is the near-black rgb(10,10,12); the light/cream default
    // rgb(250,250,247) would mean the graph still renders on a cream background.
    expect(shell.style.background).toBe('rgb(10, 10, 12)');
    expect(shell.style.background).not.toBe('rgb(250, 250, 247)');
  });

  it('extends each graph node hit target across its visible label', () => {
    pathname = '/chat';
    searchParams = new URLSearchParams('graph=1');

    renderShell(<main>Chat real</main>);

    const newChatNode = screen.getByRole('button', { name: 'Abrir Novo Chat' });
    const labelHitTarget = newChatNode.querySelector('[data-node-hitbox="kloel-chat"]');

    expect(labelHitTarget).toBeTruthy();
    expect(Number(labelHitTarget?.getAttribute('width'))).toBeGreaterThan(44);
  });

  it('separates Consultar wallet and report hitboxes so Saldo cannot click Satisfacao', async () => {
    pathname = '/analytics';
    searchParams = new URLSearchParams('tab=vendas&graph=1');

    const { container } = renderShell(<main>Analytics hidden</main>);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Abrir Saldo' })).toBeTruthy());
    await settleGraphAnimationFrames();

    const saldo = readGraphHitbox(container, 'consultar-wallet-saldo');
    const satisfacao = readGraphHitbox(container, 'consultar-report-satisfacao');

    expect(graphHitboxesOverlap(saldo, satisfacao)).toBe(false);
  });

  it('renders the graph canvas behind an 80 percent overlay containing the real route children', () => {
    const { container } = renderShell(<main>ProdutosView real</main>);

    expect(screen.getByTestId('kloel-graph-shell')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: /Produtos/i })).toHaveTextContent(
      'ProdutosView real',
    );
    expect(screen.getByTestId('kloel-graph-canvas').getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('button', { name: 'Abrir Criar' })).toBeNull();
    expect(container.querySelector('[aria-label="Abrir Criar"]')).toBeTruthy();
  });

  it('does not animate hidden graph focus while a route overlay covers the canvas', () => {
    const requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame');

    renderShell(<main>ProdutosView real</main>);

    expect(screen.getByTestId('kloel-graph-canvas').getAttribute('aria-hidden')).toBe('true');
    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();
  });

  it('layers route overlays above graph chrome controls so nested panels receive clicks', () => {
    renderShell(<main>ProdutosView real</main>);

    const dialog = screen.getByRole('dialog', { name: /Produtos/i });

    expect((dialog.parentElement as HTMLElement).style.zIndex).toBe('60');
  });

  it('keeps primary galaxy navigation above the overlay backdrop so route changes stay clickable', () => {
    renderShell(<main>ProdutosView real</main>);

    const overlayLayer = screen.getByRole('dialog', { name: /Produtos/i })
      .parentElement as HTMLElement;
    const floatingNav = screen.getByRole('navigation', { name: 'KloelGraph' });

    expect(Number(floatingNav.style.zIndex)).toBeGreaterThan(Number(overlayLayer.style.zIndex));
  });

  it('keeps the graph-only state when the graph query flag is present', () => {
    searchParams = new URLSearchParams('graph=1');

    renderShell(<main>Dashboard hidden</main>);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('kloel-graph-shell')).toBeTruthy();
  });

  it('opens pending overlay feedback immediately while a graph-only route transition resolves', () => {
    pathname = '/chat';
    searchParams = new URLSearchParams('graph=1');

    renderShell(<main>Chat hidden while graph is open</main>);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Abrir Ferramentas' }), {
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Abrir Ferramentas' }), {
      clientX: 11,
      clientY: 11,
    });

    expect(push).toHaveBeenCalledWith('/ferramentas');
    expect(screen.getByRole('dialog', { name: 'Ferramentas' })).toHaveTextContent(
      'Carregando Ferramentas',
    );
    expect(screen.getByTestId('kloel-graph-canvas').getAttribute('aria-hidden')).toBe('true');
  });

  it('closes pending graph-only overlays with Escape', () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    pathname = '/chat';
    searchParams = new URLSearchParams('graph=1');

    renderShell(<main>Chat hidden while graph is open</main>);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Abrir Ferramentas' }), {
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Abrir Ferramentas' }), {
      clientX: 11,
      clientY: 11,
    });

    expect(screen.getByRole('dialog', { name: 'Ferramentas' })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Ferramentas' })).toBeNull();
    expect(pushState).toHaveBeenCalledWith(null, '', '/chat?graph=1');
    expect(push).toHaveBeenCalledWith('/ferramentas');
  });

  it('keeps off-galaxy graph nodes out of the tab order and accessibility tree', () => {
    pathname = '/analytics';
    searchParams = new URLSearchParams('tab=vendas&graph=1');

    const { container } = renderShell(<main>Analytics hidden</main>);

    expect(screen.getByRole('button', { name: 'Abrir Consultar' }).getAttribute('tabindex')).toBe(
      '0',
    );
    expect(screen.queryByRole('button', { name: 'Abrir Criar' })).toBeNull();
    const offGalaxyNode = container.querySelector('[aria-label="Abrir Criar"]');
    expect(offGalaxyNode).toBeTruthy();
    expect(offGalaxyNode?.getAttribute('tabindex')).toBe('-1');
    expect(offGalaxyNode?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('[aria-label="Abrir Novo produto"]')).toBeNull();
    expect(container.querySelector('[aria-label="Abrir Novo Chat"]')).toBeNull();
    const visualLabels = Array.from(container.querySelectorAll('text'));
    expect(visualLabels.length).toBeGreaterThan(0);
    expect(visualLabels.every((label) => label.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('keeps the graph canvas mounted when closing an overlay into graph-only mode', () => {
    const { rerender } = renderShell(<main>ProdutosView real</main>);
    const canvas = screen.getByTestId('kloel-graph-canvas');

    searchParams = new URLSearchParams('graph=1');
    rerender(
      <KloelGraphShell>
        <main>ProdutosView hidden</main>
      </KloelGraphShell>,
    );

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('kloel-graph-canvas')).toBe(canvas);
  });

  it('does not keep the current route node selected after the overlay is closed', async () => {
    pathname = '/products';
    searchParams = new URLSearchParams('graph=1');

    const { container } = renderShell(<main>ProdutosView hidden</main>);

    await waitFor(() => {
      expect(container.querySelector('circle[data-node-id="criar-products"]')).toBeTruthy();
    });
    expect(
      container.querySelector('circle[data-node-id="criar-products"]')?.getAttribute('stroke'),
    ).toBe('none');
  });

  it('keeps ember node emphasis transient instead of tinting the focused galaxy permanently', async () => {
    pathname = '/products';
    searchParams = new URLSearchParams('graph=1');

    const { container } = renderShell(<main>ProdutosView hidden</main>);
    const getProductsCircle = () =>
      container.querySelector('circle[data-node-id="criar-products"]') as SVGCircleElement | null;

    await waitFor(() => expect(getProductsCircle()).toBeTruthy());
    expect(getProductsCircle()?.getAttribute('fill')).not.toBe('rgb(232,93,48)');

    const productsNode = screen.getByRole('button', { name: 'Abrir Meus produtos' });
    fireEvent.pointerEnter(productsNode);
    expect(getProductsCircle()?.getAttribute('fill')).toBe('rgb(232,93,48)');

    fireEvent.pointerLeave(productsNode);
    await waitFor(() =>
      expect(getProductsCircle()?.getAttribute('fill')).not.toBe('rgb(232,93,48)'),
    );
  });

  it('clears ember hover immediately when the graph background is clicked', async () => {
    pathname = '/products';
    searchParams = new URLSearchParams('graph=1');

    const { container } = renderShell(<main>ProdutosView hidden</main>);
    const getProductsCircle = () =>
      container.querySelector('circle[data-node-id="criar-products"]') as SVGCircleElement | null;

    await waitFor(() => expect(getProductsCircle()).toBeTruthy());
    const productsNode = screen.getByRole('button', { name: 'Abrir Meus produtos' });
    fireEvent.pointerEnter(productsNode);
    expect(getProductsCircle()?.getAttribute('stroke')).toBe('rgb(232,93,48)');

    const svg = container.querySelector('svg') as SVGSVGElement;
    fireEvent.click(svg);

    await waitFor(() => expect(getProductsCircle()?.getAttribute('stroke')).toBe('none'));
  });

  it('clears ember hover when a route overlay hides and then reveals the graph', async () => {
    pathname = '/products';
    searchParams = new URLSearchParams('graph=1');

    const { container, rerender } = renderShell(<main>ProdutosView hidden</main>);
    const getProductsCircle = () =>
      container.querySelector('circle[data-node-id="criar-products"]') as SVGCircleElement | null;

    await waitFor(() => expect(getProductsCircle()).toBeTruthy());
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Abrir Meus produtos' }));
    expect(getProductsCircle()?.getAttribute('fill')).toBe('rgb(232,93,48)');

    searchParams = new URLSearchParams();
    rerender(
      <KloelGraphShell>
        <main>ProdutosView overlay</main>
      </KloelGraphShell>,
    );

    searchParams = new URLSearchParams('graph=1');
    rerender(
      <KloelGraphShell>
        <main>ProdutosView hidden again</main>
      </KloelGraphShell>,
    );

    await waitFor(() =>
      expect(getProductsCircle()?.getAttribute('fill')).not.toBe('rgb(232,93,48)'),
    );
  });

  it('keeps hidden graph keyboard shortcuts from stealing overlay form input', () => {
    const { container } = renderShell(
      <main>
        <label htmlFor="profile-name">Nome</label>
        <input id="profile-name" defaultValue="Kloel" />
      </main>,
    );
    const viewport = container.querySelector('svg > g') as SVGGElement | null;
    expect(viewport).toBeTruthy();
    const before = viewport?.getAttribute('transform');

    fireEvent.keyDown(screen.getByLabelText('Nome'), { key: 'ArrowLeft' });

    expect(viewport?.getAttribute('transform')).toBe(before);
  });

  it('defers Criar dynamic graph data while graph-only galaxy navigation settles', async () => {
    vi.useFakeTimers();
    pathname = '/analytics';
    searchParams = new URLSearchParams('tab=vendas&graph=1');

    const { rerender } = renderShell(<main>Analytics hidden</main>);
    useProductsMock.mockClear();
    useMemberAreasMock.mockClear();
    useSWRMock.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));
    pathname = '/products';
    searchParams = new URLSearchParams('graph=1');
    rerender(
      <KloelGraphShell>
        <main>Produtos hidden</main>
      </KloelGraphShell>,
    );

    expect(useProductsMock).toHaveBeenLastCalledWith({ enabled: false });
    expect(useMemberAreasMock).toHaveBeenLastCalledWith({ enabled: false });
    expect(useSWRMock).toHaveBeenLastCalledWith(null, expect.any(Function), {
      keepPreviousData: true,
    });

    await act(async () => {
      vi.advanceTimersByTime(159);
    });
    expect(useProductsMock).toHaveBeenLastCalledWith({ enabled: false });

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(useProductsMock).toHaveBeenLastCalledWith({ enabled: true });
    expect(useSWRMock).toHaveBeenLastCalledWith(
      'kloel-graph-checkout-products',
      expect.any(Function),
      { keepPreviousData: true },
    );
  });

  it('uses shallow floating navigation in graph-only mode', async () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    pathname = '/chat';
    searchParams = new URLSearchParams('graph=1');

    renderShell(<main>Chat hidden</main>);

    const kloelNav = screen.getByRole('button', { name: 'Kloel' });
    const educarNav = screen.getByRole('button', { name: 'Educar' });

    // Dark-mode silver: the active nav pill is the light-on-near-black rgb(232,230,225).
    await waitFor(() => expect(kloelNav.style.background).toBe('rgb(232, 230, 225)'));
    expect(kloelNav.getAttribute('aria-pressed')).toBe('true');
    expect(educarNav.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(educarNav);

    expect(educarNav.style.background).toBe('rgb(232, 230, 225)');
    expect(kloelNav.style.background).toBe('transparent');
    expect(educarNav.getAttribute('aria-pressed')).toBe('true');
    expect(kloelNav.getAttribute('aria-pressed')).toBe('false');
    expect(pushState).toHaveBeenCalledWith(null, '', '/produtos/area-membros?graph=1');
    expect(push).not.toHaveBeenCalled();
  });

  it('switches the open route screen when the graph navigator pill is used', () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    pathname = '/chat';
    searchParams = new URLSearchParams();

    renderShell(<main>Chat overlay</main>);

    expect(screen.getByRole('dialog')).toHaveTextContent('Chat overlay');

    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));

    expect(push).toHaveBeenCalledWith('/products');
    expect(pushState).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: /Produtos/i })).toHaveTextContent(
      'Carregando Produtos',
    );
  });

  it('navigates by node clicks without opening on drag movement', () => {
    searchParams = new URLSearchParams('graph=1');
    const { container } = renderShell();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Abrir Canvas' }), {
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Abrir Canvas' }), {
      clientX: 15,
      clientY: 10,
    });
    expect(push).not.toHaveBeenCalled();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Abrir Canvas' }), {
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Abrir Canvas' }), {
      clientX: 50,
      clientY: 50,
    });
    expect(push).not.toHaveBeenCalled();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Abrir Sites' }), {
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Abrir Sites' }), {
      clientX: 11,
      clientY: 11,
    });
    expect(push).toHaveBeenCalledWith('/sites');
    expect(
      container.querySelector('circle[data-node-id="criar-sites"]')?.getAttribute('stroke'),
    ).toBe('rgb(232,93,48)');
  });

  it('preserves same-route query params when reopening a graph node', () => {
    pathname = '/flow';
    searchParams = new URLSearchParams('id=flow_1&audit=123&graph=1');
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir Flow' }));

    expect(push).toHaveBeenCalledWith('/flow?id=flow_1&audit=123');
  });

  it('drops sibling view-discriminator params when reopening a base graph node', () => {
    // From /settings?section=idiomas, clicking the base "Conta" node (route /settings,
    // no query) must drop the inherited section so ContaView opens its default view
    // instead of staying on Idiomas. `section` is a discriminator declared by the
    // sibling perfil-settings-<section> nodes; non-discriminator params would survive.
    pathname = '/settings';
    searchParams = new URLSearchParams('section=idiomas&graph=1');
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir Conta' }));

    expect(push).toHaveBeenCalledWith('/settings');
  });
});
