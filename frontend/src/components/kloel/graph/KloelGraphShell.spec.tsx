import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let pathname = '/products';
let searchParams = new URLSearchParams();
const push = vi.fn();
const openPalette = vi.fn();
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
  useRouter: () => ({ push, prefetch: vi.fn() }),
  useSearchParams: () => searchParams,
}));

vi.mock('@/hooks/useProducts', () => ({
  useProducts: () => ({
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
  }),
}));

vi.mock('@/hooks/useMemberAreas', () => ({
  useMemberAreas: () => ({
    areas: memberAreas,
    isLoading: false,
    error: null,
    mutate: vi.fn(),
  }),
}));

vi.mock('swr', () => ({
  default: () => ({ data: [] }),
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
  openPalette.mockClear();
});

function renderShell(children: ReactNode = <div>Real screen</div>) {
  return render(<KloelGraphShell>{children}</KloelGraphShell>);
}

describe('KloelGraphShell', () => {
  it('renders the graph canvas behind an 80 percent overlay containing the real route children', () => {
    renderShell(<main>ProdutosView real</main>);

    expect(screen.getByTestId('kloel-graph-shell')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: /Produtos/i })).toHaveTextContent(
      'ProdutosView real',
    );
    expect(screen.getByRole('button', { name: 'Abrir Criar' })).toBeTruthy();
  });

  it('keeps the graph-only state when the graph query flag is present', () => {
    searchParams = new URLSearchParams('graph=1');

    renderShell(<main>Dashboard hidden</main>);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('kloel-graph-shell')).toBeTruthy();
  });

  it('does not keep the current route node selected after the overlay is closed', async () => {
    pathname = '/products';
    searchParams = new URLSearchParams('graph=1');

    const { container } = renderShell(<main>ProdutosView hidden</main>);

    await waitFor(() => {
      expect(container.querySelector('circle[data-node-id="criar-products"]')).toBeTruthy();
    });
    expect(container.querySelector('circle[data-node-id="criar-products"]')?.getAttribute('stroke')).toBe(
      'none',
    );
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
    await waitFor(() => expect(getProductsCircle()?.getAttribute('fill')).not.toBe('rgb(232,93,48)'));
  });

  it('lets floating navigation recenter graph-only mode away from the active route', async () => {
    pathname = '/chat';
    searchParams = new URLSearchParams('graph=1');

    renderShell(<main>Chat hidden</main>);

    const kloelNav = screen.getByRole('button', { name: 'Kloel' });
    const educarNav = screen.getByRole('button', { name: 'Educar' });

    await waitFor(() => expect(kloelNav.style.background).toBe('rgb(24, 24, 28)'));

    fireEvent.click(educarNav);

    expect(educarNav.style.background).toBe('rgb(24, 24, 28)');
    expect(kloelNav.style.background).toBe('transparent');
  });

  it('navigates by node clicks without opening on drag movement', () => {
    const { container } = renderShell();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Abrir Afiliar' }), {
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Abrir Afiliar' }), {
      clientX: 11,
      clientY: 11,
    });
    expect(push).toHaveBeenCalledWith('/produtos/afiliar-se');
    expect(container.querySelector('circle[data-node-id="afiliar"]')?.getAttribute('stroke')).toBe(
      'rgb(232,93,48)',
    );

    push.mockClear();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Abrir Educar' }), {
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Abrir Educar' }), {
      clientX: 15,
      clientY: 10,
    });
    expect(push).not.toHaveBeenCalled();

    push.mockClear();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Abrir Educar' }), {
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Abrir Educar' }), {
      clientX: 50,
      clientY: 50,
    });
    expect(push).not.toHaveBeenCalled();
  });

  it('drops pending node feedback when the route signature changes', () => {
    const { container, rerender } = renderShell();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Abrir Afiliar' }), {
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Abrir Afiliar' }), {
      clientX: 11,
      clientY: 11,
    });
    expect(container.querySelector('circle[data-node-id="afiliar"]')?.getAttribute('stroke')).toBe(
      'rgb(232,93,48)',
    );

    pathname = '/produtos/afiliar-se';
    searchParams = new URLSearchParams();
    rerender(
      <KloelGraphShell>
        <div>Affiliate screen</div>
      </KloelGraphShell>,
    );

    expect(container.querySelector('circle[data-node-id="afiliar"]')?.getAttribute('stroke')).toBe(
      'none',
    );
  });

  it('opens dynamic product nodes and product tab subnodes from real product data', () => {
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

    push.mockClear();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Abrir Cupons' }), {
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Abrir Cupons' }), {
      clientX: 11,
      clientY: 11,
    });
    expect(push).toHaveBeenCalledWith('/products/prod_1?tab=cupons');
  });

  it('opens dynamic member area nodes from real member area data', () => {
    renderShell();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Abrir Curso real' }), {
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Abrir Curso real' }), {
      clientX: 11,
      clientY: 11,
    });
    expect(push).toHaveBeenCalledWith('/produtos/area-membros?areaId=area_1');
  });

  it('opens Kloel search deep-links through the existing command palette', () => {
    pathname = '/chat';
    searchParams = new URLSearchParams('graphAction=search');

    renderShell();

    expect(openPalette).toHaveBeenCalledWith({ initialQuery: '' });
  });

  it('uses the existing command palette for Kloel search and recent nodes', () => {
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

  it('closes the overlay on outside click while preserving clicks inside the real screen', () => {
    const { container } = renderShell(<main>ProdutosView real</main>);

    fireEvent.click(screen.getByRole('dialog', { name: /Produtos/i }));
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(container.querySelector('[role="dialog"]')?.parentElement as Element);
    expect(push).toHaveBeenCalledWith('/products?graph=1');
  });

  it('closes the overlay back to graph-only mode on the current node route', () => {
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar overlay do grafo' }));

    expect(push).toHaveBeenCalledWith('/products?graph=1');
  });
});
