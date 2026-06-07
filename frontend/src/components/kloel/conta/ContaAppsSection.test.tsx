import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetchMock, useSWRMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  useSWRMock: vi.fn(),
}));

vi.mock('swr', () => ({
  default: useSWRMock,
  mutate: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: apiFetchMock,
}));

vi.mock('./ContaMetaConnectSection', () => ({
  MetaConnectSection: () => <section>Meta connect panel</section>,
}));

import { ContaAppsSection } from './ContaAppsSection';

const metaStatusCalls = () =>
  apiFetchMock.mock.calls.filter(([url]) => url === '/meta/auth/status');

describe('ContaAppsSection', () => {
  beforeEach(() => {
    apiFetchMock.mockResolvedValue({ data: { connected: false }, status: 200 });
    useSWRMock.mockImplementation((key: string) => {
      if (key === '/marketing/connect/status') {
        return {
          data: {
            meta: { connected: false, status: 'disconnected' },
            channels: {
              whatsapp: {
                connected: false,
                providerAvailable: true,
                status: 'meta_auth_required',
              },
              tiktok: {
                connected: false,
                providerAvailable: true,
                status: 'config_missing',
              },
              email: {
                connected: false,
                providerAvailable: false,
                status: 'server_not_configured',
              },
            },
          },
          isLoading: false,
          error: null,
        };
      }
      if (key === '/marketing/connect/google-ads/status') {
        return {
          data: {
            connected: false,
            status: 'not_configured',
            clientConfigured: false,
            secretConfigured: false,
            developerTokenConfigured: false,
          },
          isLoading: false,
          error: null,
        };
      }
      if (key === '/meta/auth/status') {
        return {
          data: { connected: false },
          isLoading: false,
          error: null,
        };
      }
      return { data: null, isLoading: false, error: null };
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders human connection status labels instead of backend tokens', () => {
    render(<ContaAppsSection handleSelectSection={vi.fn()} router={{ push: vi.fn() }} />);

    expect(screen.queryByText('meta auth required')).toBeNull();
    expect(screen.queryByText('config missing')).toBeNull();
    expect(screen.getByText('Login Meta necessario')).toBeTruthy();
    expect(screen.getByText('Configuracao ausente')).toBeTruthy();
    expect(screen.getAllByText('Credenciais ausentes').length).toBeGreaterThan(0);
  });

  it('does not load Meta auth status through a StrictMode effect', async () => {
    const { MetaConnectSection } = await vi.importActual<typeof import('./ContaMetaConnectSection')>(
      './ContaMetaConnectSection',
    );

    render(
      <StrictMode>
        <MetaConnectSection />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /conectar com meta/i })).toBeTruthy();
    });
    expect(metaStatusCalls()).toHaveLength(0);
  });
});
