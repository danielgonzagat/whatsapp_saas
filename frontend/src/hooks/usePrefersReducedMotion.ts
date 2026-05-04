'use client';

import { useEffect, useState } from 'react';

interface UsePrefersReducedMotionOptions {
  defaultValue?: boolean;
}

function getPrefersReducedMotion(defaultValue: boolean): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return defaultValue;
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function usePrefersReducedMotion({
  defaultValue = false,
}: UsePrefersReducedMotionOptions = {}): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
    getPrefersReducedMotion(defaultValue),
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setPrefersReducedMotion(mediaQuery.matches);

    apply();
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', apply);
      return () => mediaQuery.removeEventListener('change', apply);
    }

    mediaQuery.addListener?.(apply);
    return () => mediaQuery.removeListener?.(apply);
  }, []);

  return prefersReducedMotion;
}
