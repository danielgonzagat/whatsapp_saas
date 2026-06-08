import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProductUrlForm } from './ProductUrlForm';

describe('ProductUrlForm', () => {
  it('identifies primary URL fields for autofill and accessibility tooling', () => {
    render(
      <ProductUrlForm
        productId="prod-1"
        creating={false}
        fid="legacy-fid"
        onCreate={vi.fn()}
      />,
    );

    const description = screen.getByRole('textbox', { name: /descricao da url/i });
    const pageUrl = screen.getByRole('textbox', { name: /url da pagina/i });
    const privateUrl = screen.getByRole('checkbox', { name: /url privada/i });
    const aiLearning = screen.getByRole('checkbox', { name: /kloel pode aprender/i });
    const chatEnabled = screen.getByRole('checkbox', { name: /integrar chat kloel/i });

    expect(description.getAttribute('id')).toBe('product-url-description');
    expect(description.getAttribute('name')).toBe('productUrlDescription');
    expect(pageUrl.getAttribute('id')).toBe('product-url-page-url');
    expect(pageUrl.getAttribute('name')).toBe('productUrlPageUrl');
    expect(privateUrl.getAttribute('id')).toBe('product-url-private');
    expect(privateUrl.getAttribute('name')).toBe('productUrlIsPrivate');
    expect(aiLearning.getAttribute('id')).toBe('product-url-ai-learning');
    expect(aiLearning.getAttribute('name')).toBe('productUrlAiLearning');
    expect(chatEnabled.getAttribute('id')).toBe('product-url-chat-enabled');
    expect(chatEnabled.getAttribute('name')).toBe('productUrlChatEnabled');
  });
});
