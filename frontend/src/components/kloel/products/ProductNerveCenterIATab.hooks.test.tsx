import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAIConfig } from './ProductNerveCenterIATab.hooks';

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

describe('useAIConfig', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    showToast.mockReset();
  });

  it('does not seed fake objections when the backend has no AI objections', async () => {
    apiFetch.mockResolvedValueOnce({ data: {}, status: 200 });

    const { result } = renderHook(() => useAIConfig('prod-1'));

    await waitFor(() => expect(result.current.aiLoading).toBe(false));

    expect(result.current.objs).toEqual([]);
  });

  it('surfaces backend load errors instead of treating them as empty AI config', async () => {
    apiFetch.mockRejectedValueOnce(new Error('AI config offline'));

    const { result } = renderHook(() => useAIConfig('prod-1'));

    await waitFor(() => expect(result.current.aiLoading).toBe(false));

    expect(result.current.aiCfg).toBeNull();
    expect(showToast).toHaveBeenCalledWith('AI config offline', 'error');
  });

  it('surfaces backend save errors instead of showing a false success toast', async () => {
    apiFetch
      .mockResolvedValueOnce({ data: {}, status: 200 })
      .mockResolvedValueOnce({ error: 'AI config invalid', status: 422 });

    const { result } = renderHook(() => useAIConfig('prod-1'));

    await waitFor(() => expect(result.current.aiLoading).toBe(false));

    await act(async () => {
      await result.current.handleSaveAI();
    });

    expect(result.current.aiSaved).toBe(false);
    expect(showToast).toHaveBeenCalledWith('AI config invalid', 'error');
    expect(showToast).not.toHaveBeenCalledWith('Configuração de IA salva', 'success');
  });
});
