import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FacebookMetaMarketingSurface } from './meta-marketing-facebook';
import { InstagramMetaMarketingSurface } from './meta-marketing-instagram';
import { WhatsAppMetaMarketingSurface } from './meta-marketing-whatsapp';

const channelData = { messages: 12, leads: 4, sales: 2, status: 'connected' };
const noop = vi.fn();

describe('Meta marketing surfaces', () => {
  it('renders WhatsApp official surface without QR onboarding copy', () => {
    render(
      <WhatsAppMetaMarketingSurface
        connectionStatus={{
          meta: { connected: true },
          channels: {
            whatsapp: {
              connected: false,
              status: 'connection_incomplete',
              phoneNumberId: null,
              whatsappBusinessId: null,
            },
          },
        }}
        channelData={channelData}
        feed={[]}
        busy={null}
        onConnect={noop}
        onDisconnect={noop}
        onRefresh={noop}
      />,
    );

    expect(screen.getByText('Conexão oficial Meta Cloud API')).toBeVisible();
    expect(screen.queryByText(/Escaneie o QR Code/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Em breve/i)).not.toBeInTheDocument();
  });

  it('renders Instagram without the legacy coming-soon copy', () => {
    render(
      <InstagramMetaMarketingSurface
        connectionStatus={{ channels: { instagram: { connected: false, status: 'disconnected' } } }}
        profile={null}
        insights={null}
        channelData={channelData}
        feed={[]}
        busy={null}
        onConnect={noop}
        onDisconnect={noop}
        onRefresh={noop}
      />,
    );

    expect(screen.getByText('Instagram Direct oficial')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Conectar Instagram' })).toBeVisible();
    expect(screen.queryByText(/Em breve/i)).not.toBeInTheDocument();
  });

  it('renders Messenger without the legacy coming-soon copy', () => {
    render(
      <FacebookMetaMarketingSurface
        connectionStatus={{ channels: { facebook: { connected: false, status: 'disconnected' } } }}
        channelData={channelData}
        feed={[]}
        busy={null}
        onConnect={noop}
        onDisconnect={noop}
        onRefresh={noop}
      />,
    );

    expect(screen.getByText('Facebook Messenger oficial')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Conectar Messenger' })).toBeVisible();
    expect(screen.queryByText(/Em breve/i)).not.toBeInTheDocument();
  });
});
