import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SocialButtons } from './kloel-auth-screen.social-buttons';

vi.mock('@/lib/i18n/t', () => ({
  kloelT: (text: string) => text,
}));

const { mockUseAppleDiagnostic } = vi.hoisted(() => ({
  mockUseAppleDiagnostic: vi.fn(() => ({
    ready: true,
    configured: true,
    lastProbeAt: null as Date | null,
    lastProbeResult: null as 'PASS' | 'FAIL' | null,
  })),
}));

vi.mock('@/hooks/useAppleDiagnostic', () => ({
  useAppleDiagnostic: () => mockUseAppleDiagnostic(),
}));

const readyState = {
  ready: true as boolean,
  configured: true as boolean,
  lastProbeAt: new Date() as Date | null,
  lastProbeResult: 'PASS' as 'PASS' | 'FAIL' | null,
};

const notReadyState = {
  ready: false as boolean,
  configured: false as boolean,
  lastProbeAt: null as Date | null,
  lastProbeResult: null as 'PASS' | 'FAIL' | null,
};

describe('SocialButtons', () => {
  beforeEach(() => {
    mockUseAppleDiagnostic.mockReturnValue(readyState);
  });

  it('renders Google and Apple buttons when diagnostic is ready', () => {
    const ref = createRef<HTMLDivElement>();
    render(<SocialButtons googleButtonRef={ref} isLoading={false} onAppleClick={vi.fn()} onFacebookClick={vi.fn()} facebookAvailable={false} facebookSdkReady={false} onTikTokClick={vi.fn()} tikTokAvailable={false} />);

    expect(screen.getByText('Continuar com Google')).toBeInTheDocument();
    expect(screen.getByText('Continuar com Apple')).toBeInTheDocument();
  });

  it('hides Apple button when diagnostic is not ready', () => {
    mockUseAppleDiagnostic.mockReturnValue(notReadyState);

    const ref = createRef<HTMLDivElement>();
    render(<SocialButtons googleButtonRef={ref} isLoading={false} onAppleClick={vi.fn()} onFacebookClick={vi.fn()} facebookAvailable={false} facebookSdkReady={false} onTikTokClick={vi.fn()} tikTokAvailable={false} />);

    expect(screen.queryByText('Continuar com Apple')).not.toBeInTheDocument();
  });

  it('does NOT render Facebook or TikTok buttons', () => {
    const ref = createRef<HTMLDivElement>();
    render(<SocialButtons googleButtonRef={ref} isLoading={false} onAppleClick={vi.fn()} onFacebookClick={vi.fn()} facebookAvailable={false} facebookSdkReady={false} onTikTokClick={vi.fn()} tikTokAvailable={false} />);

    expect(screen.queryByText('Facebook')).not.toBeInTheDocument();
    expect(screen.queryByText('TikTok')).not.toBeInTheDocument();
  });

  it('calls onAppleClick when Apple button is clicked', () => {
    const onAppleClick = vi.fn();
    const ref = createRef<HTMLDivElement>();
    render(<SocialButtons googleButtonRef={ref} isLoading={false} onAppleClick={onAppleClick} onFacebookClick={vi.fn()} facebookAvailable={false} facebookSdkReady={false} onTikTokClick={vi.fn()} tikTokAvailable={false} />);

    fireEvent.click(screen.getByText('Continuar com Apple'));
    expect(onAppleClick).toHaveBeenCalledTimes(1);
  });

  it('disables Apple button when isAppleLoading is true', () => {
    const ref = createRef<HTMLDivElement>();
    render(<SocialButtons googleButtonRef={ref} isLoading={false} isAppleLoading={true} onAppleClick={vi.fn()} onFacebookClick={vi.fn()} facebookAvailable={false} facebookSdkReady={false} onTikTokClick={vi.fn()} tikTokAvailable={false} />);

    const appleButton = screen.getByText('Continuar com Apple').closest('button');
    expect(appleButton).toBeDisabled();
  });
});
