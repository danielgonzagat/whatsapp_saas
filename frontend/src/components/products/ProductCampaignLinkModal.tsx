'use client';
import { kloelT } from '@/lib/i18n/t';
import { MONO, type Campaign, SORA, V } from './ProductCampaignsTab.constants';

export function ProductCampaignLinkModal({
  linkModal,
  copied,
  onCopy,
  onClose,
}: {
  linkModal: Campaign | null;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
  onClose: () => void;
}) {
  if (!linkModal) {
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
          {kloelT(`Links -`)} {linkModal.name}
        </h3>
        {linkModal.pixelId && (
          <div style={{ marginBottom: 12 }}>
            <span
              style={{
                display: 'block',
                fontSize: 10,
                fontWeight: 600,
                color: V.t3,
                letterSpacing: '.08em',
                textTransform: 'uppercase' as const,
                marginBottom: 6,
              }}
            >
              {kloelT(`Pixel ID`)}
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <code
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: V.e,
                  borderRadius: 6,
                  color: V.t2,
                  fontSize: 11,
                  fontFamily: MONO,
                }}
              >
                {linkModal.pixelId}
              </code>
              <button
                type="button"
                onClick={() => onCopy(linkModal.pixelId || '', `pixel-${linkModal.id}`)}
                style={{
                  padding: '6px 10px',
                  background: V.em,
                  border: 'none',
                  borderRadius: 4,
                  color: V.ta,
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {copied === `pixel-${linkModal.id}` ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          </div>
        )}
        <div style={{ marginBottom: 12 }}>
          <span
            style={{
              display: 'block',
              fontSize: 10,
              fontWeight: 600,
              color: V.t3,
              letterSpacing: '.08em',
              textTransform: 'uppercase' as const,
              marginBottom: 6,
            }}
          >
            {kloelT(`Campaign ID`)}
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <code
              style={{
                flex: 1,
                padding: '8px 12px',
                background: V.e,
                borderRadius: 6,
                color: V.t2,
                fontSize: 11,
                fontFamily: MONO,
              }}
            >
              {linkModal.id}
            </code>
            <button
              type="button"
              onClick={() => onCopy(linkModal.id, `id-${linkModal.id}`)}
              style={{
                padding: '6px 10px',
                background: V.em,
                border: 'none',
                borderRadius: 4,
                color: V.ta,
                fontSize: 10,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {copied === `id-${linkModal.id}` ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
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
            {kloelT(`Fechar`)}
          </button>
        </div>
      </div>
    </div>
  );
}
