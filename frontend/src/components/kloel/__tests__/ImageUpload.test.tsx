import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageUpload } from '@/components/kloel/FormExtras';
import { apiFetch } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

class MockFileReader {
  static readonly EMPTY = 0;
  static readonly LOADING = 1;
  static readonly DONE = 2;

  result: string | ArrayBuffer | null = null;
  error: Error | null = null;
  onload: null | (() => void) = null;
  onerror: null | (() => void) = null;

  readAsDataURL() {
    this.result = 'data:image/png;base64,LOCAL_PREVIEW';
    this.onload?.();
  }
}

describe('ImageUpload', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    sessionStorage.clear();
    vi.stubGlobal('FileReader', MockFileReader);
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it('keeps the local preview visible after the remote upload URL arrives', async () => {
    const onChange = vi.fn();

    const uploadResponse = {
      data: {
        url: 'https://cdn.kloel.test/product-image.png',
      },
    };
    mockedApiFetch.mockResolvedValue(uploadResponse as never);

    const { container } = render(
      <ImageUpload
        value=""
        onChange={onChange}
        label="Foto do produto"
        previewStorageKey="kloel_test_preview"
      />,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['preview'], 'preview.png', { type: 'image/png' });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('https://cdn.kloel.test/product-image.png');
    });

    const img = container.querySelector('img');

    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('data:image/png;base64,LOCAL_PREVIEW');
  });

  it('falls back to the saved remote URL when no local preview is active', () => {
    const { container } = render(
      <ImageUpload
        value="https://cdn.kloel.test/saved-image.png"
        onChange={() => {}}
        label="Imagem salva"
        previewStorageKey="kloel_test_preview_restore"
      />,
    );

    const img = container.querySelector('img');

    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://cdn.kloel.test/saved-image.png');
  });
});
