import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BillingLegacyProvidersSection } from './billing-legacy-providers-section';

describe('BillingLegacyProvidersSection', () => {
  it('links the receiving-account CTA to the real account card anchor', () => {
    render(<BillingLegacyProvidersSection />);

    expect(screen.getByRole('link', { name: /Ver conta de recebimento/i }).getAttribute('href')).toBe(
      '#conta-recebimento',
    );
  });
});
