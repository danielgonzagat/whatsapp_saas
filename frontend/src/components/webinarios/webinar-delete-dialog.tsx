import { LoaderCircle, Trash2 } from 'lucide-react';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';

interface WebinarDeleteDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}

export default function WebinarDeleteDialog({
  open,
  onCancel,
  onConfirm,
  isDeleting,
}: WebinarDeleteDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div style={backdropStyle} onClick={onCancel}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={dialogPanelStyle}
      >
        <Trash2
          size={32}
          style={{ color: colors.ember.primary, marginBottom: 12 }}
          aria-hidden="true"
        />
        <p style={titleStyle}>{kloelT('Deletar webinario?')}</p>
        <p style={descriptionStyle}>
          {kloelT('Esta acao nao pode ser desfeita.')}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button type="button" onClick={onCancel} style={cancelBtnStyle}>
            {kloelT('Cancelar')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            style={confirmBtnStyle(isDeleting)}
          >
            {isDeleting ? (
              <LoaderCircle
                size={14}
                style={{ animation: 'spin 1s linear infinite' }}
                aria-hidden="true"
              />
            ) : null}
            {isDeleting ? 'Deletando...' : 'Deletar'}
          </button>
        </div>
      </div>
    </div>
  );
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.7)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 9999,
};

const dialogPanelStyle: React.CSSProperties = {
  background: colors.checkout.bg,
  border: '1px solid rgba(232,93,48,0.2)',
  borderRadius: 8,
  padding: 28,
  width: 360,
  maxWidth: '90vw',
  textAlign: 'center',
};

const titleStyle: React.CSSProperties = {
  color: 'var(--app-text-primary)',
  fontSize: 15,
  fontWeight: 600,
  marginBottom: 8,
};

const descriptionStyle: React.CSSProperties = {
  color: colors.text.muted,
  fontSize: 13,
  marginBottom: 24,
};

const cancelBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  color: 'var(--app-text-primary)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 6,
  padding: '8px 20px',
  cursor: 'pointer',
  fontSize: 13,
  fontFamily: 'Sora, sans-serif',
};

function confirmBtnStyle(deleting: boolean): React.CSSProperties {
  return {
    background: colors.ember.primary,
    color: colors.text.silver,
    border: 'none',
    borderRadius: 6,
    padding: '8px 20px',
    cursor: deleting ? 'not-allowed' : 'pointer',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'Sora, sans-serif',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  };
}
