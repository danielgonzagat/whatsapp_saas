import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let pathname = '/products';
let searchParams = new URLSearchParams();
const push = vi.fn();
const openPalette = vi.fn();

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
        name: 'GHK-CU',
        category: 'Dermocosmeticos',
        status: 'active',
        plans: [{ id: 'plan_1', name: 'Plano principal', active: true }],
        checkouts: [{ id: 'checkout_1', name: 'Checkout principal', active: true }],
      },
    ],
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

  it('navigates by node clicks without opening on drag movement', () => {
    renderShell();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Abrir Afiliar' }), {
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Abrir Afiliar' }), {
      clientX: 11,
      clientY: 11,
    });
    expect(push).toHaveBeenCalledWith('/produtos/afiliar-se');

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

  it('opens dynamic product nodes and product tab subnodes from real product data', () => {
    renderShell();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Abrir GHK-CU' }), {
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Abrir GHK-CU' }), {
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

  it('closes the overlay back to graph-only mode on the current node route', () => {
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar overlay do grafo' }));

    expect(push).toHaveBeenCalledWith('/products?graph=1');
  });
});
