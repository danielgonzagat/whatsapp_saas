import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Site, SiteDomain } from '@/lib/api/sites';
import { Protecao } from './Protecao';

const { useSiteDomains } = vi.hoisted(() => ({
  useSiteDomains: vi.fn(),
}));

vi.mock('@/hooks/useSites', () => ({
  useSiteDomains,
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

const domain: SiteDomain = {
  id: 'dom-1',
  siteId: 'site-1',
  hostname: 'loja.example.com',
  isCustom: true,
  dnsStatus: 'VERIFIED',
  sslStatus: 'ACTIVE',
  createdAt: '2026-06-02T00:00:00.000Z',
};

describe('Sites Protecao', () => {
  beforeEach(() => {
    useSiteDomains.mockReset();
    useSiteDomains.mockReturnValue({
      domains: [domain],
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    });
  });

  it('renders real domain SSL and DNS status instead of an unavailable security placeholder', () => {
    render(<Protecao workspaceId="ws-1" sites={[site]} loading={false} />);

    expect(screen.queryByText(/painel de seguranca avancada ainda nao esta disponivel/i)).toBeNull();
    expect(screen.getByText('loja.example.com')).toBeTruthy();
    expect(screen.getByText('DNS VERIFIED')).toBeTruthy();
    expect(screen.getByText('SSL ACTIVE')).toBeTruthy();
  });

  it('does not request DNS and SSL status for draft-only Kloel sites', () => {
    const draftSite: Site = {
      ...site,
      id: 'draft-1',
      slug: '',
      status: 'DRAFT',
      publishedAt: null,
    };

    render(<Protecao workspaceId="ws-1" sites={[draftSite]} loading={false} />);

    expect(useSiteDomains).toHaveBeenCalledWith('ws-1', null);
    expect(screen.getByText('Publique um site antes de acompanhar DNS e SSL.')).toBeTruthy();
    expect((screen.getByLabelText('Site para seguranca') as HTMLSelectElement).disabled).toBe(true);
    expect(screen.queryByText('loja.example.com')).toBeNull();
  });
});
