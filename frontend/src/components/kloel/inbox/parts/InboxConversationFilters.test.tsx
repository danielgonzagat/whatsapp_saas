import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { InboxConversationFilters } from './InboxConversationFilters';

describe('InboxConversationFilters', () => {
  it('announces active channel and status filters with pressed state', () => {
    const setChannelFilter = vi.fn();
    const setStatusFilter = vi.fn();

    render(
      <InboxConversationFilters
        channelFilter="whatsapp"
        setChannelFilter={setChannelFilter}
        statusFilter="open"
        setStatusFilter={setStatusFilter}
      />,
    );

    expect(screen.getByRole('button', { name: 'WhatsApp' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Email' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(screen.getByRole('button', { name: 'Abertas' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Fechadas' }).getAttribute('aria-pressed')).toBe(
      'false',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Email' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fechadas' }));

    expect(setChannelFilter).toHaveBeenCalledWith('email');
    expect(setStatusFilter).toHaveBeenCalledWith('closed');
  });
});
