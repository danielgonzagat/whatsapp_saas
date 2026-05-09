'use client';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import { IconActionButton } from '@/components/kloel/products/product-nerve-center.shared';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { useRouter } from 'next/navigation';
import type React from 'react';
import { useEffect, useRef } from 'react';

import type { DisplayProduct } from './ProdutosView.types';
import {
  NP,
  Ticker,
  LiveFeed,
  SORA,
  MONO,
  EMBER,
  BG_CARD,
  BG_ELEVATED,
  BORDER,
  fmt,
  fmtBRL,
  timeAgo,
} from './ProdutosView.shared';
import { IC } from './ProdutosView.icons';

export default function MeusProdutos({
  displayProducts,
  totalRevenue,
  totalSales,
  activeProducts,
  _onDeleteProduct,
  onCreateProduct,
  requestedFeature,
}: {
  displayProducts: DisplayProduct[];
  totalRevenue: number;
  totalSales: number;
  activeProducts: number;
  onDeleteProduct?: (id: string) => void;
  onCreateProduct?: () => void;
  requestedFeature?: string;
}) {
  const router = useRouter();
  const { isMobile } = useResponsiveViewport();
  const flashElRef = useRef<HTMLDivElement>(null);
  const revElRef = useRef<HTMLSpanElement>(null);
  const activePlanCount = displayProducts.reduce(
    (sum, product) => sum + Number(product.activePlansCount || 0),
    0,
  );
  const memberAreaCount = displayProducts.reduce(
    (sum, product) => sum + Number(product.memberAreasCount || 0),
    0,
  );
  const affiliateCount = displayProducts.reduce(
    (sum, product) => sum + Number(product.affiliateCount || 0),
    0,
  );
  const productEvents =
    displayProducts.length > 0
      ? displayProducts.slice(0, 4).map((product) => ({
          text:
            (product.totalSales ?? 0) > 0
              ? `${product.name} somou ${product.totalSales} vendas aprovadas.`
              : `${product.name} está pronto para receber tráfego e checkout.`,
          time: timeAgo(product.updatedAt || product.createdAt),
        }))
      : [{ text: 'Aguardando criação do primeiro produto.', time: '' }];

  const displayRevRef = useRef(totalRevenue);
  useEffect(() => {
    displayRevRef.current = totalRevenue;
    if (revElRef.current) {
      revElRef.current.textContent = fmtBRL(totalRevenue);
    }
  }, [totalRevenue]);

  const maxRevenue = Math.max(...displayProducts.map((p) => p.revenue || 0), 1);

  return (
    <div style={{ opacity: 1 }}>
      <div
        style={{
          position: 'relative',
          padding: isMobile ? '8px 0 24px' : '32px 0',
          marginBottom: 24,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: isMobile ? 150 : 200,
            height: isMobile ? 64 : 80,
            borderRadius: '50%',
            background: `radial-gradient(ellipse, ${EMBER}40, transparent 70%)`,
            animation: 'glow 3s ease-in-out',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: isMobile ? 16 : 0,
            textAlign: 'center',
            position: 'relative',
          }}
        >
          {!isMobile && (
            <button
              type="button"
              onClick={onCreateProduct}
              style={{
                position: 'absolute',
                right: 0,
                top: '50%',
                transform: 'translateY(-50%)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 20px',
                background: EMBER,
                border: 'none',
                borderRadius: 10,
                color: colors.text.silver,
                fontFamily: SORA,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                zIndex: 2,
                boxShadow: '0 18px 32px rgba(232,93,48,0.18)',
              }}
            >
              <span style={{ color: colors.text.silver }}>{IC.plus(16)}</span> {kloelT(`Novo produto`)}
            </button>
          )}
          <div>
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
              {kloelT(`RECEITA TOTAL DOS SEUS PRODUTOS`)}
            </div>
            <div
              ref={flashElRef}
              style={{
                fontFamily: MONO,
                fontSize: isMobile ? 34 : 80,
                fontWeight: 700,
                color: EMBER,
                letterSpacing: '-0.02em',
                textShadow: '0 0 20px rgba(232,93,48,0.3)',
                transition: 'text-shadow .3s',
                lineHeight: 1,
                wordBreak: 'break-word',
              }}
            >
              <span ref={revElRef}>{fmtBRL(totalRevenue)}</span>
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
              <NP w={40} h={14} color={EMBER} />
              <span style={{ fontFamily: MONO, fontSize: isMobile ? 11 : 12, color: EMBER }}>
                {activeProducts > 0
                  ? `${activeProducts}/${displayProducts.length} ativos`
                  : 'Ative seu primeiro produto'}
              </span>
            </div>
          </div>
          {isMobile && (
            <button
              type="button"
              onClick={onCreateProduct}
              style={{
                width: '100%',
                maxWidth: 360,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '12px 18px',
                background: EMBER,
                border: 'none',
                borderRadius: 12,
                color: colors.text.silver,
                fontFamily: SORA,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 18px 32px rgba(232,93,48,0.16)',
              }}
            >
              <span style={{ color: colors.text.silver }}>{IC.plus(16)}</span> {kloelT(`Novo produto`)}
            </button>
          )}
        </div>
      </div>

      <Ticker
        items={
          displayProducts.length > 0
            ? displayProducts.map((p) =>
                p.hasPlanPricing
                  ? `${p.name} · ${p.priceLabel}`
                  : `${p.name} · sem planos configurados`,
              )
            : ['Aguardando vendas...']
        }
        color={EMBER}
        duration="22s"
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '20px 0' }}>
        {displayProducts.length === 0 && (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              background: BG_CARD,
              borderRadius: 6,
              border: `1px solid ${BORDER}`,
            }}
          >
            <span style={{ color: EMBER, display: 'block', marginBottom: 12 }}>{IC.box(32)}</span>
            <div
              style={{
                fontFamily: SORA,
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--app-text-primary)',
                marginBottom: 6,
              }}
            >
              {kloelT(`Nenhum produto cadastrado.`)}
            </div>
            <div
              style={{
                fontFamily: SORA,
                fontSize: 13,
                color: 'var(--app-text-secondary)',
                marginBottom: 16,
              }}
            >
              {requestedFeature
                ? 'Crie seu primeiro produto para liberar esta configuracao operacional.'
                : 'Crie seu primeiro produto para comecar a vender.'}
            </div>
            <button
              type="button"
              onClick={onCreateProduct}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 24px',
                background: EMBER,
                border: 'none',
                borderRadius: 6,
                color: colors.text.silver,
                fontFamily: SORA,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <span style={{ color: colors.text.silver }}>{IC.plus(16)}</span>
              {requestedFeature ? 'Criar produto e continuar' : 'Criar produto'}
            </button>
          </div>
        )}
        {displayProducts.map((p) => {
          const statusColor =
            p.status === 'active'
              ? EMBER
              : p.status === 'pending'
                ? 'var(--app-text-secondary)'
                : 'var(--app-text-placeholder)';
          const statusLabel =
            p.status === 'active' ? 'Ativo' : p.status === 'pending' ? 'Em analise' : 'Rascunho';
          const planCountLabel =
            p.activePlansCount > 0
              ? `${p.activePlansCount} ${p.activePlansCount === 1 ? 'plano ativo' : 'planos ativos'}`
              : p.plansCount > 0
                ? `${p.plansCount} ${p.plansCount === 1 ? 'plano' : 'planos'}`
                : 'Sem planos';
          const mediaSize = isMobile ? 64 : 56;
          return (
            <div
              key={p.id}
              style={{
                position: 'relative',
                padding: isMobile ? '16px' : '14px 16px',
                background: BG_CARD,
                borderRadius: 12,
                border: `1px solid ${BORDER}`,
                overflow: 'visible',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile
                    ? `${mediaSize}px minmax(0, 1fr)`
                    : `${mediaSize}px minmax(0, 1fr) auto`,
                  columnGap: isMobile ? 12 : 16,
                  rowGap: isMobile ? 10 : 0,
                  alignItems: 'stretch',
                  width: '100%',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 10,
                    gridRow: isMobile ? '1 / span 3' : '1 / span 2',
                  }}
                >
                  <div
                    style={{
                      width: mediaSize,
                      height: mediaSize,
                      borderRadius: 12,
                      background: BG_ELEVATED,
                      border: `1px solid ${BORDER}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 6,
                      flexShrink: 0,
                    }}
                  >
                    {p.imageUrl ? (
                      <img
                        src={p.imageUrl}
                        alt=""
                        style={{
                          maxWidth: '100%',
                          maxHeight: '100%',
                          objectFit: 'contain',
                          borderRadius: 8,
                          display: 'block',
                        }}
                      />
                    ) : (
                      <span style={{ color: p.color || EMBER }}>{IC.box(20)}</span>
                    )}
                  </div>
                  <div style={{ position: 'relative', zIndex: 6 }}>
                    <IconActionButton
                      label={kloelT(`Editar`)}
                      color={EMBER}
                      onClick={() => router.push(`/products/${p.id}`)}
                    >
                      <svg
                        width={16}
                        height={16}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d={kloelT(`M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z`)} />
                        <path d={kloelT(`m15 5 4 4`)} />
                      </svg>
                    </IconActionButton>
                  </div>
                </div>

                <div
                  style={{
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: isMobile ? 10 : 12,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        minWidth: 0,
                        flex: 1,
                        fontFamily: SORA,
                        fontSize: isMobile ? 14 : 13,
                        fontWeight: 600,
                        color: 'var(--app-text-primary)',
                        lineHeight: 1.4,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {p.name}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        minWidth: 0,
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: 3,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 11,
                          color: 'var(--app-text-tertiary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: '100%',
                        }}
                      >
                        {p.category}
                      </span>
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 11,
                          color: 'var(--app-text-secondary)',
                        }}
                      >
                        {planCountLabel}
                      </span>
                    </div>

                    {isMobile && (
                      <div style={{ flexShrink: 0, minWidth: 94, textAlign: 'right' }}>
                        <div
                          style={{
                            fontFamily: MONO,
                            fontSize: 15,
                            fontWeight: 600,
                            color: EMBER,
                          }}
                        >
                          {fmtBRL(p.revenue)}
                        </div>
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: 4,
                            marginTop: 2,
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: statusColor,
                            }}
                          />
                          <span style={{ fontFamily: MONO, fontSize: 10, color: statusColor }}>
                            {statusLabel}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: isMobile ? '8px 12px' : '7px 12px',
                      borderRadius: 999,
                      border: p.hasPlanPricing
                        ? '1px solid rgba(232,93,48,0.18)'
                        : `1px solid ${BORDER}`,
                      background: p.hasPlanPricing
                        ? 'linear-gradient(180deg, rgba(232,93,48,0.1), rgba(232,93,48,0.04))'
                        : 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                      maxWidth: '100%',
                      flexWrap: 'wrap',
                      alignSelf: 'flex-start',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: SORA,
                        fontSize: 10,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        color: 'var(--app-text-secondary)',
                      }}
                    >
                      {kloelT(`Preço`)}
                    </span>
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 13,
                        fontWeight: 600,
                        color: p.hasPlanPricing ? EMBER : 'var(--app-text-secondary)',
                        wordBreak: 'break-word',
                      }}
                    >
                      {p.priceLabel}
                    </span>
                  </div>
                </div>

                {!isMobile && (
                  <div
                    style={{
                      marginLeft: 'auto',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ textAlign: 'right', minWidth: 104 }}>
                      <div
                        style={{
                          fontFamily: MONO,
                          fontSize: 13,
                          fontWeight: 600,
                          color: EMBER,
                        }}
                      >
                        {fmtBRL(p.revenue)}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          justifyContent: 'flex-end',
                          marginTop: 2,
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: statusColor,
                          }}
                        />
                        <span style={{ fontFamily: MONO, fontSize: 10, color: statusColor }}>
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {displayProducts.length > 0 && (
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
              marginBottom: 16,
            }}
          >
            {kloelT(`Receita por Produto`)}
          </div>
          {displayProducts.map((p) => (
            <div key={p.id} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span
                  style={{ fontFamily: SORA, fontSize: 11, color: 'var(--app-text-secondary)' }}
                >
                  {p.name}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: EMBER }}>
                  {fmtBRL(p.revenue)}
                </span>
              </div>
              <div style={{ height: 4, background: BORDER, borderRadius: 2, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.round((p.revenue / maxRevenue) * 100)}%`,
                    height: '100%',
                    background: `linear-gradient(to right, ${EMBER}50, ${EMBER})`,
                    borderRadius: 2,
                    transition: 'width 0.6s ease',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          padding: 20,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ color: EMBER }}>{IC.trend(16)}</span>
          <span
            style={{
              fontFamily: SORA,
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--app-text-primary)',
            }}
          >
            {kloelT(`Saude operacional`)}
          </span>
        </div>
        {[
          {
            label: 'Produtos ativos',
            value: activeProducts,
            pct: displayProducts.length
              ? Math.round((activeProducts / displayProducts.length) * 100)
              : 0,
          },
          {
            label: 'Checkouts ativos',
            value: activePlanCount,
            pct: Math.min(100, activePlanCount * 10),
          },
          {
            label: 'Areas vinculadas',
            value: memberAreaCount,
            pct: Math.min(100, memberAreaCount * 15),
          },
          {
            label: 'Afiliados ativos',
            value: affiliateCount,
            pct: Math.min(100, affiliateCount * 5),
          },
        ].map((stage) => (
          <div key={stage.label} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontFamily: SORA, fontSize: 11, color: 'var(--app-text-secondary)' }}>
                {stage.label}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--app-text-primary)' }}>
                {fmt(stage.value)} ({stage.pct}
                {kloelT(`%)`)}
              </span>
            </div>
            <div style={{ height: 4, background: BORDER, borderRadius: 2, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${stage.pct}%`,
                  height: '100%',
                  background: EMBER,
                  borderRadius: 2,
                  transition: 'width 0.6s ease',
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          padding: 20,
          marginBottom: 16,
          borderLeft: `3px solid ${EMBER}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ color: EMBER }}>{IC.zap(16)}</span>
          <span
            style={{
              fontFamily: SORA,
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--app-text-primary)',
            }}
          >
            {kloelT(`Motor IA`)}
          </span>
          <NP w={40} h={14} color={EMBER} />
        </div>
        <div
          style={{
            fontFamily: SORA,
            fontSize: 12,
            color: 'var(--app-text-secondary)',
            lineHeight: 1.6,
          }}
        >
          {displayProducts.length > 0
            ? `Seu catálogo já tem ${activePlanCount} checkout${activePlanCount === 1 ? '' : 's'} ativo${activePlanCount === 1 ? '' : 's'} e ${affiliateCount} afiliado${affiliateCount === 1 ? '' : 's'} conectado${affiliateCount === 1 ? '' : 's'}.`
            : 'Crie seu primeiro produto para receber insights de IA sobre conversao e estrategias de venda.'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {[
          {
            label: 'Receita',
            value: fmtBRL(totalRevenue),
            sub: `${displayProducts.length} produtos no catalogo`,
            icon: IC.box,
          },
          {
            label: 'Vendas',
            value: String(totalSales),
            sub: `${activePlanCount} checkout${activePlanCount === 1 ? '' : 's'} ativo${activePlanCount === 1 ? '' : 's'}`,
            icon: IC.store,
          },
          {
            label: 'Ativos',
            value: String(activeProducts),
            sub: `${memberAreaCount} areas de membros`,
            icon: IC.zap,
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
              <span style={{ color: EMBER }}>{s.icon(18)}</span>
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
            <div style={{ fontFamily: MONO, fontSize: 11, color: EMBER, marginTop: 4 }}>
              {s.sub}
            </div>
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
          {kloelT(`Feed ao Vivo`)}
        </div>
        <LiveFeed color={EMBER} events={productEvents} />
      </div>
    </div>
  );
}
