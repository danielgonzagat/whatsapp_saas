import { useEffect, useState } from 'react';

// Pure helpers extracted from KloelChatComposerParts.tsx to reduce the
// host component's cyclomatic complexity. Behaviour is identical to the
// original inline implementation.

/**
 * Tracks whether the viewport is at or below the composer popover's compact
 * breakpoint (780px). Returns the initial server-render value `false` and
 * upgrades on mount so the first paint matches the existing inline logic.
 */
export function useCompactComposerViewport(): boolean {
  const [isCompactViewport, setIsCompactViewport] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(max-width: 780px)');
    const syncViewport = () => setIsCompactViewport(mediaQuery.matches);

    syncViewport();
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncViewport);
      return () => mediaQuery.removeEventListener('change', syncViewport);
    }

    mediaQuery.addListener(syncViewport);
    return () => mediaQuery.removeListener(syncViewport);
  }, []);

  return isCompactViewport;
}
