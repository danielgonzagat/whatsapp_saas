'use client';

import { colors, typography } from '@/lib/design-tokens';

interface MetricProps {
  label: string;
  value: string | number;
  color?: string;
}

export function Metric({ label, value, color }: MetricProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 0',
        borderBottom: `1px solid ${colors.border.void}`,
      }}
    >
      <span
        style={{
          fontFamily: typography.fontFamily.sans,
          fontSize: 13,
          color: colors.text.moonlight,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: typography.fontFamily.display,
          fontSize: 14,
          fontWeight: 600,
          color: color || colors.text.starlight,
        }}
      >
        {value}
      </span>
    </div>
  );
}

export default Metric;
