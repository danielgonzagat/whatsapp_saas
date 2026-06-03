import { renderHook } from '@testing-library/react';
import useSWR, { type KeyedMutator } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('swr', () => ({
  default: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/lib/fetcher', () => ({
  swrFetcher: vi.fn(),
}));

import { apiFetch } from '@/lib/api';

import type { IgPostData } from '@/lib/api/meta';
import { useInstagramMarketing } from './useInstagramMarketing';

const apiFetchMock = vi.mocked(apiFetch);
const useSWRMock = vi.mocked(useSWR);

function makePost(id = 'post-1'): IgPostData {
  return {
    id,
    workspaceId: 'workspace-1',
    igAccountId: 'ig-1',
    igMediaId: 'media-1',
    igContainerId: 'container-1',
    imageUrl: 'https://cdn.kloel.com/post.jpg',
    caption: 'Post real',
    permalink: 'https://www.instagram.com/p/post-1/',
    status: 'PUBLISHED',
    publishedAt: '2026-06-01T00:00:00.000Z',
    createdAt: '2026-06-01T00:00:00.000Z',
  };
}

function createMutatorSpy(): { mutator: KeyedMutator<unknown>; spy: ReturnType<typeof vi.fn> } {
  const spy = vi.fn();
  const mutator: KeyedMutator<unknown> = async () => {
    spy();
    return undefined;
  };
  return { mutator, spy };
}

describe('useInstagramMarketing', () => {
  let refreshPostsSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    apiFetchMock.mockReset();
    useSWRMock.mockReset();
    const refreshPosts = createMutatorSpy();
    refreshPostsSpy = refreshPosts.spy;
    useSWRMock.mockReturnValue({
      data: { posts: [], total: 0 },
      error: undefined,
      isLoading: false,
      mutate: refreshPosts.mutator,
      isValidating: false,
    });
  });

  it('does not refresh posts when Instagram publish returns no confirmed post', async () => {
    apiFetchMock.mockResolvedValue({ data: {}, status: 200 });

    const { result } = renderHook(() => useInstagramMarketing(null));

    await expect(result.current.publishPost('https://cdn.kloel.com/post.jpg', 'Post')).resolves.toEqual({
      error: 'Publicacao do Instagram sem post confirmado.',
    });
    expect(refreshPostsSpy).not.toHaveBeenCalled();
  });

  it('refreshes posts after a confirmed Instagram publish', async () => {
    const post = makePost();
    apiFetchMock.mockResolvedValue({ data: { post, metaResponse: { id: 'media-1' } }, status: 201 });

    const { result } = renderHook(() => useInstagramMarketing(null));

    await expect(result.current.publishPost(post.imageUrl, post.caption ?? undefined)).resolves.toEqual({ post });
    expect(refreshPostsSpy).toHaveBeenCalledTimes(1);
  });

  it('returns backend publish errors without refreshing posts', async () => {
    apiFetchMock.mockResolvedValue({ error: 'Instagram token expired', status: 401 });

    const { result } = renderHook(() => useInstagramMarketing(null));

    await expect(result.current.publishPost('https://cdn.kloel.com/post.jpg')).resolves.toEqual({
      error: 'Instagram token expired',
    });
    expect(refreshPostsSpy).not.toHaveBeenCalled();
  });
});
