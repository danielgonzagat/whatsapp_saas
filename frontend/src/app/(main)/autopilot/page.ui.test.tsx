import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ActionRow, StatusPill } from './page.ui';
import type { AutopilotAction } from './page.types';

describe('Autopilot UI formatting', () => {
  it('renders human status labels instead of raw backend constants', () => {
    render(
      <>
        <StatusPill label="Sistema" status="DOWN" />
        <StatusPill label="Worker" status="NOT_CONFIGURED" />
        <StatusPill label="OpenAI" status="MISSING" />
        <StatusPill label="Banco" status="UP" />
      </>,
    );

    expect(screen.getByText('Indisponível')).toBeTruthy();
    expect(screen.getByText('Não configurado')).toBeTruthy();
    expect(screen.getByText('Ausente')).toBeTruthy();
    expect(screen.getByText('Disponível')).toBeTruthy();
    expect(screen.queryByText('DOWN')).toBeNull();
    expect(screen.queryByText('NOT_CONFIGURED')).toBeNull();
  });

  it('renders human event labels in recent action rows', () => {
    const action: AutopilotAction = {
      id: 'action-1',
      createdAt: '2026-06-08T11:15:00.000Z',
      contact: 'Lead Codex',
      intent: 'autonomy.propose',
      action: 'brain.autonomy.propose',
      status: 'success',
    };

    render(<ActionRow action={action} />);

    expect(screen.getByText('Proposta de autonomia')).toBeTruthy();
    expect(screen.getByText('Proposta cognitiva')).toBeTruthy();
    expect(screen.queryByText('autonomy.propose')).toBeNull();
    expect(screen.queryByText('brain.autonomy.propose')).toBeNull();
  });
});
