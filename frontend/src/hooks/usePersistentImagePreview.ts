'use client';

import { useState } from 'react';

interface UsePersistentImagePreviewOptions {
  storageKey?: string;
}

/** Use image preview state while the durable URL is saved by the backend. */
export function usePersistentImagePreview(_options: UsePersistentImagePreviewOptions = {}) {
  const [previewUrl, setPreviewUrlState] = useState('');
  const hasLocalPreview = Boolean(previewUrl);

  const setPreviewUrl = (nextPreviewUrl: string) => {
    setPreviewUrlState(nextPreviewUrl || '');
  };

  const clearPreview = () => {
    setPreviewUrl('');
  };

  return {
    previewUrl,
    hasLocalPreview,
    setPreviewUrl,
    clearPreview,
  };
}
