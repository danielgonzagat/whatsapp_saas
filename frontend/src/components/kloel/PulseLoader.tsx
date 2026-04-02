'use client';

import type { CSSProperties } from 'react';
import { KloelMushroomVisual } from './KloelBrand';

interface PulseLoaderProps {
  width?: number | string;
  height?: number | string;
  style?: CSSProperties;
}

export function PulseLoader({ width = 88, height = 18, style }: PulseLoaderProps) {
  const numericHeight = typeof height === 'number' ? height : 18;
  const size = Math.max(24, numericHeight * 1.8);

  return (
    <div
      aria-hidden="true"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width,
        height,
        pointerEvents: 'none',
        ...style,
      }}
    >
      <KloelMushroomVisual size={size} traceColor="#FFFFFF" animated spores="animated" />
    </div>
  );
}
