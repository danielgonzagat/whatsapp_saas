'use client';

interface StockCounterProps {
  message?: string; // "Restam apenas {n} unidades"
  count: number;
  accentColor?: string;
}

export default function StockCounter({
  message = 'Restam apenas {n} unidades',
  count,
  accentColor = '#EF4444',
}: StockCounterProps) {
  if (count <= 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 16px',
        borderRadius: 8,
        background: `${accentColor}10`,
        border: `1px solid ${accentColor}25`,
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: accentColor,
          animation: 'pulse 2s ease infinite',
        }}
      />
      <span style={{ fontSize: 13, fontWeight: 600, color: accentColor }}>
        {message.replace('{n}', String(count))}
      </span>
    </div>
  );
}
