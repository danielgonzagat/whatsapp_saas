import { useId } from 'react';

interface MiniChartProps {
  data: number[];
  color?: string;
}

export function MiniChart({ data, color = 'colors.ember.primary' }: MiniChartProps) {
  const idPrefix = useId();
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 40 }}>
      {data.map((value, idx) => (
        <div
          key={`${idPrefix}-bar-${idx}`}
          style={{
            flex: 1,
            height: `${(value / max) * 100}%`,
            minHeight: 2,
            background: idx === data.length - 1 ? color : 'var(--app-accent-light)',
            borderRadius: '4px 2px 0 0',
          }}
        />
      ))}
    </div>
  );
}
