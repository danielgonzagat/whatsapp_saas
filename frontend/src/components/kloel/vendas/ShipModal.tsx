import { kloelT } from '@/lib/i18n/t';
import { useId } from 'react';
import { SORA, MONO } from './utils';

interface ShipModalProps {
  showShipModal: string | null;
  onClose: () => void;
  shipTrackingCode: string;
  onTrackingCodeChange: (v: string) => void;
  onShipOrder: (id: string) => void;
  actionLoading: boolean;
}

export function ShipModal({
  showShipModal,
  onClose,
  shipTrackingCode,
  onTrackingCodeChange,
  onShipOrder,
  actionLoading,
}: ShipModalProps) {
  const fid = useId();
  if (!showShipModal) {
    return null;
  }
  const hasCode = Boolean(shipTrackingCode.trim());
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          (e.currentTarget as HTMLElement).click();
        }
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--app-bg-primary)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          width: 400,
          padding: 24,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            (e.currentTarget as HTMLElement).click();
          }
        }}
      >
        <h3
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--app-text-primary)',
            marginBottom: 16,
            fontFamily: SORA,
          }}
        >
          {kloelT('Informar envio')}
        </h3>
        <label
          style={{
            fontSize: 12,
            color: 'var(--app-text-secondary)',
            display: 'block',
            marginBottom: 6,
            fontFamily: SORA,
          }}
          htmlFor={`${fid}-tracking`}
        >
          {kloelT('Codigo de rastreamento')}
        </label>
        <input
          aria-label="Codigo de rastreamento"
          value={shipTrackingCode}
          onChange={(e) => onTrackingCodeChange(e.target.value)}
          placeholder="BR000000000BR"
          autoFocus
          style={{
            width: '100%',
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: '10px 14px',
            color: 'var(--app-text-primary)',
            fontSize: 14,
            fontFamily: MONO,
            outline: 'none',
            marginBottom: 16,
          }}
          id={`${fid}-tracking`}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: '10px 16px',
              background: 'none',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              color: 'var(--app-text-secondary)',
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: SORA,
            }}
          >
            {kloelT('Cancelar')}
          </button>
          <button
            type="button"
            onClick={() => onShipOrder(showShipModal)}
            disabled={!hasCode || actionLoading}
            style={{
              flex: 1,
              padding: '10px 16px',
              background: hasCode ? 'colors.ember.primary' : 'var(--app-bg-secondary)',
              border: 'none',
              borderRadius: 6,
              color: hasCode ? 'var(--app-text-on-accent)' : 'var(--app-text-placeholder)',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: SORA,
            }}
          >
            {actionLoading ? 'Enviando...' : 'Confirmar envio'}
          </button>
        </div>
      </div>
    </div>
  );
}
