import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MetaOfficialConnectPane, QRCodePane } from './WhatsAppExperience';

describe('QRCodePane', () => {
  it('shows the real qr code once it is available', () => {
    render(
      <QRCodePane
        qrCode="data:image/png;base64,abc123"
        progress={92}
        connected={false}
        loading={false}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByAltText('QR Code do WhatsApp')).toBeVisible();
    expect(screen.getByText('QR Code pronto para leitura.')).toBeVisible();
    expect(screen.queryByText('Gerando QR Code...')).not.toBeInTheDocument();
  });

  it('keeps the generating overlay only while the qr code is still missing', () => {
    render(
      <QRCodePane qrCode="" progress={18} connected={false} loading={true} onRefresh={vi.fn()} />,
    );

    expect(screen.getByText('Gerando QR Code...')).toBeVisible();
    expect(screen.queryByAltText('QR Code do WhatsApp')).not.toBeInTheDocument();
  });
});

describe('MetaOfficialConnectPane', () => {
  it('renders the official Meta onboarding without exposing qr instructions', () => {
    render(
      <MetaOfficialConnectPane
        connected={false}
        statusLabel="Desconectado"
        profileName="Aguardando perfil"
        connectedPhone="Aguardando número"
        phoneNumberId=""
        degradedReason=""
        busy={null}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByText('Conexão oficial, sem QR')).toBeVisible();
    expect(screen.getByText('Conectar com Meta')).toBeVisible();
    expect(screen.queryByAltText('QR Code do WhatsApp')).not.toBeInTheDocument();
    expect(screen.queryByText('Escaneie o QR Code')).not.toBeInTheDocument();
  });
});
