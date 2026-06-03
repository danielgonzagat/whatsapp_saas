import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCoprodState } from './ProductNerveCenterComissaoTab.coprod.hooks';

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

describe('useCoprodState', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    showToast.mockReset();
  });

  it('surfaces malformed commission lists instead of silently showing no coproducers', async () => {
    apiFetch.mockResolvedValueOnce({ data: { commissions: [] }, status: 200 });

    const { result } = renderHook(() => useCoprodState('prod-1'));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Invalid product commissions payload', 'error');
    });
    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('surfaces backend create errors instead of showing a false success toast', async () => {
    apiFetch
      .mockResolvedValueOnce({ data: [], status: 200 })
      .mockResolvedValueOnce({ error: 'Comissao duplicada', status: 409 });

    const { result } = renderHook(() => useCoprodState('prod-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.setForm({
        role: 'COPRODUCER',
        percentage: '12',
        agentName: 'Ana',
        agentEmail: 'ana@example.com',
      });
    });

    await act(async () => {
      await result.current.handleCreate();
    });

    expect(showToast).toHaveBeenCalledWith('Comissao duplicada', 'error');
    expect(showToast).not.toHaveBeenCalledWith('Convite do coprodutor enviado', 'success');
  });

  it('surfaces backend delete errors instead of showing a false removal toast', async () => {
    apiFetch
      .mockResolvedValueOnce({ data: [], status: 200 })
      .mockResolvedValueOnce({ error: 'Comissao nao encontrada', status: 404 });

    const { result } = renderHook(() => useCoprodState('prod-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.setDeleteTarget({ id: 'commission-1', agentName: 'Ana' });
    });

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(showToast).toHaveBeenCalledWith('Comissao nao encontrada', 'error');
    expect(showToast).not.toHaveBeenCalledWith('Coprodutor removido', 'success');
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });
});
