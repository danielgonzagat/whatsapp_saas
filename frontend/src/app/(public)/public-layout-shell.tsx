'use client';
import { colors } from '@/lib/design-tokens';

import { AuthProvider } from '@/components/kloel/auth/auth-provider';
import type React from 'react';

/** Public layout shell. */
export function PublicLayoutShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div
        style={{
          backgroundColor: colors.background.void,
          margin: 0,
          padding: 0,
          minHeight: '100vh',
          fontFamily: "var(--font-sora), 'Sora', sans-serif",
          color: colors.text.silver,
        }}
      >
        {children}
      </div>
    </AuthProvider>
  );
}
