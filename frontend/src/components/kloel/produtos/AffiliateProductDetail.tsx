'use client';
import { colors } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';
import type { MarketplaceItem } from './ProdutosView.types';
import {
  NP, SORA, MONO, BG_CARD, BG_ELEVATED, BORDER, GREEN, fmt, fmtBRL,
} from './ProdutosView.shared';
import { IC } from './ProdutosView.icons';
import AffiliateApplyDialog from './AffiliateApplyDialog';

const card    = { background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 6 };
const cGreen  = { ...card, borderLeft: `3px solid ${GREEN}` };
const hdr     = (mb = 8) => ({ fontFamily: SORA, fontSize: 13, fontWeight: 600,
  color: 'var(--app-text-primary)', marginBottom: mb });
const label   = { fontFamily: SORA, fontSize: 10, color: 'var(--app-text-tertiary)',
  textTransform: 'uppercase' as const, letterSpacing: '0.25em' };
const body    = { fontFamily: SORA, fontSize: 13,
  color: 'var(--app-text-secondary)', lineHeight: 1.7 };
const mono    = (s: number, w = 400) => ({ fontFamily: MONO, fontSize: s, fontWeight: w });
const mt      = (t: number) => ({ marginTop: t });
const mb      = (b: number) => ({ marginBottom: b });

