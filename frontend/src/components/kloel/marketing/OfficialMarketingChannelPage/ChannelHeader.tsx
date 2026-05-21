import { KLOEL_THEME } from '@/lib/kloel-theme';

interface Props {
  label: string;
  summary: string;
  connected: boolean | undefined;
  badgeStatus: string;
}

export function ChannelHeader({ label, summary, connected, badgeStatus }: Props) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 'clamp(28px, 5vw, 44px)', lineHeight: 1.05 }}>
          {label}
        </h1>
        <p style={{ color: KLOEL_THEME.textSecondary, lineHeight: 1.7, maxWidth: 620 }}>
          {summary}
        </p>
      </div>
      <span
        style={{
          height: 28,
          borderRadius: 6,
          padding: '5px 10px',
          color: connected ? KLOEL_THEME.success : KLOEL_THEME.error,
          background: connected ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.12)',
          fontSize: 12,
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {badgeStatus}
      </span>
    </div>
  );
}
