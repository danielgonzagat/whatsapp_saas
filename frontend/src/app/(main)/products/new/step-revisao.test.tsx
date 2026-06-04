import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StepRevisao } from './step-revisao';
import { initialForm } from './types';

describe('StepRevisao', () => {
  it('exposes edit buttons with section-specific accessible names', () => {
    render(<StepRevisao form={initialForm} needsPhysical={false} onEditStep={vi.fn()} />);

    expect(screen.getByRole('button', { name: /editar detalhes/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /editar configuracao de vendas/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /editar afiliacao/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /editar pagamento/i })).toBeTruthy();
  });
});
