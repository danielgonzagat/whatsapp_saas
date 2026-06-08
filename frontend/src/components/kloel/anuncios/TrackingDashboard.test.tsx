import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TrackingDashboard } from './TrackingDashboard';

const push = vi.fn();
const writeText = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

describe('TrackingDashboard', () => {
  beforeEach(() => {
    push.mockReset();
    writeText.mockReset();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  it('copies the Kloel pixel snippet with visible feedback', async () => {
    writeText.mockResolvedValue(undefined);

    render(<TrackingDashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Copiar pixel Kloel' }));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("kl('init','KL-SEU_ID_AQUI')"));
    await waitFor(() => expect(screen.queryByText('Snippet copiado.')).not.toBeNull());
  });
});
