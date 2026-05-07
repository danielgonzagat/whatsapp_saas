import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SocialButtons } from './kloel-auth-screen.social-buttons';

vi.mock('@/lib/i18n/t', () => ({
  kloelT: (text: string) => text,
}));

describe('SocialButtons', () => {
  it('renders Google and Apple buttons', () => {
    const ref = createRef<HTMLDivElement>();
    render(<SocialButtons googleButtonRef={ref} isLoading={false} onAppleClick={vi.fn()} />);

    expect(screen.getByText('Continuar com Google')).toBeInTheDocument();
    expect(screen.getByText('Continuar com Apple')).toBeInTheDocument();
  });

  it('does NOT render Facebook or TikTok buttons', () => {
    const ref = createRef<HTMLDivElement>();
    render(<SocialButtons googleButtonRef={ref} isLoading={false} onAppleClick={vi.fn()} />);

    expect(screen.queryByText('Facebook')).not.toBeInTheDocument();
    expect(screen.queryByText('TikTok')).not.toBeInTheDocument();
  });

  it('calls onAppleClick when Apple button is clicked', () => {
    const onAppleClick = vi.fn();
    const ref = createRef<HTMLDivElement>();
    render(<SocialButtons googleButtonRef={ref} isLoading={false} onAppleClick={onAppleClick} />);

    fireEvent.click(screen.getByText('Continuar com Apple'));
    expect(onAppleClick).toHaveBeenCalledTimes(1);
  });

  it('disables Apple button when isLoading is true', () => {
    const ref = createRef<HTMLDivElement>();
    render(<SocialButtons googleButtonRef={ref} isLoading={true} onAppleClick={vi.fn()} />);

    const appleButton = screen.getByText('Continuar com Apple').closest('button');
    expect(appleButton).toBeDisabled();
  });
});
