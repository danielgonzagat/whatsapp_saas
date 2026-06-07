import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Site, SiteDomain } from '@/lib/api/sites';
import { Dominios } from './Dominios';

const { addDomain, mutateDomains, useSiteDomains } = vi.hoisted(() => ({
  addDomain: vi.fn(),
  mutateDomains: vi.fn(),
  useSiteDomains: vi.fn(),
}));

vi.mock('@/hooks/useSites', () => ({
  useSiteDomains,
  useSiteMutations: () => ({ addDomain }),
}));

const site: Site = {
  id: 'site-1',
  workspaceId: 'ws-1',
  name: 'Site real',
  slug: 'site-real',
  status: 'PUBLISHED',
  template: null,
  content: {},
  seoMeta: {},
  createdAt: '2026-06-02T00:00:00.000Z',
  updatedAt: '2026-06-02T00:00:00.000Z',
  publishedAt: '2026-06-02T00:00:00.000Z',
};

const customDomain: SiteDomain = {
  id: 'dom-1',
  siteId: 'site-1',
  hostname: 'loja.example.com',
  isCustom: true,
  dnsStatus: 'VERIFIED',
  sslStatus: 'ACTIVE',
  createdAt: '2026-06-02T00:00:00.000Z',
};

describe('Sites Dominios', () => {
  beforeEach(() => {
    addDomain.mockReset();
    mutateDomains.mockReset();
    useSiteDomains.mockReset();
    useSiteDomains.mockReturnValue({
      domains: [customDomain],
      isLoading: false,
      error: null,
      mutate: mutateDomains,
    });
  });

  it('renders custom domains loaded from the backend instead of a Cloudflare placeholder', () => {
    render(<Dominios workspaceId="ws-1" sites={[site]} loading={false} />);

    expect(screen.queryByText(/Cloudflare ainda nao esta disponivel/i)).toBeNull();
    expect(screen.getByText('loja.example.com')).toBeTruthy();
    expect(screen.getByText('DNS VERIFIED')).toBeTruthy();
  });

  it('persists a new custom domain through the real domain mutation', async () => {
    render(<Dominios workspaceId="ws-1" sites={[site]} loading={false} />);

    fireEvent.change(screen.getByLabelText('Dominio proprio'), {
      target: { value: 'novo.example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar dominio' }));

    await waitFor(() =>
      expect(addDomain).toHaveBeenCalledWith('site-1', { hostname: 'novo.example.com' }),
    );
    expect(mutateDomains).toHaveBeenCalled();
  });

  it('does not request public-domain data for draft-only Kloel sites', () => {
    const draftSite: Site = {
      ...site,
      id: 'draft-1',
      slug: '',
      status: 'DRAFT',
      publishedAt: null,
    };

    render(<Dominios workspaceId="ws-1" sites={[draftSite]} loading={false} />);

    expect(useSiteDomains).toHaveBeenCalledWith('ws-1', null);
    expect(screen.getByText('Publique um site antes de conectar dominio proprio.')).toBeTruthy();
    expect((screen.getByLabelText('Dominio proprio') as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByText('loja.example.com')).toBeNull();
  });
});
