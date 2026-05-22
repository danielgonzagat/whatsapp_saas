'use client';

export function BrandDivider({ compact = false }: { compact?: boolean }) {
  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: compact ? 120 : 'min(72vw, 600px)',
          height: 1,
          background: 'rgba(232, 93, 48, 0.8)',
          opacity: compact ? 0.7 : 0.45,
        }}
      />
    </div>
  );
}
