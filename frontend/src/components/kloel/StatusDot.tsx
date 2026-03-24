'use client';

const STATUS_COLORS: Record<string, { bg: string; label: string }> = {
  APPROVED: { bg: '#E0DDD8', label: 'Aprovado' },
  ACTIVE: { bg: '#E0DDD8', label: 'Ativo' },
  PENDING: { bg: '#6E6E73', label: 'Pendente' },
  DRAFT: { bg: '#3A3A3F', label: 'Rascunho' },
  REJECTED: { bg: '#E85D30', label: 'Reprovado' },
  BLOCKED: { bg: '#E85D30', label: 'Bloqueado' },
  INACTIVE: { bg: '#3A3A3F', label: 'Inativo' },
};

interface StatusDotProps {
  status: string;
  showLabel?: boolean;
  size?: number;
}

export function StatusDot({ status, showLabel = true, size = 8 }: StatusDotProps) {
  const config = STATUS_COLORS[status?.toUpperCase()] || STATUS_COLORS.DRAFT;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: config.bg,
          boxShadow: 'none',
          flexShrink: 0,
        }}
      />
      {showLabel && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: '#6E6E73',
            fontFamily: "'Sora', sans-serif",
          }}
        >
          {config.label}
        </span>
      )}
    </div>
  );
}
