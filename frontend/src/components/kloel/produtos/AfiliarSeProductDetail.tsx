'use client';

import React from 'react';
import { SORA, MONO, BG_CARD, BG_ELEVATED, BORDER, GREEN, EMBER, fmt, fmtBRL, NP } from './ProdutosView.shared';
import { IC } from './ProdutosView.icons';
import type { MarketplaceItem } from './ProdutosView.types';

interface Props {
  item: MarketplaceItem;
  onBack: () => void;
  onRefresh: () => void;
  requestingId: string | null;
  copiedAffiliate: boolean;
  onCopyLink: (link: string) => void;
  onRequestAffiliation: (productId: string) => void;
}

const snapLabel: React.CSSProperties = {
  fontFamily: SORA,
  fontSize: 10,
  color: 'var(--app-text-tertiary)',
  textTransform: 'uppercase',
};
const snapValue: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 15,
  fontWeight: 600,
  color: 'var(--app-text-primary)',
};

function generateAiAnalysis(item: MarketplaceItem): string {
  const rating = item.rating || 0;
  const commission = item.commission || 0;
  const price = item.price || 0;
  const commissionPerSale = price * commission / 100;
  const projected = commissionPerSale * 50;
  const rec =
    commission >= 30
      ? 'Altamente recomendado. Este produto apresenta excelente potencial de ganhos.'
      : commission >= 15
        ? 'Boa oportunidade. Comissao competitiva e bom volume de vendas.'
        : 'Oportunidade moderada. Bom para diversificar seu portfolio.';
  return (
    `Produto com ${rating}/5 de avaliacao e ${commission}% de comissao. ` +
    `Ganho estimado de ${fmtBRL(commissionPerSale)} por venda, ` +
    `com projecao de ate ${fmtBRL(projected)} em 90 dias. ${rec}`
  );
}

function statusLabel(status?: string): string {
  if (!status) return 'Pendente';
  const s = status.toLowerCase();
  if (s === 'approved') return 'Aprovado';
  if (s === 'rejected') return 'Rejeitado';
  if (s === 'pending') return 'Pendente';
  return status;
}

