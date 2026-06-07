import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import MarketplaceFilters from './MarketplaceFilters';

describe('MarketplaceFilters', () => {
  it('announces the active category filter with pressed button state', () => {
    const setCatFilter = vi.fn();

    render(
      <MarketplaceFilters
        search=""
        setSearch={vi.fn()}
        categories={['Cursos Online', 'E-books']}
        catFilter="E-books"
        setCatFilter={setCatFilter}
      />,
    );

    expect(screen.getByRole('button', { name: 'Todos' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(screen.getByRole('button', { name: 'E-books' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Cursos Online' }).getAttribute('aria-pressed')).toBe(
      'false',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    expect(setCatFilter).toHaveBeenCalledWith(null);
  });
});
