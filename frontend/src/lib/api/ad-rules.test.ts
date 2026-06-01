import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mutate } from 'swr';

vi.mock('swr', () => ({
  mutate: vi.fn(),
}));

vi.mock('./core', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from './core';
import { adRulesApi } from './ad-rules';

const apiFetchMock = vi.mocked(apiFetch);
const mutateMock = vi.mocked(mutate);

describe('adRulesApi', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    mutateMock.mockReset();
  });

  it('does not invalidate ad-rule cache when update returns an API error envelope', async () => {
    apiFetchMock.mockResolvedValue({ error: 'Rule update rejected', status: 409 });

    await expect(adRulesApi.update('rule-1', { active: false })).rejects.toThrow(
      'Rule update rejected',
    );
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('invalidates ad-rule cache after a confirmed update', async () => {
    apiFetchMock.mockResolvedValue({
      data: { id: 'rule-1', name: 'CPA guard', active: false },
      status: 200,
    });

    await expect(adRulesApi.update('rule-1', { active: false })).resolves.toEqual({
      data: { id: 'rule-1', name: 'CPA guard', active: false },
      status: 200,
    });
    expect(mutateMock).toHaveBeenCalledTimes(1);
  });
});
