'use client';

import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

/**
 * Returns `false` during server render and the first client render, then
 * `true` once mounted on the client. Backed by `useSyncExternalStore` so it
 * never calls setState inside an effect, avoiding cascading-render lint
 * violations while remaining SSR/hydration safe.
 */
export function useClientMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
