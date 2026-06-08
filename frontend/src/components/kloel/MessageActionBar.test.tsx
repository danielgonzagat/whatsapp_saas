import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MessageActionBar } from './MessageActionBar';

describe('MessageActionBar', () => {
  it('exposes active toggle actions with aria-pressed state', () => {
    render(
      <MessageActionBar
        content="Resposta"
        actions={[
          {
            id: 'thumbs-up',
            label: 'Gostei',
            icon: 'thumbsUp',
            active: true,
            onClick: vi.fn(),
          },
          {
            id: 'thumbs-down',
            label: 'Nao gostei',
            icon: 'thumbsDown',
            active: false,
            onClick: vi.fn(),
          },
          {
            id: 'retry',
            label: 'Tentar novamente',
            icon: 'retry',
            onClick: vi.fn(),
          },
        ]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Gostei' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Nao gostei' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(
      screen.getByRole('button', { name: 'Tentar novamente' }).hasAttribute('aria-pressed'),
    ).toBe(false);
  });
});
