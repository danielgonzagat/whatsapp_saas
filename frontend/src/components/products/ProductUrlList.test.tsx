import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProductUrlList } from './ProductUrlList';
import type { ProductUrlItem } from './ProductUrlForm';

const urlItem: ProductUrlItem = {
  id: 'url-1',
  description: 'Pagina de vendas auditoria',
  url: 'https://kloel.test/produto-auditoria-criar',
  isPrivate: false,
  active: true,
  aiLearning: false,
  aiLearnStatus: null,
  chatEnabled: false,
  salesFromUrl: 0,
};

describe('ProductUrlList', () => {
  it('renders only actionable row buttons with accessible names', () => {
    render(<ProductUrlList items={[urlItem]} onDelete={vi.fn()} />);

    const rowButtons = screen.getAllByRole('button');

    expect(rowButtons).toHaveLength(1);
    expect(rowButtons[0]?.getAttribute('aria-label')).toBe('Excluir URL');
  });
});
