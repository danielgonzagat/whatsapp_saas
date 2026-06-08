import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { MediaProcessingTab } from './MediaProcessingTab';
import VideoPage from './page';

const swrMutateMock = vi.hoisted(() => vi.fn());

vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: { jobs: [] }, error: null, isLoading: false, mutate: swrMutateMock })),
}));

vi.mock('@/lib/api/client', () => ({
  tokenStorage: { getWorkspaceId: vi.fn(() => 'workspace-1') },
}));

vi.mock('@/lib/api/media', () => ({
  mediaApi: { getJob: vi.fn(), processVideo: vi.fn() },
  videoApi: { create: vi.fn(), getJob: vi.fn() },
  voiceApi: { createProfile: vi.fn(), generate: vi.fn(), listProfiles: vi.fn() },
}));

type MediaProcessingTabProps = ComponentProps<typeof MediaProcessingTab>;


function buildProps(overrides: Partial<MediaProcessingTabProps> = {}): MediaProcessingTabProps {
  return {
    mediaUrl: '',
    mediaPrompt: '',
    mediaType: 'video',
    processingMedia: false,
    mediaJobId: null,
    mediaStatus: null,
    mediaError: null,
    onMediaUrlChange: vi.fn(),
    onMediaPromptChange: vi.fn(),
    onMediaTypeChange: vi.fn(),
    onProcess: vi.fn(),
    onCheck: vi.fn(),
    ...overrides,
  };
}

describe('MediaProcessingTab', () => {
  it('only exposes the video-from-image flow backed by the media endpoint', () => {
    render(<MediaProcessingTab {...buildProps()} />);

    const flow = screen.getByRole('combobox', { name: 'Tipo de processamento de midia' });
    expect(Array.from(flow.querySelectorAll('option')).map((option) => option.textContent)).toEqual([
      'Video a partir de imagem',
    ]);
    expect(screen.getByRole('textbox', { name: 'URL da imagem de entrada' }).getAttribute('name')).toBe(
      'media-processing-url',
    );
  });

  it('does not process when only a prompt is present', () => {
    const onProcess = vi.fn();
    render(
      <MediaProcessingTab
        {...buildProps({ mediaPrompt: 'Crie um video curto', onProcess })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Gerar Video' }));
    expect(onProcess).not.toHaveBeenCalled();
  });

  it('blocks invalid image URLs before hitting the media endpoint', () => {
    const onProcess = vi.fn();
    render(
      <MediaProcessingTab
        {...buildProps({ mediaUrl: 'not-a-valid-url', onProcess })}
      />,
    );

    const button = screen.getByRole('button', { name: 'Gerar Video' }) as HTMLButtonElement;

    expect(button.disabled).toBe(true);
    expect(screen.getByText('Informe uma URL http(s) valida antes de gerar video.')).toBeTruthy();

    fireEvent.click(button);
    expect(onProcess).not.toHaveBeenCalled();
  });

  it('processes when an image URL is present', () => {
    const onProcess = vi.fn();
    render(
      <MediaProcessingTab
        {...buildProps({ mediaUrl: 'https://cdn.kloel.com/input.png', onProcess })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Gerar Video' }));
    expect(onProcess).toHaveBeenCalledTimes(1);
  });
});

describe('VideoPage tabs', () => {
  it('renders the active tab underline with the ember color token', () => {
    render(<VideoPage />);

    const activeTab = screen.getByRole('button', { name: 'Jobs de Video' });

    expect(activeTab.style.borderBottom).toBe('2px solid rgb(232, 93, 48)');
  });
});
