import type { CSSProperties } from 'react';

export function LoadingStrip({
  width = '100%',
  height = 12,
}: {
  width?: string | number;
  height?: string | number;
}) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 6,
        background:
          'linear-gradient(90deg, rgba(25,25,28,0.98) 0%, rgba(41,41,46,1) 50%, rgba(25,25,28,0.98) 100%)',
      }}
    />
  );
}

export function DealCardSkeleton() {
  return (
    <div
      style={{
        background: 'var(--app-bg-secondary)',
        border: '1px solid var(--app-border-primary)',
        borderRadius: 6,
        padding: '10px 12px',
      }}
    >
      <LoadingStrip width="72%" height={12} />
      <div style={{ height: 8 }} />
      <LoadingStrip width="36%" height={10} />
      <div style={{ height: 8 }} />
      <LoadingStrip width="46%" height={9} />
    </div>
  );
}

export function PipelineColumnSkeleton() {
  return (
    <div
      style={{
        minWidth: 280,
        width: 280,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--app-bg-card)',
        border: '1px solid var(--app-border-primary)',
        borderRadius: 8,
        flexShrink: 0,
        maxHeight: '100%',
      }}
    >
      <div
        style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--app-border-subtle)' }}
      >
        <LoadingStrip width="58%" height={11} />
        <div style={{ height: 10 }} />
        <LoadingStrip width="38%" height={10} />
      </div>
      <div style={{ flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <DealCardSkeleton />
        <DealCardSkeleton />
        <LoadingStrip width="100%" height={34} />
      </div>
    </div>
  );
}

export function DetailRow({
  label,
  value,
  mono,
  color,
}: {
  label: string;
  value: string;
  mono?: boolean;
  color?: string;
}) {
  return (
    <div>
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--app-text-tertiary)',
          letterSpacing: '.06em',
          textTransform: 'uppercase',
          fontFamily: "var(--font-sora), 'Sora', sans-serif",
          display: 'block',
          marginBottom: 3,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 13,
          color: color || '#E0DDD8',
          fontFamily: mono
            ? "var(--font-jetbrains), 'JetBrains Mono', monospace"
            : "var(--font-sora), 'Sora', sans-serif",
        }}
      >
        {value}
      </span>
    </div>
  );
}

export const inputStyle: CSSProperties = {
  background: 'var(--app-bg-primary)',
  border: '1px solid var(--app-border-primary)',
  borderRadius: 5,
  color: 'var(--app-text-primary)',
  fontFamily: "var(--font-sora), 'Sora', sans-serif",
  fontSize: 11,
  padding: '7px 10px',
  outline: 'none',
  width: '100%',
};

export const btnStyle: CSSProperties = {
  border: '1px solid var(--app-border-primary)',
  borderRadius: 5,
  fontFamily: "var(--font-sora), 'Sora', sans-serif",
  fontSize: 11,
  fontWeight: 600,
  padding: '7px 12px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
};
