'use client';

import type { CSSProperties } from 'react';
import { Heartbeat } from '@/components/kloel/landing/Heartbeat';

interface PulseLoaderProps {
  width?: number | string;
  height?: number | string;
  style?: CSSProperties;
}

export function PulseLoader({ width = 88, height = 18, style }: PulseLoaderProps) {
  return (
    <div
      aria-hidden="true"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        ...style,
      }}
    >
      <Heartbeat mini width={width} height={height} />
    </div>
  );
}
