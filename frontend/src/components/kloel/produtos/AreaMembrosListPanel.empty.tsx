import { kloelT } from '@/lib/i18n/t';
import { SORA, PURPLE, BG_CARD, BORDER } from './ProdutosView.shared';
import { IC } from './ProdutosView.icons';

export function AreaMembrosEmptyState() {
  return (
    <div
      style={{
        padding: '40px 20px',
        textAlign: 'center',
        background: BG_CARD,
        borderRadius: 6,
        border: `1px solid ${BORDER}`,
      }}
    >
      <span style={{ color: PURPLE, display: 'block', marginBottom: 12 }}>{IC.users(32)}</span>
      <div
        style={{
          fontFamily: SORA,
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--app-text-primary)',
          marginBottom: 6,
        }}
      >
        {kloelT('Nenhuma area de membros cadastrada.')}
      </div>
      <div style={{ fontFamily: SORA, fontSize: 13, color: 'var(--app-text-secondary)' }}>
        {kloelT('Crie sua primeira area na aba Editor.')}
      </div>
    </div>
  );
}
