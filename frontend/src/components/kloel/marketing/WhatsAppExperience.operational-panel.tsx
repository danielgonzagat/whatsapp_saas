'use client';

import { kloelT } from '@/lib/i18n/t';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { UI } from '@/lib/ui-tokens';
import type { WhatsAppSetupState } from './WhatsAppExperience.helpers';
import { TONE_OPTIONS, formatCompact } from './WhatsAppExperience.helpers';
import {
  FeedCard,
  InfoCard,
  MetricCard,
  ProductPerformanceCard,
  type SummaryProductCard,
} from './WhatsAppExperience.dashboard-cards';
import {
  B,
  C,
  D,
  E,
  F,
  G,
  M,
  S,
  type ChannelRealData,
  type EffectiveConnection,
} from './WhatsAppExperience.panel-tokens';

export interface OperationalPanelProps {
  statusLabel: string;
  profileName: string;
  connectedPhone: string;
  channelData: ChannelRealData | null;
  liveFeed: string[];
  draft: WhatsAppSetupState;
  summaryProducts: SummaryProductCard[];
  summaryData: unknown;
  workspaceId: string;
  effectiveConnection: EffectiveConnection;
  onReconfigure: () => void;
}

function resolveToneLabel(tone: WhatsAppSetupState['config']['tone']) {
  return TONE_OPTIONS.find(([value]) => value === tone)?.[1] ?? tone;
}

function SystemStatus({ connected, status }: { connected: boolean; status: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        border: `1px solid ${B}`,
        borderRadius: UI.radiusLg,
        padding: 16,
        background: C,
      }}
    >
      <div>
        <div
          style={{ color: KLOEL_THEME.textPrimary, fontFamily: F, fontSize: 14, fontWeight: 700 }}
        >
          {connected ? kloelT('WhatsApp operacional') : kloelT('WhatsApp aguardando conexão')}
        </div>
        <div style={{ color: S, fontFamily: F, fontSize: 12, marginTop: 4 }}>
          {kloelT('Status do canal')}: <span style={{ fontFamily: M }}>{status}</span>
        </div>
      </div>
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: UI.radiusFull,
          background: connected ? G : D,
          boxShadow: connected ? `0 0 18px color-mix(in srgb, ${G} 45%, transparent)` : 'none',
        }}
      />
    </div>
  );
}

function AiConfigSummary({ draft }: { draft: WhatsAppSetupState }) {
  const entries = [
    [kloelT('Tom'), resolveToneLabel(draft.config.tone)],
    [kloelT('Desconto máximo'), `${draft.config.maxDiscount}%`],
    [
      kloelT('Follow-up'),
      draft.config.followUp ? `${draft.config.followUpHours}h` : kloelT('desligado'),
    ],
    [kloelT('Horário'), draft.config.workingHours],
  ] as const;

  return (
    <div
      style={{ border: `1px solid ${B}`, borderRadius: UI.radiusLg, background: C, padding: 18 }}
    >
      <h3 style={{ margin: 0, color: KLOEL_THEME.textPrimary, fontFamily: F, fontSize: 15 }}>
        {kloelT('Configuração ativa da IA')}
      </h3>
      <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
        {entries.map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: S, fontFamily: F, fontSize: 12 }}>{label}</span>
            <strong style={{ color: E, fontFamily: M, fontSize: 12, textAlign: 'right' }}>
              {value}
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Runtime dashboard shown after the WhatsApp sales assistant is configured. */
export function OperationalPanel({
  statusLabel,
  profileName,
  connectedPhone,
  channelData,
  liveFeed,
  draft,
  summaryProducts,
  effectiveConnection,
}: OperationalPanelProps) {
  const channelRealData = channelData ?? {
    messages: 0,
    leads: 0,
    sales: 0,
    status: statusLabel,
  };
  const recentFeed = [
    ...liveFeed,
    kloelT('IA pronta para responder leads do canal conectado.'),
    draft.arsenal.length
      ? kloelT('Arsenal de mídia disponível para provas sociais.')
      : kloelT('Adicione mídia para fortalecer objeções e fechamento.'),
    summaryProducts.length
      ? kloelT('Produtos selecionados disponíveis para oferta.')
      : kloelT('Nenhum produto selecionado para venda automática.'),
  ];

  return (
    <div
      style={{ background: KLOEL_THEME.bgPrimary, color: KLOEL_THEME.textPrimary, fontFamily: F }}
    >
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '28px 24px 40px' }}>
        <div style={{ display: 'grid', gap: 16 }}>
          <SystemStatus connected={effectiveConnection.connected} status={channelRealData.status} />
          <div
            className="wa-operational-grid"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}
          >
            <MetricCard
              label={kloelT('Mensagens')}
              value={formatCompact(channelRealData.messages)}
              accent={E}
            />
            <MetricCard
              label={kloelT('Leads')}
              value={formatCompact(channelRealData.leads)}
              accent={UI.info}
            />
            <MetricCard
              label={kloelT('Vendas')}
              value={formatCompact(channelRealData.sales)}
              accent={G}
            />
          </div>
          <div
            className="wa-operational-grid"
            style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr', gap: 16 }}
          >
            <div style={{ display: 'grid', gap: 12 }}>
              {summaryProducts.length ? (
                summaryProducts.map((product) => (
                  <ProductPerformanceCard key={product.id} product={product} />
                ))
              ) : (
                <InfoCard
                  label={kloelT('Produtos')}
                  value={kloelT(
                    'Selecione produtos para liberar a leitura operacional de performance.',
                  )}
                />
              )}
            </div>
            <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
              <AiConfigSummary draft={draft} />
              <InfoCard label={kloelT('Operador')} value={profileName} />
              <InfoCard
                label={kloelT('Canal')}
                value={
                  connectedPhone ||
                  effectiveConnection.phoneNumber ||
                  kloelT('Número ainda não identificado')
                }
              />
              <FeedCard liveFeed={recentFeed} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
