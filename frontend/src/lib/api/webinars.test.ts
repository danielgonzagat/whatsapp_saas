import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mutate } from 'swr';

vi.mock('swr', () => ({
  mutate: vi.fn(),
}));

vi.mock('./core', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from './core';
import { webinarApi } from './webinars';

const apiFetchMock = vi.mocked(apiFetch);
const mutateMock = vi.mocked(mutate);

describe('webinarApi', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    mutateMock.mockReset();
  });

  it('does not invalidate webinars when update returns an API error envelope', async () => {
    apiFetchMock.mockResolvedValue({ error: 'Webinar update rejected', status: 400 });

    await expect(webinarApi.update('webinar-1', { title: 'Aula' })).rejects.toThrow(
      'Webinar update rejected',
    );
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('invalidates webinars after a confirmed update', async () => {
    apiFetchMock.mockResolvedValue({ data: { id: 'webinar-1', title: 'Aula' }, status: 200 });

    await expect(webinarApi.update('webinar-1', { title: 'Aula' })).resolves.toEqual({
      data: { id: 'webinar-1', title: 'Aula' },
      status: 200,
    });
    expect(mutateMock).toHaveBeenCalledTimes(1);
  });

  it('does not invalidate webinars when remove returns an API error envelope', async () => {
    apiFetchMock.mockResolvedValue({ error: 'Webinar delete rejected', status: 409 });

    await expect(webinarApi.remove('webinar-1')).rejects.toThrow('Webinar delete rejected');
    expect(mutateMock).not.toHaveBeenCalled();
  });
});
