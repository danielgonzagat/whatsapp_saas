import { colors } from '@/lib/design-tokens';

const C = {
  elevated: colors.background.elevated,
  border: colors.border.space,
  muted: colors.text.muted,
} as const;

export function LoadingStrip({
  width = '100%',
  height = 12,
  marginBottom = 0,
}: {
  width?: string | number;
  height?: string | number;
  marginBottom?: number;
}) {
  return (
    <div
      style={{
        width,
        height,
        marginBottom,
        borderRadius: 6,
        background:
          'linear-gradient(90deg, rgba(25,25,28,0.98) 0%, rgba(41,41,46,1) 50%, rgba(25,25,28,0.98) 100%)',
      }}
    />
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: C.muted,
          margin: '0 0 10px',
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}
