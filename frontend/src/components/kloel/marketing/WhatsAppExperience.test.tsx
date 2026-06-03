import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConnectionStep } from './WhatsAppExperience.wizard-connection-products';
import type { EffectiveConnection } from './WhatsAppExperience.panel-tokens';

const disconnectedConnection: EffectiveConnection = {
  connected: false,
  status: 'connection_incomplete',
  phoneNumber: '',
  pushName: '',
  phoneNumberId: '',
};

describe('ConnectionStep', () => {
  it('starts the official Meta authorization with the provided URL', () => {
    const onConnectMeta = vi.fn();

    render(
      <ConnectionStep
        effectiveConnection={disconnectedConnection}
        busyKey={null}
        metaAuthUrl="https://www.facebook.com/v18.0/dialog/oauth?client_id=123"
        isMetaProvider={true}
        metaConnecting={false}
        onConnectMeta={onConnectMeta}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /conectar com meta/i }));

    expect(onConnectMeta).toHaveBeenCalledWith(
      'https://www.facebook.com/v18.0/dialog/oauth?client_id=123',
    );
  });

  it('requests a fresh Meta authorization when the URL is not ready yet', () => {
    const onConnectMeta = vi.fn();

    render(
      <ConnectionStep
        effectiveConnection={disconnectedConnection}
        busyKey={null}
        metaAuthUrl={null}
        isMetaProvider={true}
        metaConnecting={false}
        onConnectMeta={onConnectMeta}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /gerar autorizacao meta/i }));

    expect(onConnectMeta).toHaveBeenCalledWith(null);
  });
});
