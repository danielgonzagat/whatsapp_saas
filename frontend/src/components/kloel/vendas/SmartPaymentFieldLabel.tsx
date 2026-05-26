import React from 'react';
import { SORA } from './utils';

/**
 * Uppercase label primitive shared by SmartPaymentForm and SmartPaymentResult.
 *
 * Identical JSX/styles, byte-for-byte. Extracting it ensures both screens
 * stay visually identical when the label spec evolves.
 */
export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        color: 'var(--app-text-secondary)',
        fontFamily: SORA,
        textTransform: 'uppercase',
        letterSpacing: '.06em',
        display: 'block',
        marginBottom: 6,
      }}
    >
      {children}
    </span>
  );
}
