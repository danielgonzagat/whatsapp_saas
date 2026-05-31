'use client';

import dynamic from 'next/dynamic';

// The owner-authored prototype is a browser-only artifact. Load it client-side so
// its window/canvas access never runs during SSR. Visual output is unchanged.
const KloelGraphPrototype = dynamic(() => import('./KloelGraphPrototype'), {
  ssr: false,
});

export function KloelGraphClient() {
  return <KloelGraphPrototype />;
}
