'use client';

import type { CSSProperties } from 'react';

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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width,
          height,
        }}
      >
        {Array.from({ length: 3 }).map((_, index) => (
          <span
            key={index}
            style={{
              width: 6,
              height: 6,
              borderRadius: '999px',
              background: '#E85D30',
              opacity: 0.3 + index * 0.2,
              animation: `kloel-loader-pulse 1.1s ${index * 0.14}s ease-in-out infinite`,
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes kloel-loader-pulse {
          0%, 100% { transform: scale(0.9); opacity: 0.28; }
          50% { transform: scale(1.15); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
