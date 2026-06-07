import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AdAccountsBoard } from './AdAccountsBoard';
import { PLATFORM_DEFAULTS } from './anuncios-types';

describe('AdAccountsBoard', () => {
  it('exposes separated accessible names for connect buttons', () => {
    const onConnectPlatform = vi.fn();

    render(<AdAccountsBoard platforms={PLATFORM_DEFAULTS} onConnectPlatform={onConnectPlatform} />);

    const metaButton = screen.getByRole('button', { name: 'Conectar Meta Ads' });
    expect(metaButton.getAttribute('aria-label')).toBe('Conectar Meta Ads');
    expect(screen.queryByRole('button', { name: 'ConectarMeta Ads' })).toBeNull();

    fireEvent.click(metaButton);
    expect(onConnectPlatform).toHaveBeenCalledWith('meta');
  });
});
