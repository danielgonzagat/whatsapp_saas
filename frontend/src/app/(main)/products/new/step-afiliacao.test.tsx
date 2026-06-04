import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StepAfiliacao } from './step-afiliacao';
import { initialForm } from './types';

describe('StepAfiliacao', () => {
  it('exposes affiliate commission with an accessible name when enabled', () => {
    render(
      <StepAfiliacao
        form={{ ...initialForm, affiliatesEnabled: true }}
        updateForm={vi.fn()}
      />,
    );

    expect(screen.getByRole('spinbutton', { name: /comissao do afiliado/i })).toBeTruthy();
  });
});
