import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CriarSite } from './CriarSite';
import { CriarSiteAskPhase } from './CriarSiteAskPhase';
import type { SiteItem } from './SitesViewIcons';

const { apiFetch, mutate, useProducts, getSearchParam } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  mutate: vi.fn(),
  useProducts: vi.fn(),
  getSearchParam: vi.fn(),
}));

vi.mock('@/lib/api', () => ({ apiFetch }));
vi.mock('@/hooks/useProducts', () => ({ useProducts }));
vi.mock('swr', () => ({ mutate }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => ({ get: getSearchParam }),
}));

const savedSite: SiteItem = {
  id: 'site-1',
  name: 'Site real',
  htmlContent: '<main>Site</main>',
  slug: 'site-real',
  published: false,
  updatedAt: '2026-06-04T00:00:00.000Z',
};

function renderAskPhase(overrides: Partial<Parameters<typeof CriarSiteAskPhase>[0]> = {}) {
  const props: Parameters<typeof CriarSiteAskPhase>[0] = {
    prompt: '',
    setPrompt: vi.fn(),
    handleGenerate: vi.fn(),
    error: '',
    productList: [],
    savedSites: [],
    loadingSites: false,
    loadSavedSite: vi.fn(),
    handleDelete: vi.fn(),
    dynamicMode: false,
    source: '',
    productName: '',
    ...overrides,
  };

  return { ...render(<CriarSiteAskPhase {...props} />), props };
}

describe('CriarSite', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    mutate.mockReset();
    useProducts.mockReset();
    getSearchParam.mockReset();
    useProducts.mockReturnValue({ products: [] });
    getSearchParam.mockReturnValue('');
  });

  it('lists a saved site immediately after saving and returning from the editor', async () => {
    apiFetch
      .mockResolvedValueOnce({ data: { sites: [] }, status: 200 })
      .mockResolvedValueOnce({ data: { html: savedSite.htmlContent }, status: 201 })
      .mockResolvedValueOnce({ data: { site: savedSite }, status: 201 });

    render(<CriarSite />);

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/kloel/site/list'));

    fireEvent.change(screen.getByLabelText('Prompt do site'), {
      target: { value: 'Site real' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Gerar Site com IA/ }));

    expect(await screen.findByText('Editor do Site')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/kloel/site/save', {
        method: 'POST',
        body: { name: 'Site real', htmlContent: savedSite.htmlContent },
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(await screen.findByRole('button', { name: 'Site real' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Excluir Site real' })).toBeTruthy();
  });
});

describe('CriarSiteAskPhase', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the generation prompt as a named accessible field', () => {
    const { container } = renderAskPhase();

    const promptField = container.querySelector('textarea');

    expect(promptField?.getAttribute('id')).toBe('site-generation-prompt');
    expect(promptField?.getAttribute('name')).toBe('siteGenerationPrompt');
    expect(promptField?.getAttribute('aria-label')).toBe('Prompt do site');
  });

  it('requires confirmation before deleting a saved site', () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    const handleDelete = vi.fn();

    renderAskPhase({ savedSites: [savedSite], handleDelete });

    fireEvent.click(screen.getByRole('button', { name: 'Excluir Site real' }));

    expect(confirm).toHaveBeenCalledWith('Excluir o site "Site real"? Esta acao nao pode ser desfeita.');
    expect(handleDelete).not.toHaveBeenCalled();
  });
});
