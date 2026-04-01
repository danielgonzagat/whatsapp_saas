import { mutate } from 'swr';
import { apiFetch } from '@/lib/api';

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('file_reader_error'));
    reader.readAsDataURL(file);
  });
}

export function extractUploadedMediaUrl(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';

  const result = payload as {
    url?: string;
    avatarUrl?: string;
    data?: {
      url?: string;
      avatarUrl?: string;
    };
  };

  return (
    result.data?.url ||
    result.data?.avatarUrl ||
    result.url ||
    result.avatarUrl ||
    ''
  );
}

export async function uploadGenericMedia(
  file: File,
  options?: { folder?: string },
): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  if (options?.folder) {
    formData.append('folder', options.folder);
  }

  const response = await apiFetch('/kloel/upload-generic', {
    method: 'POST',
    body: formData,
  });
  mutate((key: unknown) => typeof key === 'string' && key.startsWith('/media'));

  return extractUploadedMediaUrl(response);
}
