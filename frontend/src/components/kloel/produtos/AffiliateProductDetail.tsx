'use client';
import { colors } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';
import { useRef } from 'react';
import type React from 'react';
import type { MarketplaceItem } from './ProdutosView.types';
import {
  NP,
  SORA,
  MONO,
  BG_CARD,
  BG_ELEVATED,
  BORDER,
  GREEN,
  fmt,
  fmtBRL,
} from './ProdutosView.shared';
import { IC } from './ProdutosView.icons';
import AffiliateApplyDialog from './AffiliateApplyDialog';

export default function AffiliateProductDetail({
  item,
  onBack,
  requestingId,
  copiedAffiliate,
  onRequestAffiliation,
  onCopyLink,
}: {
  item: MarketplaceItem;
  onBack: () => void;
  requestingId: string | null;
  copiedAffiliate: boolean;
  onRequestAffiliation: (productId: string) => void;
  onCopyLink: (link: string) => void;
}) {
  const commissionPerSale = ((item.price || 0) * (item.commission || 0)) / 100;
  const projected30 = commissionPerSale * 15;
  const projected90 = commissionPerSale * 50;

  return (
    <div style={{ opacity: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: 'none',
            border: 'none',
            color: GREEN,
            fontFamily: SORA,
            fontSize: 13,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {kloelT('&larr; Marketplace')}
        </button>
        <span style={{ color: 'var(--app-text-tertiary)' }}>/</span>
        <span style={{ fontFamily: SORA, fontSize: 13, color: 'var(--app-text-primary)' }}>
          {item.name}
        </span>
      </div>

      <div style={{ position: 'relative', padding: '32px 0', marginBottom: 24 }}>
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 200,
            height: 80,
            borderRadius: '50%',
            background: `radial-gradient(ellipse, ${GREEN}40, transparent 70%)`,
            animation: 'glow 3s ease-in-out',
            pointerEvents: 'none',
          }}
        />
        <div style={{ textAlign: 'center', position: 'relative' }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 10,
              color: 'var(--app-text-tertiary)',
              letterSpacing: '0.25em',
              textTransform: 'uppercase' as const,
              marginBottom: 4,
            }}
          >
            {kloelT('Comissao')}
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 48,
              fontWeight: 700,
              color: GREEN,
              letterSpacing: '-0.02em',
            }}
          >
            {item.commission}%
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 14,
              color: 'var(--app-text-primary)',
              marginTop: 4,
            }}
          >
            {fmtBRL(commissionPerSale)} {kloelT('por venda')}
          </div>
        </div>
      </div>

      <div
        style={{
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          padding: 24,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div
            style={{
              width: 84,
              height: 84,
              borderRadius: 12,
              overflow: 'hidden',
              background: BG_ELEVATED,
              border: `1px solid ${BORDER}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {item.thumbnailUrl || item.imageUrl ? (
              <img
                src={item.thumbnailUrl || item.imageUrl}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span style={{ color: GREEN }}>{IC.box(28)}</span>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontFamily: SORA,
                fontSize: 20,
                fontWeight: 700,
                color: 'var(--app-text-primary)',
              }}
            >
              {item.name}
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 12,
                color: 'var(--app-text-secondary)',
                marginTop: 4,
              }}
            >
              por {item.producer} {kloelT('&middot;')} {item.category}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20, marginTop: 16 }}>
          {[
            { label: 'Preco', value: fmtBRL(item.price || 0) },
            { label: 'Comissao', value: `${item.commission || 0}%` },
            { label: 'Vendas', value: fmt(item.sales || 0) },
            { label: 'Avaliacao', value: `${item.rating || 0}/5` },
            { label: 'Temperatura', value: `${item.temperature || 0}` },
          ].map((d) => (
            <div key={d.label}>
              <div
                style={{
                  fontFamily: SORA,
                  fontSize: 10,
                  color: 'var(--app-text-tertiary)',
                  textTransform: 'uppercase' as const,
                }}
              >
                {d.label}
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 16,
                  fontWeight: 600,
                  color: 'var(--app-text-primary)',
                  marginTop: 2,
                }}
              >
                {d.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          padding: 20,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontFamily: SORA,
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--app-text-primary)',
            marginBottom: 8,
          }}
        >
          {kloelT('Descricao')}
        </div>
        <div
          style={{
            fontFamily: SORA,
            fontSize: 13,
            color: 'var(--app-text-secondary)',
            lineHeight: 1.7,
          }}
        >
          {item.description || 'Sem descricao disponivel.'}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div
          style={{
            background: BG_CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            padding: 20,
            borderLeft: `3px solid ${GREEN}`,
          }}
        >
          <div
            style={{
              fontFamily: SORA,
              fontSize: 10,
              color: 'var(--app-text-tertiary)',
              textTransform: 'uppercase' as const,
              letterSpacing: '0.25em',
            }}
          >
            {kloelT('Projecao 30 dias')}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: 700, color: GREEN, marginTop: 8 }}>
            {fmtBRL(projected30)}
          </div>
          <div
            style={{ fontFamily: MONO, fontSize: 11, color: 'var(--app-text-secondary)', marginTop: 4 }}
          >
            {kloelT('~15 vendas estimadas')}
          </div>
        </div>
        <div
          style={{
            background: BG_CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            padding: 20,
            borderLeft: `3px solid ${GREEN}`,
          }}
        >
          <div
            style={{
              fontFamily: SORA,
              fontSize: 10,
              color: 'var(--app-text-tertiary)',
              textTransform: 'uppercase' as const,
              letterSpacing: '0.25em',
            }}
          >
            {kloelT('Projecao 90 dias')}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: 700, color: GREEN, marginTop: 8 }}>
            {fmtBRL(projected90)}
          </div>
          <div
            style={{ fontFamily: MONO, fontSize: 11, color: 'var(--app-text-secondary)', marginTop: 4 }}
          >
            {kloelT('~50 vendas estimadas')}
          </div>
        </div>
      </div>

      {item.materials && item.materials.length > 0 && (
        <div
          style={{
            background: BG_CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontFamily: SORA,
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--app-text-primary)',
              marginBottom: 12,
            }}
          >
            {kloelT('Materiais de Divulgacao')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {item.materials.map((mat: string) => (
              <span
                key={mat}
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  padding: '6px 12px',
                  background: `${GREEN}15`,
                  color: GREEN,
                  borderRadius: 6,
                  border: `1px solid ${GREEN}30`,
                }}
              >
                {mat}
              </span>
            ))}
          </div>
        </div>
      )}

      {item.affiliateLink && (
        <div
          style={{
            background: BG_CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontFamily: SORA,
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--app-text-primary)',
              marginBottom: 12,
            }}
          >
            {kloelT('Seu Link de Afiliado')}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div
              style={{
                flex: 1,
                fontFamily: MONO,
                fontSize: 13,
                color: GREEN,
                padding: '10px 14px',
                background: `${GREEN}10`,
                borderRadius: 6,
                border: `1px solid ${GREEN}30`,
              }}
            >
              {item.affiliateLink}
            </div>
            <button
              type="button"
              onClick={() => onCopyLink(item.affiliateLink || '')}
              style={{
                padding: '10px 16px',
                background: GREEN,
                color: colors.text.silver,
                border: 'none',
                borderRadius: 6,
                fontFamily: SORA,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {copiedAffiliate ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
        </div>
      )}

      <div
        style={{
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          padding: 20,
          borderLeft: `3px solid ${GREEN}`,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ color: GREEN }}>{IC.zap(16)}</span>
          <span
            style={{
              fontFamily: SORA,
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--app-text-primary)',
            }}
          >
            {kloelT('Analise IA')}
          </span>
          <NP w={40} h={14} color={GREEN} />
        </div>
        <div
          style={{
            fontFamily: SORA,
            fontSize: 12,
            color: 'var(--app-text-secondary)',
            lineHeight: 1.6,
          }}
        >
          {kloelT('Este produto tem alta taxa de conversao (')}
          {item.rating || 0}/5) e comissao de {item.commission || 0}
          {kloelT('%. Com base no seu publico, estimamos ganhos de')} {fmtBRL(projected30)}{' '}
          {kloelT(`nos primeiros 30 dias. Recomendacao: usar trafego organico no
            Instagram com copy focada em transformacao.`)}
        </div>
      </div>

      <AffiliateApplyDialog
        item={item}
        requestingId={requestingId}
        copiedAffiliate={copiedAffiliate}
        onRequestAffiliation={onRequestAffiliation}
        onCopyLink={onCopyLink}
      />

      <div
        style={{
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          padding: 20,
        }}
      >
        <div
          style={{
            fontFamily: SORA,
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--app-text-primary)',
            marginBottom: 16,
          }}
        >
          {kloelT('Snapshot operacional')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[
            {
              label: 'Aprovacao',
              value:
                item.requestStatus === 'APPROVED'
                  ? 'Ativa'
                  : item.requestStatus === 'PENDING'
                    ? 'Pendente'
                    : 'Nao iniciada',
            },
            { label: 'Cookie', value: `${item.cookieDays || 30} dias` },
            { label: 'Afiliados', value: String(item.totalAffiliates || 0) },
            { label: 'Reviews', value: `${item.totalReviews || 0}` },
          ].map((metric) => (
            <div
              key={metric.label}
              style={{ padding: '12px 14px', background: BG_ELEVATED, borderRadius: 6 }}
            >
              <div
                style={{
                  fontFamily: SORA,
                  fontSize: 10,
                  color: 'var(--app-text-tertiary)',
                  marginBottom: 4,
                }}
              >
                {metric.label}
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 16,
                  fontWeight: 700,
                  color: 'var(--app-text-primary)',
                }}
              >
                {metric.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
