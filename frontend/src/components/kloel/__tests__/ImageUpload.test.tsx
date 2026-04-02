import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageUpload } from '@/components/kloel/FormExtras';
import { apiFetch } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

class MockFileReader {
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
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mockedApiFetch.mockReset();
    sessionStorage.clear();
    vi.stubGlobal('FileReader', MockFileReader as unknown as typeof FileReader);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it('keeps the local preview visible after the remote upload URL arrives', async () => {
    const onChange = vi.fn();

    mockedApiFetch.mockResolvedValue({
      data: {
        url: 'https://cdn.kloel.test/product-image.png',
      },
    } as never);

    await act(async () => {
      root.render(
        <ImageUpload
          value=""
          onChange={onChange}
          label="Foto do produto"
          previewStorageKey="kloel_test_preview"
        />,
      );
    });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['preview'], 'preview.png', { type: 'image/png' });

    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [file],
    });

    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith('https://cdn.kloel.test/product-image.png');

    const img = container.querySelector('img');

    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('data:image/png;base64,LOCAL_PREVIEW');
    expect(sessionStorage.getItem('kloel_test_preview')).toBe(
      'data:image/png;base64,LOCAL_PREVIEW',
    );
  });

  it('restores a persisted preview before falling back to the saved remote URL', async () => {
    sessionStorage.setItem('kloel_test_preview_restore', 'data:image/png;base64,RESTORED_PREVIEW');

    await act(async () => {
      root.render(
        <ImageUpload
          value="https://cdn.kloel.test/saved-image.png"
          onChange={() => {}}
          label="Imagem restaurada"
          previewStorageKey="kloel_test_preview_restore"
        />,
      );
    });

    const img = container.querySelector('img');

    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('data:image/png;base64,RESTORED_PREVIEW');
  });
});
