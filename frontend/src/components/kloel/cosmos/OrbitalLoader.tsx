'use client';

import { colors } from '@/lib/design-tokens';

interface OrbitalLoaderProps {
  size?: number;
}

export function OrbitalLoader({ size = 28 }: OrbitalLoaderProps) {
  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
      }}
    >
      {/* Outer ring */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          border: `1.5px solid ${colors.border.void}`,
          borderTopColor: colors.accent.webb,
          animation: 'orbit 2s cubic-bezier(0.37, 0, 0.63, 1) infinite',
        }}
      />
      {/* Inner ring */}
      <div
        style={{
          position: 'absolute',
          inset: 4,
          borderRadius: '50%',
          border: `1.5px solid ${colors.border.void}`,
          borderTopColor: colors.accent.gold,
          animation: 'orbit 3s cubic-bezier(0.37, 0, 0.63, 1) infinite reverse',
        }}
      />
    </div>
  );
}

export default OrbitalLoader;
