import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LegacyRuntimeSnapshotPane, resolveWhatsAppConnectionMode } from './WhatsAppExperience';

describe('resolveWhatsAppConnectionMode', () => {
  it('keeps explicit WAHA providers on the legacy path only when they are truly explicit', () => {
    expect(resolveWhatsAppConnectionMode('waha')).toBe('legacy-runtime');
    expect(resolveWhatsAppConnectionMode('whatsapp-api')).toBe('legacy-runtime');
    expect(resolveWhatsAppConnectionMode('legacy-runtime')).toBe('legacy-runtime');
  });

  it('defaults unknown or empty providers to Meta Cloud instead of assuming QR mode', () => {
    expect(resolveWhatsAppConnectionMode('')).toBe('meta-cloud');
    expect(resolveWhatsAppConnectionMode(undefined)).toBe('meta-cloud');
    expect(resolveWhatsAppConnectionMode('meta-cloud')).toBe('meta-cloud');
  });
});

describe('LegacyRuntimeSnapshotPane', () => {
  it('shows a legacy snapshot while steering operators back to the official Meta onboarding flow', () => {
    render(
      <LegacyRuntimeSnapshotPane
        qrCode="data:image/png;base64,abc123"
        progress={92}
        connected={false}
        loading={false}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByAltText('Snapshot legado do WhatsApp')).toBeVisible();
    expect(screen.getByText(/O runtime legado do navegador foi descontinuado\./)).toBeVisible();
    expect(screen.getByText('Atualizar snapshot legado')).toBeVisible();
    expect(screen.queryByText('Gerando QR Code...')).not.toBeInTheDocument();
  });

  it('shows a legacy-runtime disabled overlay instead of pretending the QR flow is still active', () => {
    render(
      <LegacyRuntimeSnapshotPane
        qrCode=""
        progress={18}
        connected={false}
        loading={true}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByText('Runtime legado descontinuado')).toBeVisible();
    expect(screen.getByText(/O runtime legado do navegador foi descontinuado\./)).toBeVisible();
    expect(screen.queryByAltText('Snapshot legado do WhatsApp')).not.toBeInTheDocument();
  });
});
