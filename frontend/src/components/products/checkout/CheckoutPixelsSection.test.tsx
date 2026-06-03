import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type PixelRowData = {
  id: string;
  type: string;
  pixelId: string;
  accessToken?: string;
};

const apiMocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: apiMocks.apiFetch,
}));

vi.mock('swr', () => ({
  mutate: vi.fn(),
}));

vi.mock('./CheckoutPixelRow', () => ({
  PixelRow: ({ pixel, onDelete }: { pixel: PixelRowData; onDelete: () => void }) => (
    <div>
      <span>{pixel.type}</span>
      <span>{pixel.pixelId}</span>
      <button type="button" onClick={onDelete}>
        Remover
      </button>
    </div>
  ),
  PixelAddPanel: () => <div data-testid="pixel-add-panel" />,
}));

import { PixelsSection } from './CheckoutPixelsSection';

const pixel = {
  id: 'pixel-1',
  type: 'META',
  pixelId: 'PIXEL-REAL-123',
  accessToken: 'tok-real',
};

beforeEach(() => {
  apiMocks.apiFetch.mockReset();
});

describe('PixelsSection', () => {
  it('surfaces invalid pixel payloads instead of rendering a fake empty pixel list', async () => {
    apiMocks.apiFetch.mockResolvedValueOnce({ data: { pixels: 'not-a-list' } });

    render(<PixelsSection configId="config-1" planId="plan-1" />);

    await waitFor(() => expect(screen.queryByText('Payload de pixels invalido.')).not.toBeNull());

    expect(screen.queryByText('Nenhum pixel configurado.')).toBeNull();
  });

  it('keeps loaded pixels visible when a post-delete refresh fails', async () => {
    apiMocks.apiFetch
      .mockResolvedValueOnce({ data: { pixels: [pixel] } })
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error('refresh failed'));

    render(<PixelsSection configId="config-1" planId="plan-1" />);

    expect(await screen.findByText('PIXEL-REAL-123')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));

    await waitFor(() => expect(screen.queryByText('refresh failed')).not.toBeNull());

    expect(screen.queryByText('PIXEL-REAL-123')).not.toBeNull();
  });
});
