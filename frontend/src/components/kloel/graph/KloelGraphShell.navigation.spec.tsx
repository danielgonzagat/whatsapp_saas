import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

describe('KloelGraphShell', () => {
  it('drops pending node feedback when the route signature changes', () => {
    searchParams = new URLSearchParams('graph=1');
    const { container, rerender } = renderShell();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Abrir Sites' }), {
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Abrir Sites' }), {
      clientX: 11,
      clientY: 11,
    });
    expect(
      container.querySelector('circle[data-node-id="criar-sites"]')?.getAttribute('stroke'),
    ).toBe('rgb(232,93,48)');

    pathname = '/canvas';
    searchParams = new URLSearchParams();
    rerender(
      <KloelGraphShell>
        <div>Canvas screen</div>
      </KloelGraphShell>,
    );

    expect(
      container.querySelector('circle[data-node-id="criar-sites"]')?.getAttribute('stroke'),
    ).toBe('none');
  });

  it('does not resurrect stale pending overlays when history returns to the origin route', async () => {
    pathname = '/settings';
    searchParams = new URLSearchParams('section=bancario&graph=1');
    const { rerender } = renderShell(<main>Banco hidden</main>);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Abrir Apps' }), {
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Abrir Apps' }), {
      clientX: 11,
      clientY: 11,
    });

    expect(screen.getByRole('dialog', { name: 'Apps' }).textContent).toContain('Carregando Apps');

    pathname = '/settings';
    searchParams = new URLSearchParams('section=apps');
    rerender(
      <KloelGraphShell>
        <main>Apps screen</main>
      </KloelGraphShell>,
    );
    expect(screen.getByRole('dialog', { name: 'Apps' }).textContent).toContain('Apps screen');

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    pathname = '/settings';
    searchParams = new URLSearchParams('section=bancario&graph=1');
    rerender(
      <KloelGraphShell>
        <main>Banco hidden again</main>
      </KloelGraphShell>,
    );

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText(/Carregando Apps/i)).toBeNull();
  });

  it('clears residual hover ember when a node overlay closes into graph-only mode', async () => {
    searchParams = new URLSearchParams('graph=1');
    const { container, rerender } = renderShell();
    const sitesCircle = () =>
      container.querySelector('circle[data-node-id="criar-sites"]') as SVGCircleElement | null;
    const sitesNode = screen.getByRole('button', { name: 'Abrir Sites' });

    fireEvent.pointerEnter(sitesNode);
    expect(sitesCircle()?.getAttribute('stroke')).toBe('rgb(232,93,48)');

    fireEvent.pointerDown(sitesNode, { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(sitesNode, { clientX: 11, clientY: 11 });

    pathname = '/sites';
    searchParams = new URLSearchParams();
    rerender(
      <KloelGraphShell>
        <div>Sites screen</div>
      </KloelGraphShell>,
    );
    expect(sitesCircle()?.getAttribute('stroke')).toBe('rgb(232,93,48)');

    searchParams = new URLSearchParams('graph=1');
    rerender(
      <KloelGraphShell>
        <div>Sites screen hidden</div>
      </KloelGraphShell>,
    );

    await waitFor(() => expect(sitesCircle()?.getAttribute('stroke')).toBe('none'));
  });

  it('opens dynamic product nodes and product tab subnodes from real product data', () => {
    searchParams = new URLSearchParams('graph=1');
    renderShell();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Abrir Produto real' }), {
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Abrir Produto real' }), {
      clientX: 11,
      clientY: 11,
    });
    expect(push).toHaveBeenCalledWith('/products/prod_1');

    fireEvent.click(screen.getByRole('button', { name: 'Fechar overlay do grafo' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    push.mockClear();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Abrir Produto real - Cupons' }), {
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Abrir Produto real - Cupons' }), {
      clientX: 11,
      clientY: 11,
    });
    expect(push).toHaveBeenCalledWith('/products/prod_1?tab=cupons');
  });

  it('opens dynamic member area nodes from real member area data', () => {
    pathname = '/produtos/area-membros';
    searchParams = new URLSearchParams('graph=1');

    renderShell();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Abrir Curso real' }), {
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Abrir Curso real' }), {
      clientX: 11,
      clientY: 11,
    });
    // Routes to the handled member-area deep link (preview/[areaId] reads params.areaId)
    // rather than ?areaId= on the list screen, which ContaView/AreaMembros never read.
    expect(push).toHaveBeenCalledWith('/produtos/area-membros/preview/area_1');
  });

  it('resets the current Kloel conversation when Novo Chat is opened from an existing thread', () => {
    pathname = '/chat';
    searchParams = new URLSearchParams('conversationId=thread_1&graph=1');
    const dispatchEvent = vi.spyOn(window, 'dispatchEvent');

    renderShell();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Abrir Novo Chat' }), {
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Abrir Novo Chat' }), {
      clientX: 11,
      clientY: 11,
    });

    expect(push).toHaveBeenCalledWith('/chat');
    expect(
      dispatchEvent.mock.calls.some(
        ([event]) => event instanceof Event && event.type === 'kloel:new-chat',
      ),
    ).toBe(true);
  });

  it('opens Kloel search deep-links through the existing command palette', () => {
    pathname = '/chat';
    searchParams = new URLSearchParams('graphAction=search');

    renderShell();

    expect(openPalette).toHaveBeenCalledWith({ initialQuery: '' });
  });

  it('does not stack a Graph overlay behind Kloel command palette deep-links', () => {
    pathname = '/chat';
    searchParams = new URLSearchParams('graphAction=recents');

    renderShell();

    expect(openPalette).toHaveBeenCalledWith({ initialQuery: '' });
    expect(screen.queryByRole('dialog', { name: 'Recentes' })).toBeNull();
  });

  it('uses the existing command palette for Kloel search and recent nodes', () => {
    pathname = '/chat';
    searchParams = new URLSearchParams('graph=1');

    renderShell();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Abrir Buscar' }), {
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Abrir Buscar' }), {
      clientX: 11,
      clientY: 11,
    });
    expect(openPalette).toHaveBeenCalledWith({ initialQuery: '' });

    openPalette.mockClear();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Abrir Recentes' }), {
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Abrir Recentes' }), {
      clientX: 11,
      clientY: 11,
    });
    expect(openPalette).toHaveBeenCalledWith({ initialQuery: '' });
  });

  it('activates Kloel search and recent nodes through click events', () => {
    pathname = '/chat';
    searchParams = new URLSearchParams('graph=1');

    renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir Buscar' }));
    expect(openPalette).toHaveBeenCalledWith({ initialQuery: '' });

    openPalette.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Recentes' }));
    expect(openPalette).toHaveBeenCalledWith({ initialQuery: '' });
  });

  it('closes the overlay on outside click while preserving clicks inside the real screen', () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    const { container } = renderShell(<main>ProdutosView real</main>);

    fireEvent.click(screen.getByRole('dialog', { name: /Produtos/i }));
    expect(push).not.toHaveBeenCalled();
    expect(pushState).not.toHaveBeenCalled();

    fireEvent.click(container.querySelector('[role="dialog"]')?.parentElement as Element);
    expect(pushState).toHaveBeenCalledWith(null, '', '/products?graph=1');
    expect(push).not.toHaveBeenCalled();
  });

  it('closes the overlay back to graph-only mode on the current node route', () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar overlay do grafo' }));

    expect(pushState).toHaveBeenCalledWith(null, '', '/products?graph=1');
    expect(push).not.toHaveBeenCalled();
  });

  it('renders the macOS window controls: a red close and a green fullscreen control', () => {
    renderShell(<main>ProdutosView real</main>);

    const dialog = screen.getByRole('dialog', { name: /Produtos/i });

    expect(dialog.querySelector('[aria-label="Fechar overlay do grafo"]')).toBeTruthy();
    expect(dialog.querySelector('[aria-label="Expandir janela"]')).toBeTruthy();
  });

  it('toggles fullscreen from the green control without closing the open screen', () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    renderShell(<main>ProdutosView real</main>);

    fireEvent.click(screen.getByRole('button', { name: 'Expandir janela' }));

    // Fullscreen is a pure window-state toggle — it must not navigate or close.
    expect(pushState).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: /Produtos/i })).toHaveTextContent(
      'ProdutosView real',
    );
    // After expanding, the control offers a restore action and the screen stays open.
    expect(screen.getByRole('button', { name: 'Restaurar janela' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Restaurar janela' }));
    expect(screen.getByRole('button', { name: 'Expandir janela' })).toBeTruthy();
    expect(pushState).not.toHaveBeenCalled();
  });
});