export default function AffiliateProductDetail({
  item, onBack, requestingId, copiedAffiliate, onRequestAffiliation, onCopyLink,
}: {
  item: MarketplaceItem; onBack: () => void; requestingId: string | null;
  copiedAffiliate: boolean; onRequestAffiliation: (productId: string) => void;
  onCopyLink: (link: string) => void;
}) {
  const cps = ((item.price || 0) * (item.commission || 0)) / 100;
  const p30 = cps * 15;
  const p90 = cps * 50;

  return (
    <div style={{ opacity: 1 }}>
      {/* ── back / breadcrumb ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...mb(20) }}>
        <button type="button" onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none',
            border: 'none', color: GREEN, fontFamily: SORA, fontSize: 13, cursor: 'pointer', padding: 0 }}>
          {kloelT('&larr; Marketplace')}
        </button>
        <span style={{ color: 'var(--app-text-tertiary)' }}>/</span>
        <span style={{ fontFamily: SORA, fontSize: 13, color: 'var(--app-text-primary)' }}>{item.name}</span>
      </div>

      {/* ── commission hero ── */}
      <div style={{ position: 'relative', padding: '32px 0', ...mb(24) }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)', width: 200, height: 80, borderRadius: '50%',
          background: `radial-gradient(ellipse, ${GREEN}40, transparent 70%)`,
          animation: 'glow 3s ease-in-out', pointerEvents: 'none' }} />
        <div style={{ textAlign: 'center', position: 'relative' }}>
          <div style={{ ...label, ...mb(4) }}>{kloelT('Comissao')}</div>
          <div style={{ ...mono(48, 700), color: GREEN, letterSpacing: '-0.02em' }}>{item.commission}%</div>
          <div style={{ ...mono(14), color: 'var(--app-text-primary)', ...mt(4) }}>
            {fmtBRL(cps)} {kloelT('por venda')}
          </div>
        </div>
      </div>

      {/* ── product info card ── */}
      <div style={{ ...card, padding: 24, ...mb(16) }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ width: 84, height: 84, borderRadius: 12, overflow: 'hidden',
            background: BG_ELEVATED, border: `1px solid ${BORDER}`, display: 'flex',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {item.thumbnailUrl || item.imageUrl ? (
              <img src={item.thumbnailUrl || item.imageUrl} alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : <span style={{ color: GREEN }}>{IC.box(28)}</span>}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: SORA, fontSize: 20, fontWeight: 700,
              color: 'var(--app-text-primary)' }}>{item.name}</div>
            <div style={{ fontFamily: MONO, fontSize: 12,
              color: 'var(--app-text-secondary)', ...mt(4) }}>
              por {item.producer} {kloelT('&middot;')} {item.category}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20, ...mt(16) }}>
          {[
            ['Preco', fmtBRL(item.price || 0)],
            ['Comissao', `${item.commission || 0}%`],
            ['Vendas', fmt(item.sales || 0)],
            ['Avaliacao', `${item.rating || 0}/5`],
            ['Temperatura', `${item.temperature || 0}`],
          ].map(([l, v]) => (
            <div key={l}>
              <div style={label}>{l}</div>
              <div style={{ ...mono(16, 600), color: 'var(--app-text-primary)', ...mt(2) }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── description ── */}
      <div style={{ ...card, padding: 20, ...mb(16) }}>
        <div style={hdr()}>{kloelT('Descricao')}</div>
        <div style={body}>{item.description || 'Sem descricao disponivel.'}</div>
      </div>

      {/* ── projections 30 / 90 days ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, ...mb(16) }}>
        {[30, 90].map((days) => {
          const val = days === 30 ? p30 : p90;
          const est = days === 30 ? '~15' : '~50';
          return (
            <div key={days} style={{ ...cGreen, padding: 20 }}>
              <div style={label}>{kloelT(`Projecao ${days} dias`)}</div>
              <div style={{ ...mono(28, 700), color: GREEN, ...mt(8) }}>{fmtBRL(val)}</div>
              <div style={{ ...mono(11), color: 'var(--app-text-secondary)', ...mt(4) }}>
                {kloelT(`${est} vendas estimadas`)}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── materials ── */}
      {item.materials && item.materials.length > 0 && (
        <div style={{ ...card, padding: 20, ...mb(16) }}>
          <div style={hdr(12)}>{kloelT('Materiais de Divulgacao')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {item.materials.map((mat: string) => (
              <span key={mat} style={{ fontFamily: MONO, fontSize: 11, padding: '6px 12px',
                background: `${GREEN}15`, color: GREEN, borderRadius: 6,
                border: `1px solid ${GREEN}30` }}>{mat}</span>
            ))}
          </div>
        </div>
      )}

      {/* ── affiliate link copy ── */}
      {item.affiliateLink && (
        <div style={{ ...card, padding: 20, ...mb(16) }}>
          <div style={hdr(12)}>{kloelT('Seu Link de Afiliado')}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ flex: 1, fontFamily: MONO, fontSize: 13, color: GREEN,
              padding: '10px 14px', background: `${GREEN}10`, borderRadius: 6,
              border: `1px solid ${GREEN}30` }}>{item.affiliateLink}</div>
            <button type="button" onClick={() => onCopyLink(item.affiliateLink || '')}
              style={{ padding: '10px 16px', background: GREEN, color: colors.text.silver,
                border: 'none', borderRadius: 6, fontFamily: SORA, fontSize: 12,
                fontWeight: 600, cursor: 'pointer' }}>
              {copiedAffiliate ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
        </div>
      )}

      {/* ── IA analysis ── */}
      <div style={{ ...cGreen, padding: 20, ...mb(16) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...mb(12) }}>
          <span style={{ color: GREEN }}>{IC.zap(16)}</span>
          <span style={hdr(0)}>{kloelT('Analise IA')}</span>
          <NP w={40} h={14} color={GREEN} />
        </div>
        <div style={{ fontFamily: SORA, fontSize: 12,
          color: 'var(--app-text-secondary)', lineHeight: 1.6 }}>
          {kloelT('Este produto tem alta taxa de conversao (')}{item.rating || 0}
          /5) e comissao de {item.commission || 0}{kloelT('%. Com base no seu publico, estimamos ganhos de')}{' '}
          {fmtBRL(p30)} {kloelT(`nos primeiros 30 dias. Recomendacao: usar trafego organico no
            Instagram com copy focada em transformacao.`)}
        </div>
      </div>

      {/* ── apply dialog ── */}
      <AffiliateApplyDialog
        item={item} requestingId={requestingId} copiedAffiliate={copiedAffiliate}
        onRequestAffiliation={onRequestAffiliation} onCopyLink={onCopyLink}
      />

      {/* ── snapshot metrics ── */}
      <div style={{ ...card, padding: 20 }}>
        <div style={hdr(16)}>{kloelT('Snapshot operacional')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[
            ['Aprovacao', item.requestStatus === 'APPROVED' ? 'Ativa'
              : item.requestStatus === 'PENDING' ? 'Pendente' : 'Nao iniciada'],
            ['Cookie', `${item.cookieDays || 30} dias`],
            ['Afiliados', String(item.totalAffiliates || 0)],
            ['Reviews', `${item.totalReviews || 0}`],
          ].map(([l, v]) => (
            <div key={l} style={{ padding: '12px 14px', background: BG_ELEVATED, borderRadius: 6 }}>
              <div style={{ fontFamily: SORA, fontSize: 10,
                color: 'var(--app-text-tertiary)', ...mb(4) }}>{l}</div>
              <div style={{ ...mono(16, 700), color: 'var(--app-text-primary)' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
