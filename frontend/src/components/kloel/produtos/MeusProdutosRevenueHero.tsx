'use client';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { useEffect, useRef } from 'react';
import { SORA, MONO, EMBER, NP, fmtBRL } from './ProdutosView.shared';
import { IC } from './ProdutosView.icons';

export default function MeusProdutosRevenueHero({
  totalRevenue,
  activeProducts,
  totalProductCount,
  onCreateProduct,
}: {
  totalRevenue: number;
  activeProducts: number;
  totalProductCount: number;
  onCreateProduct: () => void;
  requestedFeature?: string | undefined;
}) {
  const { isMobile } = useResponsiveViewport();
  const flashElRef = useRef<HTMLDivElement>(null);
  const revElRef = useRef<HTMLSpanElement>(null);

  const displayRevRef = useRef(totalRevenue);
  useEffect(() => {
    displayRevRef.current = totalRevenue;
    if (revElRef.current) {
      revElRef.current.textContent = fmtBRL(totalRevenue);
    }
  }, [totalRevenue]);

  return (
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
                ? `${activeProducts}/${totalProductCount} ativos`
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
  );
}
