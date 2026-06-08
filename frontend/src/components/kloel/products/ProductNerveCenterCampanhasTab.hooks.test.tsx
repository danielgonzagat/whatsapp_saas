import { act, renderHook, waitFor } from '@testing-library/react';
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

  it('validates empty campaign names before POSTing', async () => {
    apiFetch.mockResolvedValueOnce({ data: [], status: 200 });

    const { result } = renderHook(() => useCampanhasTab('prod-1'));

    await waitFor(() => {
      expect(result.current.campsLoading).toBe(false);
    });
    await act(async () => {
      await result.current.handleCreateCamp();
    });

    expect(result.current.campError).toBe('Informe o nome da campanha.');
    expect(showToast).toHaveBeenLastCalledWith('Informe o nome da campanha.', 'error');
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith('/products/prod-1/campaigns');
  });

  it('posts normalized campaign payload and clears the form after create', async () => {
    apiFetch
      .mockResolvedValueOnce({ data: [], status: 200 })
      .mockResolvedValueOnce({
        data: { id: 'camp-1', name: 'Auditoria Campanha', status: 'DRAFT' },
        status: 201,
      });

    const { result } = renderHook(() => useCampanhasTab('prod-1'));

    await waitFor(() => {
      expect(result.current.campsLoading).toBe(false);
    });
    act(() => {
      result.current.setCampName(' Auditoria Campanha ');
      result.current.setCampPixel(' PIXEL-123 ');
      result.current.setCampMessage(' Mensagem base ');
    });
    await act(async () => {
      await result.current.handleCreateCamp();
    });

    expect(apiFetch).toHaveBeenLastCalledWith('/products/prod-1/campaigns', {
      method: 'POST',
      body: {
        name: 'Auditoria Campanha',
        pixelId: 'PIXEL-123',
        messageTemplate: 'Mensagem base',
      },
    });
    expect(result.current.camps[0]).toEqual({ id: 'camp-1', name: 'Auditoria Campanha', status: 'DRAFT' });
    expect(result.current.campError).toBe('');
    expect(result.current.campName).toBe('');
    expect(result.current.campPixel).toBe('');
    expect(result.current.campMessage).toBe('');
    expect(showToast).toHaveBeenLastCalledWith('Campanha criada', 'success');
  });

  it('requires explicit confirmation before deleting a campaign', async () => {
    apiFetch
      .mockResolvedValueOnce({
        data: [{ id: 'camp-1', name: 'Auditoria Campanha', status: 'DRAFT' }],
        status: 200,
      })
      .mockResolvedValueOnce({ data: { ok: true }, status: 200 });

    const { result } = renderHook(() => useCampanhasTab('prod-1'));

    await waitFor(() => {
      expect(result.current.campsLoading).toBe(false);
    });
    act(() => {
      result.current.requestDeleteCamp('camp-1');
    });

    expect(result.current.deleteConfirmId).toBe('camp-1');
    expect(apiFetch).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.cancelDeleteCamp();
    });
    expect(result.current.deleteConfirmId).toBeNull();

    act(() => {
      result.current.requestDeleteCamp('camp-1');
    });
    await act(async () => {
      await result.current.confirmDeleteCamp('camp-1');
    });

    expect(apiFetch).toHaveBeenLastCalledWith('/products/prod-1/campaigns/camp-1', {
      method: 'DELETE',
    });
    expect(result.current.camps).toEqual([]);
    expect(result.current.deleteConfirmId).toBeNull();
    expect(showToast).toHaveBeenLastCalledWith('Campanha removida', 'success');
  });
});
