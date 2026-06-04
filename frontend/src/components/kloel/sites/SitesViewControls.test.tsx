import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SitesView from './SitesView';
import { Input } from './SitesViewControls';

const { pathname, push, searchGet } = vi.hoisted(() => ({
  pathname: vi.fn(() => '/sites'),
  push: vi.fn(),
  searchGet: vi.fn(() => null),
}));

vi.mock('@/hooks/useResponsiveViewport', () => ({
  useResponsiveViewport: () => ({ isMobile: false }),
}));
vi.mock('@/hooks/useSites', () => ({
  useSites: () => ({ sites: [], isLoading: false, error: null }),
}));
vi.mock('@/hooks/useWorkspaceId', () => ({
  useWorkspaceId: () => 'ws-1',
}));
vi.mock('next/navigation', () => ({
  usePathname: () => pathname(),
  useRouter: () => ({ push }),
  useSearchParams: () => ({ get: searchGet }),
}));
vi.mock('./VisaoGeral', () => ({
  VisaoGeral: ({ switchTab }: { switchTab: (id: string) => void }) => (
    <div>
      <span>Visao Geral body</span>
      <button type="button" onClick={() => switchTab('criar')}>Criar Novo Site</button>
    </div>
  ),
}));
vi.mock('./Dominios', () => ({ Dominios: () => <div>Dominios body</div> }));
vi.mock('./Hospedagem', () => ({ Hospedagem: () => <div>Hospedagem body</div> }));
vi.mock('./CriarSite', () => ({ CriarSite: () => <div>Criar Site body</div> }));
vi.mock('./EditarSite', () => ({ EditarSite: () => <div>Editar Site body</div> }));
vi.mock('./Apps', () => ({ Apps: () => <div>Apps body</div> }));
vi.mock('./Protecao', () => ({ Protecao: () => <div>Protecao body</div> }));

describe('SitesView tabs', () => {
  beforeEach(() => {
    pathname.mockReturnValue('/sites');
    push.mockReset();
    searchGet.mockReturnValue(null);
  });

  it('switches tab content immediately while pushing the matching route', () => {
    render(<SitesView defaultTab="visao-geral" />);

    expect(screen.getByText('Visao Geral body')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Criar Site' }));

    expect(screen.getByText('Criar Site body')).toBeTruthy();
    expect(push).toHaveBeenCalledWith('/sites/criar');
  });
});

describe('SitesViewControls Input', () => {
  it('renders named form metadata from the accessible label', () => {
    render(<Input value="" onChange={vi.fn()} placeholder="Nome do site" />);

    const input = screen.getByRole('textbox', { name: 'Nome do site' });

    expect(input.getAttribute('id')).toBe('site-input-nome-do-site');
    expect(input.getAttribute('name')).toBe('nome-do-site');
  });
});
