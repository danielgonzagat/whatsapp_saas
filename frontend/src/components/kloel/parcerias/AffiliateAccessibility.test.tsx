import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const affiliateApiMock = vi.hoisted(() => ({
  aiSearch: vi.fn(),
  saveProduct: vi.fn(),
  suggest: vi.fn(),
}));
const nextRouterMock = vi.hoisted(() => ({ pathname: '/parcerias/afiliados', push: vi.fn() }));
const partnershipsApiMock = vi.hoisted(() => ({
  affiliatePerformance: vi.fn(),
}));
const partnershipsMock = vi.hoisted(() => ({
  useAffiliates: vi.fn(() => ({ affiliates: [] as unknown[], mutate: vi.fn() })),
  useAffiliateStats: vi.fn(() => ({
    stats: {
      activeAffiliates: 0,
      producers: 0,
      totalRevenue: 0,
      totalCommissions: 0,
      topPartner: null,
    },
  })),
  useCollaborators: vi.fn(() => ({ agents: [], invites: [], mutate: vi.fn() })),
  useCollaboratorStats: vi.fn(() => ({ stats: { total: 0, online: 0, pendingInvites: 0 } })),
  usePartnerChatContacts: vi.fn(() => ({ contacts: [] as unknown[], mutate: vi.fn() })),
  usePartnerMessages: vi.fn(() => ({ messages: [], mutate: vi.fn() })),
  createAffiliate: vi.fn(),
  inviteCollaborator: vi.fn(),
  markPartnerAsRead: vi.fn(),
  revokeAffiliate: vi.fn(),
  sendPartnerMessage: vi.fn(),
}));

vi.mock('@/hooks/usePartnerships', () => partnershipsMock);
vi.mock('@/lib/api/affiliate', () => ({
  affiliateApi: affiliateApiMock,
}));
vi.mock('@/lib/api/partnerships', () => ({
  partnershipsApi: partnershipsApiMock,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => nextRouterMock.pathname,
  useRouter: () => nextRouterMock,
}));

import AffiliateDetailSheet from './AffiliateDetailSheet';
import AffiliateFilterToolbar from './AffiliateFilterToolbar';
import AffiliateMarketplaceSearch from './AffiliateMarketplaceSearch';
import AffiliateProductSuggestions from './AffiliateProductSuggestions';
import ParceriasShell from './ParceriasShell';

beforeEach(() => {
  vi.clearAllMocks();
  nextRouterMock.pathname = '/parcerias/afiliados';
  partnershipsMock.useAffiliates.mockReturnValue({ affiliates: [] as unknown[], mutate: vi.fn() });
  partnershipsMock.usePartnerChatContacts.mockReturnValue({ contacts: [] as unknown[], mutate: vi.fn() });
  affiliateApiMock.aiSearch.mockResolvedValue({ data: { results: [] } });
  partnershipsApiMock.affiliatePerformance.mockResolvedValue({ data: null });
  affiliateApiMock.saveProduct.mockResolvedValue({ success: true });
  affiliateApiMock.suggest.mockResolvedValue({ data: { products: [] } });
});

