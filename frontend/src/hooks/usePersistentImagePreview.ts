'use client';

import { useEffect, useState } from 'react';

interface UsePersistentImagePreviewOptions {
  storageKey?: string;
}

/** Use persistent image preview. */
export function usePersistentImagePreview(options: UsePersistentImagePreviewOptions = {}) {
  const { storageKey } = options;
  const [previewUrl, setPreviewUrlState] = useState('');
  const [hasLocalPreview, setHasLocalPreview] = useState(false);

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') {
      return;
    }

    const storedPreview = window.sessionStorage.getItem(storageKey);
    if (!storedPreview) {
      return;
    }

    setPreviewUrlState(storedPreview);
    setHasLocalPreview(true);
  }, [storageKey]);

  const setPreviewUrl = (nextPreviewUrl: string) => {
    const normalizedPreviewUrl = nextPreviewUrl || '';
    const nextHasLocalPreview = Boolean(normalizedPreviewUrl);

    setPreviewUrlState(normalizedPreviewUrl);
    setHasLocalPreview(nextHasLocalPreview);

    if (!storageKey || typeof window === 'undefined') {
      return;
    }

    if (nextHasLocalPreview) {
      window.sessionStorage.setItem(storageKey, normalizedPreviewUrl);
      return;
    }

    window.sessionStorage.removeItem(storageKey);
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
