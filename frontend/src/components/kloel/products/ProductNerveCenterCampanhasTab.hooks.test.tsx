import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCampanhasTab } from './ProductNerveCenterCampanhasTab.hooks';

const { apiFetch, showToast } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiFetch,
}));

vi.mock('@/components/kloel/ToastProvider', () => ({
  useToast: () => ({ showToast }),
}));

describe('useCampanhasTab', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    showToast.mockReset();
  });

  it('surfaces malformed campaign lists instead of silently showing empty campaigns', async () => {
    apiFetch.mockResolvedValueOnce({ data: { campaigns: [] }, status: 200 });

    const { result } = renderHook(() => useCampanhasTab('prod-1'));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Invalid product campaigns payload', 'error');
    });
    expect(result.current.camps).toEqual([]);
    expect(result.current.campsLoading).toBe(false);
  });
});
