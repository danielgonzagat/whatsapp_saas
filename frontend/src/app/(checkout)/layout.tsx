import type React from 'react';
import { dmSans, playfair } from '../fonts';

/** Checkout layout. */
export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${dmSans.variable} ${playfair.variable}`} style={{ margin: 0, padding: 0 }}>
      {children}
    </div>
  );
}
