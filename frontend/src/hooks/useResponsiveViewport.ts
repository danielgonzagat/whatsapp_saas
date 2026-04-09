'use client';

import { useEffect, useState } from 'react';

interface ResponsiveViewportState {
  width: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

function readViewportWidth() {
  if (typeof window === 'undefined') return 0;
  return window.innerWidth || 0;
}

export function useResponsiveViewport(): ResponsiveViewportState {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const sync = () => setWidth(readViewportWidth());

    sync();
    window.addEventListener('resize', sync, { passive: true });
    return () => window.removeEventListener('resize', sync);
  }, []);

  return {
    width,
    isMobile: width > 0 && width < 768,
    isTablet: width >= 768 && width < 1024,
    isDesktop: width >= 1024,
  };
}
