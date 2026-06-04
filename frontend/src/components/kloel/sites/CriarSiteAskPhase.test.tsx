import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CriarSiteAskPhase } from './CriarSiteAskPhase';
import type { SiteItem } from './SitesViewIcons';

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
