'use client';
import { kloelT } from '@/lib/i18n/t';
import { MONO, PRODUCT_CAMPAIGNS_COPY, type Campaign, getCampaignStatusLabel, SORA, V } from './ProductCampaignsTab.constants';

export function ProductCampaignList({
  campaigns,
  onLaunch,
  onPause,
  onShowLinks,
  onDelete,
  deleting,
}: {
  campaigns: Campaign[];
  onLaunch: (id: string) => void;
  onPause: (id: string) => void;
  onShowLinks: (c: Campaign) => void;
  onDelete: (c: Campaign) => void;
  deleting: string | null;
}) {
  if (campaigns.length === 0) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '48px 20px',
          background: V.s,
          border: `1px solid ${V.b}`,
          borderRadius: 6,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: V.em,
            letterSpacing: '.25em',
            textTransform: 'uppercase' as const,
            marginBottom: 12,
          }}
        >
          {kloelT(`SEM CAMPANHAS`)}
        </div>
        <div style={{ fontSize: 14, color: V.t, fontFamily: SORA }}>
          {kloelT(`Crie sua primeira campanha para rastrear conversoes`)}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: V.s,
        border: `1px solid ${V.b}`,
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr 1fr 1.2fr',
          padding: '10px 14px',
          borderBottom: `1px solid ${V.b}`,
          background: V.e,
        }}
      >
        {['Nome', 'Status', 'Enviadas', 'Lidas', 'Acoes'].map((h) => (
          <span
            key={h}
            style={{
              fontSize: 9,
              fontWeight: 600,
              color: V.t3,
              letterSpacing: '.08em',
              textTransform: 'uppercase' as const,
            }}
          >
            {h}
          </span>
        ))}
      </div>
      {campaigns.map((c, i) => {
        const st = getCampaignStatusLabel(c.status);
        return (
          <div
            key={c.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr 1fr 1.2fr',
              padding: '10px 14px',
              borderBottom: i < campaigns.length - 1 ? `1px solid ${V.b}` : 'none',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: 12, color: V.t }}>{c.name}</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: st.color, fontFamily: MONO }}>
              {st.text}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: V.t2, textAlign: 'center' }}>
              {c.sentCount || 0}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: V.t2, textAlign: 'center' }}>
              {c.readCount || 0}
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              {c.status === 'ACTIVE' ? (
                <button
                  type="button"
                  onClick={() => onPause(c.id)}
                  style={{
                    padding: '4px 8px',
                    background: 'none',
                    border: `1px solid ${V.b}`,
                    borderRadius: 4,
                    color: V.t2,
                    fontSize: 10,
                    cursor: 'pointer',
                  }}
                >
                  {kloelT(`Pausar`)}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onLaunch(c.id)}
                  style={{
                    padding: '4px 8px',
                    background: 'none',
                    border: `1px solid ${V.b}`,
                    borderRadius: 4,
                    color: V.g,
                    fontSize: 10,
                    cursor: 'pointer',
                  }}
                >
                  {kloelT(`Lancar`)}
                </button>
              )}
              <button
                type="button"
                onClick={() => onShowLinks(c)}
                style={{
                  padding: '4px 6px',
                  background: 'none',
                  border: `1px solid ${V.b}`,
                  borderRadius: 4,
                  color: V.em,
                  fontSize: 10,
                  cursor: 'pointer',
                }}
              >
                {kloelT(`Links`)}
              </button>
              <button
                type="button"
                onClick={() => onDelete(c)}
                disabled={deleting === c.id}
                style={{
                  padding: '4px 6px',
                  background: 'none',
                  border: `1px solid ${V.b}`,
                  borderRadius: 4,
                  color: V.r,
                  fontSize: 10,
                  cursor: 'pointer',
                  opacity: deleting === c.id ? 0.5 : 1,
                }}
              >
                {deleting === c.id ? '...' : 'X'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
