import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Site, SiteAppIntegration } from '@/lib/api/sites';
import { Apps } from './Apps';

const { mutateApps, upsertApp, useSiteApps } = vi.hoisted(() => ({
  mutateApps: vi.fn(),
  upsertApp: vi.fn(),
  useSiteApps: vi.fn(),
}));

vi.mock('@/hooks/useSites', () => ({
  useSiteApps,
  useSiteMutations: () => ({ upsertApp }),
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

const googleAnalyticsApp: SiteAppIntegration = {
  id: 'app-1',
  siteId: 'site-1',
  appKey: 'google-analytics',
  enabled: false,
  config: { trackingId: 'G-REAL123' },
  createdAt: '2026-06-02T00:00:00.000Z',
};

describe('Sites Apps', () => {
  beforeEach(() => {
    mutateApps.mockReset();
    upsertApp.mockReset();
    useSiteApps.mockReset();
    useSiteApps.mockReturnValue({
      apps: [googleAnalyticsApp],
      isLoading: false,
      error: null,
      mutate: mutateApps,
    });
  });

  it('renders backend site apps instead of an unavailable placeholder', () => {
    render(<Apps workspaceId="ws-1" sites={[site]} loading={false} />);

    expect(screen.queryByText(/ainda nao esta disponivel/i)).toBeNull();
    expect(screen.getByText('Google Analytics')).toBeTruthy();
    expect(screen.getByLabelText('Google Analytics ID de medicao')).toHaveProperty(
      'value',
      'G-REAL123',
    );
  });

  it('persists app enablement through the real site app mutation', async () => {
    render(<Apps workspaceId="ws-1" sites={[site]} loading={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ativar Google Analytics' }));

    await waitFor(() =>
      expect(upsertApp).toHaveBeenCalledWith('site-1', 'google-analytics', {
        enabled: true,
        config: { trackingId: 'G-REAL123' },
      }),
    );
    expect(mutateApps).toHaveBeenCalled();
  });
});
