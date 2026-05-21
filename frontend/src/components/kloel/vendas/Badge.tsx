import { MONO } from './utils';

interface BadgeProps {
  status: string;
  config: Record<string, { label: string; color: string }>;
}

export function Badge({ status, config }: BadgeProps) {
  const s = config[status] || { label: status, color: 'var(--app-text-tertiary)' };
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 10,
        fontWeight: 600,
        color: s.color,
        background: `${s.color}12`,
        padding: '3px 8px',
        borderRadius: 4,
        letterSpacing: '.04em',
        textTransform: 'uppercase',
      }}
    >
      {s.label}
    </span>
  );
}
