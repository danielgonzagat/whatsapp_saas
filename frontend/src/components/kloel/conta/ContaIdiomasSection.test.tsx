import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import IdiomasSection from './ContaIdiomasSection';

describe('IdiomasSection', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('persists the selected language and exposes the active option semantically', () => {
    render(<IdiomasSection />);

    const portugueseOption = screen.getByRole('button', { name: /br portugues/i });
    expect(portugueseOption.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(portugueseOption);

    expect(localStorage.getItem('kloel:language')).toBe('pt-BR');
    expect(portugueseOption.getAttribute('aria-pressed')).toBe('true');
  });
});
