'use client';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import { affiliateApi } from '@/lib/api/affiliate';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import type {
  MarketplaceItem,
  MarketplaceStats,
  AffiliateLink,
  AffiliateProductItem,
} from './ProdutosView.types';
import {
  NP,
  LiveFeed,
  SORA,
  MONO,
  BG_CARD,
  BG_ELEVATED,
  BORDER,
  GREEN,
  fmt,
  fmtBRL,
  timeAgo,
  btnGhost,
  iconBtn,
} from './ProdutosView.shared';
import { IC } from './ProdutosView.icons';

export default function AfiliarSe({
  marketplace,
  earnings,
  marketplaceStats,
  affiliateLinks,
  affiliateProducts,
  onRefresh,
}: {
  marketplace: MarketplaceItem[];
  earnings: number;
  marketplaceStats?: MarketplaceStats;
  affiliateLinks: AffiliateLink[];
  affiliateProducts: AffiliateProductItem[];
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [selectedMarketItem, setSelectedMarketItem] = useState<MarketplaceItem | null>(null);
  const [copiedAffiliate, setCopiedAffiliate] = useState(false);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [_savingId, setSavingId] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }
    },
    [],
  );

  const categories: string[] = [
    ...new Set(
      marketplace
        .map((m) => m.category)
        .filter((cat): cat is string => typeof cat === 'string' && cat.length > 0),
    ),
  ];
  const filteredMarket = marketplace.filter((m) => {
    const matchSearch =
      !search ||
      (m.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (m.category || '').toLowerCase().includes(search.toLowerCase());
    const matchCat = !catFilter || m.category === catFilter;
    return matchSearch && matchCat;
  });
  const approvedLinks = affiliateLinks.filter((link) => link.active !== false);
  const savedProducts = affiliateProducts.filter(
    (item) => item.status === 'SAVED' || item.affiliateProduct?.isSaved,
  );

  const handleRequestAffiliation = async (productId: string) => {
    setRequestingId(productId);
    try {
      await affiliateApi.requestAffiliation(productId);
      await onRefresh();
    } catch (error) {
      console.error(error);
    } finally {
      setRequestingId(null);
    }
  };

  const handleToggleSave = async (productId: string, isSaved: boolean) => {
    setSavingId(productId);
    try {
      if (isSaved) {
        await affiliateApi.unsaveProduct(productId);
      } else {
        await affiliateApi.saveProduct(productId);
      }
      await onRefresh();
    } catch (error) {
      console.error(error);
    } finally {
      setSavingId(null);
    }
  };

  if (selectedMarketItem) {
    const item = selectedMarketItem;
    const commissionPerSale = ((item.price || 0) * (item.commission || 0)) / 100;
    const projected30 = commissionPerSale * 15;
    const projected90 = commissionPerSale * 50;

    return (
      <div style={{ opacity: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <button
            type="button"
            onClick={() => setSelectedMarketItem(null)}
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
            {kloelT(`&larr; Marketplace`)}
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
              {kloelT(`Comissao`)}
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
              {fmtBRL(commissionPerSale)} {kloelT(`por venda`)}
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
                por {item.producer} {kloelT(`&middot;`)} {item.category}
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
            {kloelT(`Descricao`)}
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
              {kloelT(`Projecao 30 dias`)}
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 28,
                fontWeight: 700,
                color: GREEN,
                marginTop: 8,
              }}
            >
              {fmtBRL(projected30)}
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 11,
                color: 'var(--app-text-secondary)',
                marginTop: 4,
              }}
            >
              {kloelT(`~15 vendas estimadas`)}
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
              {kloelT(`Projecao 90 dias`)}
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 28,
                fontWeight: 700,
                color: GREEN,
                marginTop: 8,
              }}
            >
              {fmtBRL(projected90)}
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 11,
                color: 'var(--app-text-secondary)',
                marginTop: 4,
              }}
            >
              {kloelT(`~50 vendas estimadas`)}
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
              {kloelT(`Materiais de Divulgacao`)}
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
              {kloelT(`Seu Link de Afiliado`)}
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
                onClick={() =>
                  navigator.clipboard.writeText(item.affiliateLink || '').then(() => {
                    setCopiedAffiliate(true);
                    if (copiedTimer.current) {
                      clearTimeout(copiedTimer.current);
                    }
                    copiedTimer.current = setTimeout(() => setCopiedAffiliate(false), 2000);
                  })
                }
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
              {kloelT(`Analise IA`)}
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
            {kloelT(`Este produto tem alta taxa de conversao (`)}
            {item.rating || 0}/5) e comissao de {item.commission || 0}
            {kloelT(`%. Com base no seu publico, estimamos ganhos de`)} {fmtBRL(projected30)}{' '}
            {kloelT(`nos primeiros 30 dias. Recomendacao: usar trafego organico no
            Instagram com copy focada em transformacao.`)}
          </div>
        </div>

        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          {item.affiliateLink ? (
            <button
              type="button"
              onClick={() =>
                navigator.clipboard.writeText(item.affiliateLink || '').then(() => {
                  setCopiedAffiliate(true);
                  if (copiedTimer.current) {
                    clearTimeout(copiedTimer.current);
                  }
                  copiedTimer.current = setTimeout(() => setCopiedAffiliate(false), 2000);
                })
              }
              style={{
                padding: '14px 40px',
                background: GREEN,
                color: colors.text.silver,
                border: 'none',
                borderRadius: 6,
                fontFamily: SORA,
                fontSize: 15,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: `0 0 30px ${GREEN}40`,
              }}
            >
              {copiedAffiliate ? 'Link copiado' : 'Copiar link de afiliado'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleRequestAffiliation(item.id)}
              disabled={requestingId === item.id || item.requestStatus === 'PENDING'}
              style={{
                padding: '14px 40px',
                background: item.requestStatus === 'PENDING' ? BG_ELEVATED : GREEN,
                color: colors.text.silver,
                border: 'none',
                borderRadius: 6,
                fontFamily: SORA,
                fontSize: 15,
                fontWeight: 700,
                cursor: item.requestStatus === 'PENDING' ? 'default' : 'pointer',
                boxShadow: item.requestStatus === 'PENDING' ? 'none' : `0 0 30px ${GREEN}40`,
              }}
            >
              {requestingId === item.id
                ? 'Enviando...'
                : item.requestStatus === 'PENDING'
                  ? 'Solicitacao enviada'
                  : 'Solicitar afiliacao'}
            </button>
          )}
        </div>

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
            {kloelT(`Snapshot operacional`)}
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

  return (
    <div style={{ opacity: 1 }}>
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
            {kloelT(`Ganhos Totais`)}
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 80,
              fontWeight: 700,
              color: GREEN,
              letterSpacing: '-0.02em',
            }}
          >
            {fmtBRL(earnings)}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              marginTop: 8,
            }}
          >
            <NP w={40} h={14} color={GREEN} />
            <span style={{ fontFamily: MONO, fontSize: 12, color: GREEN }}>
              {earnings > 0 ? `+${fmtBRL(earnings)} acumulado` : 'Sem ganhos ainda'}
            </span>
          </div>
        </div>
      </div>

      <div style={{ position: 'relative', marginBottom: 16 }}>
        <span
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--app-text-secondary)',
          }}
        >
          {IC.search(16)}
        </span>
        <input
          aria-label="Buscar produtos para se afiliar"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={kloelT(`Buscar produtos para se afiliar...`)}
          style={{
            width: '100%',
            padding: '10px 14px 10px 36px',
            background: BG_CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            color: 'var(--app-text-primary)',
            fontFamily: SORA,
            fontSize: 13,
            outline: 'none',
            boxSizing: 'border-box' as const,
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setCatFilter(null)}
          style={{
            padding: '6px 14px',
            borderRadius: 99,
            border: 'none',
            cursor: 'pointer',
            fontFamily: SORA,
            fontSize: 11,
            fontWeight: 600,
            background: !catFilter ? GREEN : BG_ELEVATED,
            color: !catFilter ? 'var(--app-text-on-accent)' : 'var(--app-text-secondary)',
          }}
        >
          {kloelT(`Todos`)}
        </button>
        {categories.map((cat) => (
          <button
            type="button"
            key={cat}
            onClick={() => setCatFilter(catFilter === cat ? null : cat)}
            style={{
              padding: '6px 14px',
              borderRadius: 99,
              border: 'none',
              cursor: 'pointer',
              fontFamily: SORA,
              fontSize: 11,
              fontWeight: 600,
              background: catFilter === cat ? GREEN : BG_ELEVATED,
              color: catFilter === cat ? 'var(--app-text-on-accent)' : 'var(--app-text-secondary)',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {[
          {
            icon: IC.box,
            label: 'Ganhos',
            value: fmtBRL(earnings),
            sub: approvedLinks.length > 0 ? `${approvedLinks.length} links ativos` : 'sem ganhos',
          },
          {
            icon: IC.trend,
            label: 'Marketplace',
            value: String(marketplaceStats?.totalProducts || marketplace.length),
            sub: 'produtos disponiveis',
          },
          {
            icon: IC.heart,
            label: 'Solicitacoes',
            value: String(affiliateProducts.length),
            sub: `${savedProducts.length} salvos`,
          },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              flex: 1,
              background: BG_CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span style={{ color: GREEN }}>{s.icon(18)}</span>
              <span
                style={{
                  fontFamily: SORA,
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--app-text-tertiary)',
                  letterSpacing: '0.25em',
                  textTransform: 'uppercase' as const,
                }}
              >
                {s.label}
              </span>
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 24,
                fontWeight: 600,
                color: 'var(--app-text-primary)',
              }}
            >
              {s.value}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: GREEN, marginTop: 4 }}>
              {s.sub}
            </div>
          </div>
        ))}
      </div>

      {(approvedLinks.length > 0 || savedProducts.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div
            style={{
              background: BG_CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              padding: 16,
            }}
          >
            <div
              style={{
                fontFamily: SORA,
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--app-text-primary)',
                marginBottom: 10,
              }}
            >
              {kloelT(`Meus links ativos`)}
            </div>
            {approvedLinks.slice(0, 3).map((link) => (
              <div
                key={link.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '10px 0',
                  borderBottom: `1px solid ${BG_ELEVATED}`,
                }}
              >
                <div>
                  <div style={{ fontFamily: SORA, fontSize: 12, color: 'var(--app-text-primary)' }}>
                    {link.affiliateProduct?.name || 'Produto'}
                  </div>
                  <div
                    style={{ fontFamily: MONO, fontSize: 10, color: 'var(--app-text-secondary)' }}
                  >
                    {link.clicks || 0} {kloelT(`cliques ·`)} {link.sales || 0} vendas
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(link.url || link.affiliateProduct?.affiliateLink || '')
                      .catch(() => {})
                  }
                  style={{ ...btnGhost, padding: '6px 10px' }}
                >
                  {kloelT(`Copiar`)}
                </button>
              </div>
            ))}
          </div>
          <div
            style={{
              background: BG_CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              padding: 16,
            }}
          >
            <div
              style={{
                fontFamily: SORA,
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--app-text-primary)',
                marginBottom: 10,
              }}
            >
              {kloelT(`Produtos salvos`)}
            </div>
            {savedProducts.length > 0 ? (
              savedProducts.slice(0, 3).map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '10px 0',
                    borderBottom: `1px solid ${BG_ELEVATED}`,
                  }}
                >
                  <div>
                    <div
                      style={{ fontFamily: SORA, fontSize: 12, color: 'var(--app-text-primary)' }}
                    >
                      {item.affiliateProduct?.name || 'Produto salvo'}
                    </div>
                    <div
                      style={{ fontFamily: MONO, fontSize: 10, color: 'var(--app-text-secondary)' }}
                    >
                      {item.status || 'SAVED'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleSave(item.affiliateProductId || item.id, true)}
                    style={{ ...btnGhost, padding: '6px 10px' }}
                  >
                    {kloelT(`Remover`)}
                  </button>
                </div>
              ))
            ) : (
              <div style={{ fontFamily: SORA, fontSize: 12, color: 'var(--app-text-secondary)' }}>
                {kloelT(`Salve produtos do marketplace para analisar depois.`)}
              </div>
            )}
          </div>
        </div>
      )}

      <div
        style={{
          fontFamily: SORA,
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--app-text-tertiary)',
          marginBottom: 10,
          letterSpacing: '0.25em',
          textTransform: 'uppercase' as const,
        }}
      >
        {kloelT(`Marketplace (`)}
        {filteredMarket.length} {kloelT(`produtos)`)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filteredMarket.length === 0 && (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              background: BG_CARD,
              borderRadius: 6,
              border: `1px solid ${BORDER}`,
            }}
          >
            <span style={{ color: GREEN, display: 'block', marginBottom: 12 }}>{IC.store(32)}</span>
            <div
              style={{
                fontFamily: SORA,
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--app-text-primary)',
                marginBottom: 6,
              }}
            >
              {kloelT(`Nenhum produto disponivel no marketplace.`)}
            </div>
            <div style={{ fontFamily: SORA, fontSize: 13, color: 'var(--app-text-secondary)' }}>
              {kloelT(`Novos produtos serao exibidos aqui quando estiverem disponiveis.`)}
            </div>
          </div>
        )}
        {filteredMarket.map((m) => (
          <div
            key={m.id}
            onClick={() => setSelectedMarketItem(m)}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '14px 16px 14px 20px',
              background: BG_CARD,
              borderRadius: 6,
              border: `1px solid ${BORDER}`,
              cursor: 'pointer',
              transition: 'border-color 150ms ease',
              overflow: 'hidden',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                (e.currentTarget as HTMLElement).click();
              }
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: 3,
                background: GREEN,
              }}
            />
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 6,
                background: BG_ELEVATED,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {m.thumbnailUrl || m.imageUrl ? (
                <img
                  src={m.thumbnailUrl || m.imageUrl}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }}
                />
              ) : (
                <span style={{ color: GREEN }}>{IC.box(20)}</span>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    fontFamily: SORA,
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--app-text-primary)',
                  }}
                >
                  {m.name}
                </span>
                {(m.temperature || 0) >= 90 && <span>{IC.fire(12)}</span>}
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  color: 'var(--app-text-tertiary)',
                  marginTop: 2,
                }}
              >
                {m.category} {kloelT(`&middot; por`)} {m.producer}
              </div>
            </div>
            <NP w={100} h={24} color={GREEN} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: GREEN }}>
                {m.commission || 0}%
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  color: 'var(--app-text-secondary)',
                  marginTop: 2,
                }}
              >
                {fmtBRL(m.price || 0)}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: 'colors.ember.primary' }}>{IC.star(12)}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--app-text-secondary)' }}>
                {m.rating || 0}
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleSave(m.id, !!m.isSaved);
              }}
              style={{
                ...iconBtn,
                color: m.isSaved ? GREEN : 'var(--app-text-secondary)',
              }}
              title={m.isSaved ? 'Remover dos salvos' : 'Salvar produto'}
            >
              {IC.heart(14)}
            </button>
            <span style={{ color: 'var(--app-text-tertiary)', fontFamily: SORA, fontSize: 16 }}>
              {kloelT(`&rsaquo;`)}
            </span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 20 }}>
        <div
          style={{
            fontFamily: SORA,
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--app-text-tertiary)',
            marginBottom: 10,
            letterSpacing: '0.25em',
            textTransform: 'uppercase' as const,
          }}
        >
          {kloelT(`Vendas Recentes`)}
        </div>
        <LiveFeed
          color={GREEN}
          events={
            approvedLinks.length > 0
              ? approvedLinks.slice(0, 4).map((link) => ({
                  text: `${link.affiliateProduct?.name || 'Produto'} com ${link.clicks || 0} cliques e ${link.sales || 0} vendas.`,
                  time: timeAgo(link.createdAt),
                }))
              : [{ text: 'Aguardando atividade de afiliados...', time: '' }]
          }
        />
      </div>
    </div>
  );
}
