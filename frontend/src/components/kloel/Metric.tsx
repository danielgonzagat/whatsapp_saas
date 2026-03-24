'use client';

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
        borderBottom: '1px solid #19191C',
      }}
    >
      <span
        style={{
          fontFamily: "'Sora', sans-serif",
          fontSize: 13,
          color: '#6E6E73',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 13,
          fontWeight: 600,
          color: color || '#E0DDD8',
        }}
      >
        {value}
      </span>
    </div>
  );
}

export default Metric;