describe('affiliate search controls', () => {
  it('marks the current Parcerias tab and affiliate filter as pressed controls', () => {
    render(<ParceriasShell defaultTab="afiliados" />);

    expect(
      screen.getByRole('button', { name: 'Afiliados e Produtores' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: 'Central de Colaboradores' }).getAttribute('aria-pressed'),
    ).toBe('false');
    expect(screen.getByRole('button', { name: 'Chat' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Todos' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Afiliados' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(screen.getByRole('button', { name: 'Produtores' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('keeps tab content aligned with the confirmed Parcerias route while navigation is pending', () => {
    nextRouterMock.pathname = '/parcerias/chat';
    render(<ParceriasShell defaultTab="chat" />);

    fireEvent.click(screen.getByRole('button', { name: 'Central de Colaboradores' }));

    expect(nextRouterMock.push).toHaveBeenCalledWith('/parcerias/colaboradores');
    expect(screen.getByRole('button', { name: 'Chat' }).getAttribute('aria-pressed')).toBe('true');
    expect(
      screen.getByRole('button', { name: 'Central de Colaboradores' }).getAttribute('aria-pressed'),
    ).toBe('false');
    expect(screen.queryByText('Total Colaboradores')).toBeNull();
  });

  it('names partner chat search for browser autofill and DevTools audits', () => {
    nextRouterMock.pathname = '/parcerias/chat';
    render(<ParceriasShell defaultTab="chat" />);

    const search = screen.getByLabelText('Buscar conversa');

    expect(search.getAttribute('id')).toBe('partner-chat-search');
    expect(search.getAttribute('name')).toBe('partnerChatSearch');
  });

  it('renders partner chat contacts as named keyboard-reachable buttons', () => {
    nextRouterMock.pathname = '/parcerias/chat';
    partnershipsMock.usePartnerChatContacts.mockReturnValue({
      contacts: [
        {
          id: 'partner-chat-1',
          name: 'Parceiro QA',
          unread: 0,
          lastMessage: 'Mensagem recente',
          online: true,
          time: 'agora',
        },
      ],
      mutate: vi.fn(),
    });

    render(<ParceriasShell defaultTab="chat" />);

    const contact = screen.getByRole('button', { name: 'Abrir conversa com Parceiro QA' });

    expect(contact.getAttribute('type')).toBe('button');
  });

  it('routes affiliate detail chat action through the chat URL instead of local-only state', () => {
    partnershipsMock.useAffiliates.mockReturnValue({
      affiliates: [
        {
          id: 'affiliate-route-1',
          name: 'Afiliado QA',
          email: 'afiliado-route@example.test',
          type: 'affiliate',
          status: 'active',
          commission: 30,
          revenue: 0,
          temperature: 0,
          totalSales: 0,
        },
      ],
      mutate: vi.fn(),
    });

    render(<ParceriasShell defaultTab="afiliados" />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir detalhes de Afiliado QA' }));
    fireEvent.click(screen.getByRole('button', { name: 'Abrir chat' }));

    expect(nextRouterMock.push).toHaveBeenCalledWith('/parcerias/chat');
    expect(
      screen.getByRole('button', { name: 'Afiliados e Produtores' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('keeps partner and marketplace search inputs identifiable for browser autofill and auditing', () => {
    render(
      <>
        <AffiliateFilterToolbar
          filterType="todos"
          setFilterType={vi.fn()}
          search=""
          setSearch={vi.fn()}
          onInvite={vi.fn()}
        />
        <AffiliateMarketplaceSearch />
      </>,
    );

    const partnerSearch = screen.getByLabelText('Buscar parceiro');
    const marketplaceSearch = screen.getByLabelText('Buscar no marketplace por categoria ou tag');
    const marketplaceSubmit = screen.getByLabelText('Buscar produtos no marketplace');

    expect(partnerSearch.getAttribute('id')).toBe('affiliate-partner-search');
    expect(partnerSearch.getAttribute('name')).toBe('affiliatePartnerSearch');
    expect(marketplaceSearch.getAttribute('id')).toBe('affiliate-marketplace-search');
    expect(marketplaceSearch.getAttribute('name')).toBe('affiliateMarketplaceSearch');
    expect(marketplaceSubmit.getAttribute('type')).toBe('button');
  });

  it('renders AI suggestions with product names instead of raw product ids', async () => {
    affiliateApiMock.suggest.mockResolvedValueOnce({
      data: {
        products: [
          {
            id: 'affiliate-product-1',
            productId: '4ab8ceb3-1d80-4428-858d-2a5abf9b8466',
            name: 'Produto Kloel Auditoria',
            producer: 'Workspace Kloel',
            category: 'Cursos Online',
            commissionPct: 35,
            isSaved: true,
            requestStatus: 'SAVED',
          },
        ],
      },
    });

    render(<AffiliateProductSuggestions />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver sugestoes para meu nicho' }));

    expect(await screen.findByText('Produto Kloel Auditoria')).toBeTruthy();
    expect(screen.getByText('Workspace Kloel · Cursos Online')).toBeTruthy();
    expect(screen.queryByText('4ab8ceb3-1d80-4428-858d-2a5abf9b8466')).toBeNull();
    expect(screen.getByRole('button', { name: 'Salvo' }).hasAttribute('disabled')).toBe(true);
  });

  it('renders marketplace search results with product names and a named submit button', async () => {
    affiliateApiMock.aiSearch.mockResolvedValueOnce({
      data: {
        results: [
          {
            id: 'affiliate-product-2',
            productId: '01d62581-39e5-434f-9699-2f18a186dea7',
            name: 'Produto Marketplace Humano',
            producer: 'Produtor Parceiro',
            category: 'E-books',
            commissionPct: 31,
          },
        ],
      },
    });

    render(<AffiliateMarketplaceSearch />);
    fireEvent.change(screen.getByLabelText('Buscar no marketplace por categoria ou tag'), {
      target: { value: 'ebook' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar produtos no marketplace' }));

    await waitFor(() => expect(affiliateApiMock.aiSearch).toHaveBeenCalledWith('ebook'));
    expect(await screen.findByText('Produto Marketplace Humano')).toBeTruthy();
    expect(screen.getByText('Produtor Parceiro · E-books')).toBeTruthy();
    expect(screen.queryByText('01d62581-39e5-434f-9699-2f18a186dea7')).toBeNull();
  });

  it('names marketplace product save controls with the product context', async () => {
    const { default: MarketplaceProductGrid } = await import('../produtos/MarketplaceProductGrid');
    const onToggleSave = vi.fn();

    render(
      <MarketplaceProductGrid
        filteredMarket={[
          {
            id: 'marketplace-product-1',
            name: 'Produto Kloel Auditoria',
            producer: 'Produtor Parceiro',
            category: 'E-books',
            commission: 31,
            price: 39.9,
            rating: 0,
          } as never,
        ]}
        onSelectItem={vi.fn()}
        onToggleSave={onToggleSave}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Salvar produto: Produto Kloel Auditoria' }));

    expect(onToggleSave).toHaveBeenCalledWith('marketplace-product-1', false);
  });

  it('asks for confirmation before revoking an affiliate from the detail sheet', () => {
    const onRevoke = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    try {
      render(
        <AffiliateDetailSheet
          affiliate={{ name: 'Afiliado QA', email: 'afiliado@example.test' }}
          onClose={vi.fn()}
          onChat={vi.fn()}
          onRevoke={onRevoke}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Revogar' }));

      expect(confirmSpy).toHaveBeenCalledWith(
        'Revogar este afiliado? Esta acao remove o acesso dele ao programa.',
      );
      expect(onRevoke).not.toHaveBeenCalled();

      confirmSpy.mockReturnValue(true);
      fireEvent.click(screen.getByRole('button', { name: 'Revogar' }));

      expect(onRevoke).toHaveBeenCalledTimes(1);
    } finally {
      confirmSpy.mockRestore();
    }
  });

  it('renders revoked affiliates as revoked and blocks repeated revoke attempts', () => {
    const onRevoke = vi.fn();

    render(
      <AffiliateDetailSheet
        affiliate={{ name: 'Afiliado QA', email: 'afiliado@example.test', status: 'revoked' }}
        onClose={vi.fn()}
        onChat={vi.fn()}
        onRevoke={onRevoke}
      />,
    );

    expect(screen.getByText('Revogado')).toBeTruthy();
    expect(screen.queryByText('Pendente')).toBeNull();

    const revokeButton = screen.getByRole('button', { name: 'Revogar' });
    expect(revokeButton.hasAttribute('disabled')).toBe(true);
    fireEvent.click(revokeButton);

    expect(onRevoke).not.toHaveBeenCalled();
  });

  it('closes affiliate detail through the visible named close button', () => {
    const onClose = vi.fn();

    render(
      <AffiliateDetailSheet
        affiliate={{ name: 'Afiliado QA', email: 'afiliado@example.test' }}
        onClose={onClose}
        onChat={vi.fn()}
        onRevoke={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fechar modal' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
