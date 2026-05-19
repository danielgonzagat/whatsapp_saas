'use client';
import { kloelT } from '@/lib/i18n/t';
import { PRODUCT_CAMPAIGNS_COPY, SORA, V } from './ProductCampaignsTab.constants';

export function ProductCampaignCreateModal({
  showNew,
  newName,
  newPixelId,
  creating,
  onNameChange,
  onPixelIdChange,
  onCreate,
  onClose,
}: {
  showNew: boolean;
  newName: string;
  newPixelId: string;
  creating: boolean;
  onNameChange: (v: string) => void;
  onPixelIdChange: (v: string) => void;
  onCreate: () => void;
  onClose: () => void;
}) {
  if (!showNew) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,.7)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
      aria-label={PRODUCT_CAMPAIGNS_COPY.closeModalAria}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: V.s,
          border: `1px solid ${V.b}`,
          borderRadius: 12,
          padding: '24px 28px',
          maxWidth: 480,
          width: '100%',
        }}
      >
        <h3
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: V.t,
            margin: '0 0 16px',
            fontFamily: SORA,
          }}
        >
          {kloelT(`Nova Campanha`)}
        </h3>
        <div style={{ marginBottom: 14 }}>
          <span
            style={{
              display: 'block',
              fontSize: 10,
              fontWeight: 600,
              color: V.t3,
              letterSpacing: '.08em',
              textTransform: 'uppercase' as const,
              marginBottom: 6,
              fontFamily: SORA,
            }}
          >
            {kloelT(`Nome *`)}
          </span>
          <input
            aria-label={PRODUCT_CAMPAIGNS_COPY.campaignNameAria}
            value={newName}
            onChange={(e) => onNameChange(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              background: V.e,
              border: `1px solid ${V.b}`,
              borderRadius: 6,
              color: V.t,
              fontSize: 13,
              fontFamily: SORA,
              outline: 'none',
            }}
          />
        </div>
        <div style={{ marginBottom: 14 }}>
          <span
            style={{
              display: 'block',
              fontSize: 10,
              fontWeight: 600,
              color: V.t3,
              letterSpacing: '.08em',
              textTransform: 'uppercase' as const,
              marginBottom: 6,
              fontFamily: SORA,
            }}
          >
            {kloelT(`Pixel ID (opcional)`)}
          </span>
          <input
            aria-label={PRODUCT_CAMPAIGNS_COPY.pixelIdAria}
            value={newPixelId}
            onChange={(e) => onPixelIdChange(e.target.value)}
            placeholder={PRODUCT_CAMPAIGNS_COPY.pixelIdPlaceholder}
            style={{
              width: '100%',
              padding: '10px 14px',
              background: V.e,
              border: `1px solid ${V.b}`,
              borderRadius: 6,
              color: V.t,
              fontSize: 13,
              fontFamily: SORA,
              outline: 'none',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: 'none',
              border: `1px solid ${V.b}`,
              borderRadius: 6,
              color: V.t2,
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: SORA,
            }}
          >
            {kloelT(`Cancelar`)}
          </button>
          <button
            type="button"
            onClick={onCreate}
            disabled={creating || !newName.trim()}
            style={{
              padding: '8px 16px',
              background: V.em,
              border: 'none',
              borderRadius: 6,
              color: V.ta,
              fontSize: 12,
              fontWeight: 700,
              cursor: creating ? 'not-allowed' : 'pointer',
              fontFamily: SORA,
              opacity: creating || !newName.trim() ? 0.5 : 1,
            }}
          >
            {creating ? 'Criando...' : 'Criar'}
          </button>
        </div>
      </div>
    </div>
  );
}
