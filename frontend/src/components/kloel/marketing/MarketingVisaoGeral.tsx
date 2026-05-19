'use client';

import { kloelT } from '@/lib/i18n/t';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import {
  Ticker,
  NP,
  IC,
  SORA,
  MONO,
  BG_CARD,
  BORDER,
  EMBER,
  Fmt,
  FmtMoney,
  LiveStream,
} from './MarketingShared';
import type { ChannelRealData, AIBrainInfo } from './MarketingTypes';
import { isBrainAvgResponseMeaningful } from './marketing-utils';
import { RevenueBarChart } from './MarketingRevenueBarChart';

export function MarketingVisaoGeral({
  realStats,
  channelDataMap,
  feedMsgs,
  realBrain,
  products,
}: {
  realStats: {
    totalMessages: number;
    totalLeads: number;
    totalSales: number;
    totalRevenue: number;
  };
  switchTab: (id: string) => void;
  channelDataMap: Record<string, ChannelRealData>;
  feedMsgs: string[];
  realBrain: AIBrainInfo | null;
  products: { name: string; price: number; sold: number; img: string }[];
}) {
  const { isMobile } = useResponsiveViewport();
  const tickerItems = feedMsgs.length > 0 ? feedMsgs : ['Aguardando mensagens...'];

  return (
    <div>
      <div
        style={{
          textAlign: 'center',
          padding: isMobile ? '24px 18px' : '32px 24px',
          marginBottom: 24,
          borderRadius: 6,
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: 10,
            color: 'var(--app-text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.25em',
          }}
        >
          {kloelT(`RECEITA TOTAL GERADA PELA IA`)}
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: isMobile ? 44 : 80,
            fontWeight: 700,
            color: EMBER,
            marginTop: 8,
          }}
        >
          <span>{FmtMoney(realStats.totalRevenue)}</span>
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: isMobile ? 11 : 12,
            color: 'var(--app-text-secondary)',
            marginTop: 4,
            lineHeight: 1.5,
            padding: isMobile ? '0 12px' : 0,
          }}
        >
          {Fmt(realStats.totalMessages)} {kloelT(`msgs &middot;`)} {Fmt(realStats.totalLeads)}{' '}
          {kloelT(`leads &middot;`)} {realStats.totalSales} vendas
        </div>
      </div>

      <Ticker items={tickerItems} />

      <div style={{ marginTop: 20 }}>
        <RevenueBarChart channelDataMap={channelDataMap} />
      </div>

      <div
        style={{
          marginTop: 24,
          background: BG_CARD,
          borderRadius: 6,
          padding: 16,
          border: `1px solid ${BORDER}`,
        }}
      >
        <div
          style={{
            fontFamily: SORA,
            fontSize: 10,
            color: 'var(--app-text-tertiary)',
            marginBottom: 12,
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
          }}
        >
          {kloelT(`Produtos Mais Vendidos`)}
        </div>
        <div style={{ display: 'flex', gap: 12, flexDirection: isMobile ? 'column' : 'row' }}>
          {products.length === 0 ? (
            <div
              style={{
                fontFamily: MONO,
                fontSize: 12,
                color: 'var(--app-text-secondary)',
                padding: 14,
              }}
            >
              {kloelT(`Nenhum produto cadastrado`)}
            </div>
          ) : (
            products.map((p) => (
              <div
                key={p.name}
                style={{
                  flex: 1,
                  background: BG_CARD,
                  borderRadius: 6,
                  padding: 14,
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                  border: `1px solid ${BORDER}`,
                }}
              >
                <div style={{ fontSize: 28 }}>{p.img}</div>
                <div>
                  <div style={{ fontFamily: SORA, fontSize: 12, color: 'var(--app-text-primary)' }}>
                    {p.name}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 13, color: EMBER }}>
                    {FmtMoney(p.price)}
                  </div>
                  <div
                    style={{ fontFamily: MONO, fontSize: 11, color: 'var(--app-text-secondary)' }}
                  >
                    {p.sold} vendidos
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: 16,
          marginTop: 20,
        }}
      >
        <div
          style={{
            background: BG_CARD,
            borderRadius: 6,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 200,
            border: `1px solid ${BORDER}`,
          }}
        >
          <div style={{ color: EMBER, animation: 'mktPulse 3s infinite', marginBottom: 12 }}>
            {IC.zap(40)}
          </div>
          <div
            style={{
              fontFamily: SORA,
              fontSize: 16,
              color: 'var(--app-text-primary)',
              marginBottom: 4,
            }}
          >
            {kloelT(`Cerebro IA`)} {realBrain?.status === 'active' ? 'Ativo' : 'Inativo'}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: EMBER }}>
            {realBrain?.activeConversations ?? 0} {kloelT(`conversas ativas`)}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: MONO, fontSize: 18, color: 'var(--app-text-primary)' }}>
                {realBrain?.productsLoaded ?? 0}
              </div>
              <div
                style={{
                  fontFamily: SORA,
                  fontSize: 9,
                  color: 'var(--app-text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.15em',
                }}
              >
                {kloelT(`Produtos`)}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: MONO, fontSize: 18, color: 'var(--app-text-primary)' }}>
                {realBrain?.objectionsMapped ?? 0}
              </div>
              <div
                style={{
                  fontFamily: SORA,
                  fontSize: 9,
                  color: 'var(--app-text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.15em',
                }}
              >
                {kloelT(`Objecoes`)}
              </div>
            </div>
          </div>
          {isBrainAvgResponseMeaningful(
            realBrain?.avgResponseTime as string | number | null | undefined,
          ) ? (
            <div
              style={{
                fontFamily: MONO,
                fontSize: 11,
                color: 'var(--app-text-secondary)',
                marginTop: 6,
              }}
            >
              {kloelT(`Tempo medio:`)} {String(realBrain?.avgResponseTime)}
            </div>
          ) : null}
          <NP w={200} h={24} color={EMBER} />
        </div>

        <div
          style={{
            background: BG_CARD,
            borderRadius: 6,
            padding: 16,
            border: `1px solid ${BORDER}`,
          }}
        >
          <div
            style={{
              fontFamily: SORA,
              fontSize: 10,
              color: 'var(--app-text-tertiary)',
              marginBottom: 12,
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
            }}
          >
            {kloelT(`Feed em Tempo Real`)}
          </div>
          {feedMsgs.length === 0 ? (
            <div
              style={{
                fontFamily: MONO,
                fontSize: 12,
                color: 'var(--app-text-secondary)',
                padding: 14,
              }}
            >
              {kloelT(`Aguardando mensagens...`)}
            </div>
          ) : (
            <LiveStream msgs={feedMsgs} color={EMBER} />
          )}
        </div>
      </div>
    </div>
  );
}