export default function AfiliarSeProductDetail({
  item,
  onBack,
  requestingId,
  copiedAffiliate,
  onCopyLink,
  onRequestAffiliation,
}: Props) {
  const commissionPerSale = ((item.price || 0) * (item.commission || 0)) / 100;
  const projected30 = commissionPerSale * 15;
  const projected90 = commissionPerSale * 50;
  const imageUrl = item.thumbnailUrl || item.imageUrl;
  const isPending = item.requestStatus === 'PENDING';
  const isRequesting = requestingId === item.id;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Breadcrumb */}
      <button
        onClick={onBack}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          fontFamily: SORA,
          fontSize: 13,
          color: 'var(--app-text-secondary)',
          textAlign: 'left',
        }}
      >
        &larr; Marketplace / {item.name}
      </button>

      {/* Commission Hero */}
      <div
        style={{
          position: 'relative',
          textAlign: 'center',
          padding: '32px 24px',
          borderRadius: 12,
          overflow: 'hidden',
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -60,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 300,
            height: 120,
            borderRadius: '50%',
            background: `radial-gradient(ellipse, ${GREEN}33 0%, transparent 70%)`,
            filter: 'blur(30px)',
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: SORA, fontSize: 13, color: 'var(--app-text-secondary)', textTransform: 'uppercase' }}>
            Comissao
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 48,
              fontWeight: 700,
              color: GREEN,
              lineHeight: 1.1,
              marginTop: 4,
            }}
          >
            {Math.round(item.commission || 0)}%
          </div>
          <div style={{ fontFamily: SORA, fontSize: 14, color: 'var(--app-text-tertiary)', marginTop: 4 }}>
            {fmtBRL(commissionPerSale)} por venda
          </div>
        </div>
      </div>

      {/* Item Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: 16,
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
        }}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            style={{ width: 84, height: 84, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
          />
        ) : (
          <div
            style={{
              width: 84,
              height: 84,
              borderRadius: 8,
              background: BG_ELEVATED,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              color: 'var(--app-text-tertiary)',
            }}
          >
            {IC.box(32)}
          </div>
        )}
        <div>
          <div style={{ fontFamily: SORA, fontSize: 20, fontWeight: 700, color: 'var(--app-text-primary)' }}>
            {item.name}
          </div>
          <div style={{ fontFamily: SORA, fontSize: 12, color: 'var(--app-text-tertiary)', marginTop: 4 }}>
            por {item.producer || '—'}{item.category ? ` · ${item.category}` : ''}
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
        {[
          ['Preco', fmtBRL(item.price || 0)],
          ['Comissao', `${item.commission || 0}%`],
          ['Vendas', fmt(item.sales || 0)],
          ['Avaliacao', `${(item.rating || 0).toFixed(1)}/5`],
          ['Temperatura', `${item.temperature || 0}`],
        ].map(([label, val]) => (
          <div
            key={label}
            style={{
              background: BG_CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              padding: '10px 8px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <span style={snapLabel}>{label}</span>
            <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 600, color: 'var(--app-text-primary)' }}>
              {val}
            </span>
          </div>
        ))}
      </div>

      {/* Description */}
      {item.description && (
        <div
          style={{
            background: BG_CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            padding: 16,
          }}
        >
          <div style={{ fontFamily: SORA, fontSize: 13, fontWeight: 700, color: 'var(--app-text-primary)', marginBottom: 8 }}>
            Descricao
          </div>
          <div
            style={{
              fontFamily: SORA,
              fontSize: 13,
              color: 'var(--app-text-secondary)',
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
            }}
          >
            {item.description}
          </div>
        </div>
      )}

      {/* Commission Simulator */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[
          ['Projecao 30 dias', projected30, '~15 vendas estimadas'],
          ['Projecao 90 dias', projected90, '~50 vendas estimadas'],
        ].map(([label, value, subtext]) => (
          <div
            key={label}
            style={{
              background: BG_CARD,
              border: `1px solid ${BORDER}`,
              borderLeft: `3px solid ${GREEN}`,
              borderRadius: 8,
              padding: '14px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div style={snapLabel}>{label}</div>
            <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: GREEN }}>
              {fmtBRL(value as number)}
            </div>
            <div style={{ fontFamily: SORA, fontSize: 11, color: 'var(--app-text-tertiary)' }}>
              {subtext}
            </div>
          </div>
        ))}
      </div>

      {/* Materials */}
      {item.materials && item.materials.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {item.materials.map((mat, i) => (
            <div
              key={`${mat}-${i}`}
              style={{
                padding: '4px 12px',
                border: `1px solid ${GREEN}`,
                borderRadius: 20,
                fontFamily: SORA,
                fontSize: 11,
                color: GREEN,
                fontWeight: 600,
              }}
            >
              {mat}
            </div>
          ))}
        </div>
      )}

      {/* Affiliate Link */}
      {item.affiliateLink && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            background: `${GREEN}14`,
            border: `1px solid ${GREEN}33`,
            borderRadius: 8,
            gap: 10,
          }}
        >
          <div
            style={{
              fontFamily: MONO,
              fontSize: 12,
              color: 'var(--app-text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
          >
            {item.affiliateLink}
          </div>
          <button
            onClick={() => onCopyLink(item.affiliateLink!)}
            style={{
              padding: '6px 14px',
              background: GREEN,
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              fontFamily: SORA,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {copiedAffiliate ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
      )}

      {/* AI Analysis */}
      <div
        style={{
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
          borderLeft: `3px solid ${GREEN}`,
          borderRadius: 8,
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          {IC.zap(16)}
          <span style={{ fontFamily: SORA, fontSize: 13, fontWeight: 700, color: 'var(--app-text-primary)' }}>
            Analise IA
          </span>
          <NP w={60} h={14} color={GREEN} />
        </div>
        <div
          style={{
            fontFamily: SORA,
            fontSize: 13,
            color: 'var(--app-text-secondary)',
            lineHeight: 1.7,
          }}
        >
          {generateAiAnalysis(item)}
        </div>
      </div>

      {/* CTA Button */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {item.affiliateLink ? (
          <button
            onClick={() => onCopyLink(item.affiliateLink!)}
            style={{
              padding: '14px 48px',
              background: GREEN,
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              fontFamily: SORA,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {copiedAffiliate ? 'Copiado!' : 'Copiar link de afiliado'}
          </button>
        ) : (
          <button
            onClick={() => onRequestAffiliation(item.id)}
            disabled={isPending || isRequesting}
            style={{
              padding: '14px 48px',
              background: isPending || isRequesting ? BG_ELEVATED : GREEN,
              border: 'none',
              borderRadius: 8,
              color: isPending || isRequesting ? 'var(--app-text-tertiary)' : '#fff',
              fontFamily: SORA,
              fontSize: 14,
              fontWeight: 700,
              cursor: isPending || isRequesting ? 'not-allowed' : 'pointer',
            }}
          >
            {isRequesting ? 'Enviando...' : 'Solicitar afiliacao'}
          </button>
        )}
      </div>

      {/* Performance Snapshot */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
        {[
          ['Aprovacao', statusLabel(item.requestStatus)],
          ['Cookie', `${item.cookieDays || 0} dias`],
          ['Afiliados', fmt(item.totalAffiliates || 0)],
          ['Avaliacoes', fmt(item.totalReviews || 0)],
        ].map(([label, val]) => (
          <div
            key={label}
            style={{
              background: BG_CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              padding: '10px 8px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <span style={snapLabel}>{label}</span>
            <span style={snapValue}>{val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
