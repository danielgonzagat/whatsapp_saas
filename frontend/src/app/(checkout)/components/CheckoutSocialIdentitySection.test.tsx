import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CheckoutSocialIdentitySection } from './CheckoutSocialIdentitySection';
import { buildBlancTheme } from './checkout-theme-tokens';

const baseProps = {
  theme: buildBlancTheme(),
  facebookAvailable: false,
  appleAvailable: false,
  facebookSdkReady: false,
  googleAvailable: false,
  googleButtonRef: createRef<HTMLDivElement>(),
  onFacebookClick: vi.fn().mockResolvedValue(undefined),
  onAppleClick: vi.fn(),
  socialIdentity: null,
  loadingProvider: null,
};

describe('CheckoutSocialIdentitySection', () => {
  it('does not label unavailable Facebook as loading', () => {
    render(<CheckoutSocialIdentitySection {...baseProps} facebookAvailable />);

    expect(screen.queryByTitle('Facebook indisponível')).not.toBeNull();
    expect(screen.queryByTitle('Carregando Facebook')).toBeNull();
  });

  it('enables Facebook only when the SDK is ready', () => {
    render(
      <CheckoutSocialIdentitySection
        {...baseProps}
        facebookAvailable
        facebookSdkReady
      />,
    );

    expect(screen.queryByTitle('Continuar com Facebook')).not.toBeNull();
  });

  it('uses an action loading label only during Facebook sign in', () => {
    render(
      <CheckoutSocialIdentitySection
        {...baseProps}
        facebookAvailable
        facebookSdkReady
        loadingProvider="facebook"
      />,
    );

    expect(screen.queryByTitle('Entrando com Facebook')).not.toBeNull();
  });
});
