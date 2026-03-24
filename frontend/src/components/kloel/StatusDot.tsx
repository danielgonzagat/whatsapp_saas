'use client';

import { colors } from '@/lib/design-tokens';

const STATUS_COLORS: Record<string, { bg: string; glow: string; label: string }> = {
  APPROVED: { bg: colors.state.success, glow: 'rgba(45, 212, 160, 0.3)', label: 'Aprovado' },
  ACTIVE: { bg: colors.state.success, glow: 'rgba(45, 212, 160, 0.3)', label: 'Ativo' },
  PENDING: { bg: colors.state.warning, glow: 'rgba(224, 168, 78, 0.3)', label: 'Pendente' },
  DRAFT: { bg: colors.text.dust, glow: 'none', label: 'Rascunho' },
  REJECTED: { bg: colors.state.error, glow: 'rgba(224, 82, 82, 0.3)', label: 'Reprovado' },
  BLOCKED: { bg: '#8B0000', glow: 'rgba(139, 0, 0, 0.3)', label: 'Bloqueado' },
  INACTIVE: { bg: colors.text.void, glow: 'none', label: 'Inativo' },
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
          boxShadow: config.glow !== 'none' ? `0 0 6px ${config.glow}` : 'none',
          flexShrink: 0,
        }}
      />
      {showLabel && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: colors.text.moonlight,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {config.label}
        </span>
      )}
    </div>
  );
}
