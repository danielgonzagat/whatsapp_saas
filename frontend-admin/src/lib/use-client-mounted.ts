'use client';

import { useSyncExternalStore } from 'react';

function subscribe(_onStoreChange: () => void) {
  return () => undefined;
}

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

/**
 * Hydration-safe client-mount flag.
 *
 * Returns `false` during SSR and the first client render (matching the server
 * markup so React never reports a hydration mismatch), then `true` on the next
 * client tick. Replaces the classic `useState(false)` + `useEffect(() =>
 * setMounted(true))` idiom, which the React Compiler flags as a synchronous
 * setState inside an effect.
 */
export function useClientMounted(): boolean {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
