'use client';

import { useSyncExternalStore } from 'react';

/**
 * True after hydration on the client. `useSyncExternalStore` returns the server
 * snapshot during SSR/hydration and then flips to the client snapshot without a
 * mount-effect state write.
 */
const subscribeClientMount = () => () => undefined;
const getClientMountedSnapshot = () => true;
const getServerMountedSnapshot = () => false;

export function useClientMounted(): boolean {
  return useSyncExternalStore(
    subscribeClientMount,
    getClientMountedSnapshot,
    getServerMountedSnapshot,
  );
}
