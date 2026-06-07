import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { useSWRMock } = vi.hoisted(() => ({
  useSWRMock: vi.fn(),
}));

vi.mock('swr', () => ({
  default: useSWRMock,
}));

vi.mock('./ContaMetaConnectSection', () => ({
  MetaConnectSection: () => <section>Meta connect panel</section>,
}));

import { ContaAppsSection } from './ContaAppsSection';

describe('ContaAppsSection', () => {
  beforeEach(() => {
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
});
