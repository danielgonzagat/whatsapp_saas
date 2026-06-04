import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StepEntrega } from './step-entrega';
import { initialForm } from './types';

describe('StepEntrega', () => {
  it('exposes dispatch time with an accessible name', () => {
    render(
      <StepEntrega form={initialForm} updateForm={vi.fn()} onCarrierToggle={vi.fn()} />,
    );

    expect(screen.getByRole('combobox', { name: /prazo de despacho/i })).toBeTruthy();
  });
});
