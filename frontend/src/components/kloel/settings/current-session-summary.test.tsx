import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CurrentSessionSummary } from './current-session-summary';

describe('CurrentSessionSummary', () => {
  it('renders the current device summary with a current-session badge', () => {
    render(
      <CurrentSessionSummary
        surface={{
          device: 'Chrome em macOS',
          detail: 'Sessão atual neste dispositivo • America/Sao_Paulo',
          deviceType: 'desktop',
        }}
      />,
    );

    expect(screen.getByText('Chrome em macOS')).toBeInTheDocument();
    expect(
      screen.getByText('Sessão atual neste dispositivo • America/Sao_Paulo'),
    ).toBeInTheDocument();
    expect(screen.getByText('Atual')).toBeInTheDocument();
  });
});
