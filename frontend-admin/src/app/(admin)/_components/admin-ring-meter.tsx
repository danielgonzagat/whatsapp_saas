'use client';

export function AdminRingMeter({
  percent,
  color,
  size = 48,
}: {
  percent: number;
  color: string;
  size?: number;
}) {
  const stroke = 3;
  const radius = size / 2 - (stroke / 2 + 1);
  const circumference = 2 * Math.PI * radius;
  const normalized = Math.max(0, Math.min(100, Number(percent || 0)));
  const dashoffset = circumference - (normalized / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      style={{ transform: 'rotate(-90deg)', display: 'block', overflow: 'visible' }}
      aria-hidden="true"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--app-border-primary)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={dashoffset}
        strokeLinecap="round"
      />
    </svg>
  );
}
