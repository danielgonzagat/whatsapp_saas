import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAIConfig } from './ProductNerveCenterIATab.hooks';
import * as aiHooksModule from './ProductNerveCenterIATab.hooks';

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

type AiDraftInput = {
  whobuys: string;
  pains: string;
  promise: string;
  objs: Array<{ id: string; label: string; response: string }>;
  tone: string;
  persist: string;
  msgLimit: string;
  followUp: string;
  autoLink: boolean;
  offerDisc: boolean;
  useUrg: boolean;
};

type AiPayloadResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error: string };

type AiPayloadBuilder = (input: AiDraftInput) => AiPayloadResult;

function getPayloadBuilder(): AiPayloadBuilder {
  const builder = (aiHooksModule as unknown as { buildAIConfigPayload?: AiPayloadBuilder })
    .buildAIConfigPayload;
  expect(typeof builder).toBe('function');
  return builder as AiPayloadBuilder;
}

function baseAiDraft(): AiDraftInput {
  return {
    whobuys: 'Criadores digitais',
    pains: 'Baixa conversao',
    promise: 'Venda previsivel',
    objs: [],
    tone: 'CONSULTIVE',
    persist: '3',
    msgLimit: '10',
    followUp: '2h,24h,72h',
    autoLink: true,
    offerDisc: true,
    useUrg: true,
  };
}

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

  it('builds a normalized AI config payload without UI-only objection ids', () => {
    const result = getPayloadBuilder()({
      ...baseAiDraft(),
      objs: [
        { id: 'draft-empty', label: ' ', response: ' ' },
        { id: 'draft-real', label: ' Preco ', response: ' Parcelamos em ate 12x. ' },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(result.payload.objections).toEqual([
      { label: 'Preco', response: 'Parcelamos em ate 12x.' },
    ]);
    expect(result.payload.persistenceLevel).toBe(3);
    expect(result.payload.messageLimit).toBe(10);
  });

  it('blocks partially filled objections before calling the save API', async () => {
    apiFetch.mockResolvedValueOnce({ data: {}, status: 200 });

    const { result } = renderHook(() => useAIConfig('prod-1'));

    await waitFor(() => expect(result.current.aiLoading).toBe(false));

    act(() => {
      result.current.setObjs([{ id: 'draft-1', label: 'Preco', response: '' }]);
    });

    await act(async () => {
      await result.current.handleSaveAI();
    });

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(result.current.aiSaved).toBe(false);
    expect((result.current as unknown as { aiError?: string }).aiError).toBe(
      'Preencha a objecao e a resposta antes de salvar.',
    );
    expect(showToast).toHaveBeenCalledWith(
      'Preencha a objecao e a resposta antes de salvar.',
      'error',
    );
  });

  it('blocks persistence outside the 1 to 5 range before calling the save API', async () => {
    apiFetch.mockResolvedValueOnce({ data: {}, status: 200 });

    const { result } = renderHook(() => useAIConfig('prod-1'));

    await waitFor(() => expect(result.current.aiLoading).toBe(false));

    act(() => {
      result.current.setPersist('9');
    });

    await act(async () => {
      await result.current.handleSaveAI();
    });

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(result.current.aiSaved).toBe(false);
    expect((result.current as unknown as { aiError?: string }).aiError).toBe(
      'A persistencia precisa ficar entre 1 e 5.',
    );
    expect(showToast).toHaveBeenCalledWith('A persistencia precisa ficar entre 1 e 5.', 'error');
  });
});
