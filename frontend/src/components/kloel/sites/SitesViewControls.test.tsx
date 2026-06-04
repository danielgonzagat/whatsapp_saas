import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Input } from './SitesViewControls';

describe('SitesViewControls Input', () => {
  it('renders named form metadata from the accessible label', () => {
    render(<Input value="" onChange={vi.fn()} placeholder="Nome do site" />);

    const input = screen.getByRole('textbox', { name: 'Nome do site' });

    expect(input.getAttribute('id')).toBe('site-input-nome-do-site');
    expect(input.getAttribute('name')).toBe('nome-do-site');
  });
});
