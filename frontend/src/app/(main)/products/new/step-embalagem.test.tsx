import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StepEmbalagem } from './step-embalagem';
import { initialForm } from './types';

describe('StepEmbalagem', () => {
  it('exposes package type and weight controls with accessible names', () => {
    render(<StepEmbalagem form={initialForm} updateForm={vi.fn()} />);

    expect(screen.getByRole('combobox', { name: /tipo de embalagem/i })).toBeTruthy();
    expect(screen.getByRole('spinbutton', { name: /peso/i })).toBeTruthy();
  });
});
