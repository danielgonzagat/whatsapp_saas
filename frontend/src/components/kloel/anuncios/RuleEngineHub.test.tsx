import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import useSWR, { mutate } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('swr', () => ({
  default: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/lib/fetcher', () => ({
  swrFetcher: vi.fn(),
}));

import { apiFetch } from '@/lib/api';

import { RuleEngineHub } from './RuleEngineHub';

const apiFetchMock = vi.mocked(apiFetch);
const mutateMock = vi.mocked(mutate);
const useSWRMock = vi.mocked(useSWR);

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  apiFetchMock.mockReset();
  mutateMock.mockReset();
  useSWRMock.mockReset();
  useSWRMock.mockReturnValue({
    data: [],
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
    isValidating: false,
  });
});

describe('RuleEngineHub', () => {
  it('does not clear the create form or invalidate ad rules when the backend returns an error envelope', async () => {
    const mutateRules = vi.fn();
    useSWRMock.mockReturnValue({
      data: [],
      error: undefined,
      isLoading: false,
      mutate: mutateRules,
      isValidating: false,
    });
    apiFetchMock.mockResolvedValue({ error: 'regra invalida', status: 400 });

    render(<RuleEngineHub />);

    fireEvent.click(screen.getByRole('button', { name: '+ Criar nova regra' }));
    fireEvent.change(screen.getByLabelText('Condicao da nova regra (IF)'), {
      target: { value: 'ROAS < 1.0' },
    });
    fireEvent.change(screen.getByLabelText('Acao da nova regra (THEN)'), {
      target: { value: 'Pausar campanha' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Criar Regra' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('regra invalida'));
    expect((screen.getByLabelText('Condicao da nova regra (IF)') as HTMLInputElement).value).toBe(
      'ROAS < 1.0',
    );
    expect((screen.getByLabelText('Acao da nova regra (THEN)') as HTMLInputElement).value).toBe(
      'Pausar campanha',
    );
    expect(mutateRules).not.toHaveBeenCalled();
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('clears the create form and invalidates ad rules after a confirmed backend mutation', async () => {
    const mutateRules = vi.fn();
    useSWRMock.mockReturnValue({
      data: [],
      error: undefined,
      isLoading: false,
      mutate: mutateRules,
      isValidating: false,
    });
    apiFetchMock.mockResolvedValue({ data: { id: 'rule-1' }, status: 201 });

    render(<RuleEngineHub />);

    fireEvent.click(screen.getByRole('button', { name: '+ Criar nova regra' }));
    fireEvent.change(screen.getByLabelText('Condicao da nova regra (IF)'), {
      target: { value: 'ROAS < 1.0' },
    });
    fireEvent.change(screen.getByLabelText('Acao da nova regra (THEN)'), {
      target: { value: 'Pausar campanha' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Criar Regra' }));

    await waitFor(() => expect(mutateRules).toHaveBeenCalledTimes(1));
    expect(mutateMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Condicao da nova regra (IF)')).toBeNull();
  });
});
