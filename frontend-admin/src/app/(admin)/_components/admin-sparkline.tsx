'use client';

import { useMemo } from 'react';

export function AdminSparkline({
  data,
  color = 'var(--app-accent)',
  width = 84,
  height = 30,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  const points = useMemo(() => {
    if (!data.length) {
      return '';
    }
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    return data
      .map((value, index) => {
        const x = data.length === 1 ? width / 2 : (index / (data.length - 1)) * width;
        const y = height - ((value - min) / range) * (height - 6) - 3;
        return `${x},${y}`;
      })
      .join(' ');
  }, [data, height, width]);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
