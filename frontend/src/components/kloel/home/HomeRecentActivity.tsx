'use client';

import { kloelT } from '@/lib/i18n/t';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import type { DashboardHomeResponse, DashboardHomeCheckpoint, DashboardHomeConversation } from '@/lib/api/home';
import { useRouter } from 'next/navigation';
import NextImage from 'next/image';
import { useState } from 'react';

const FONT_MONO = "'JetBrains Mono', monospace";

const formatCurrency = (amountInCents: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format((Number(amountInCents || 0) || 0) / 100);

const formatInteger = (value: number) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Number(value || 0) || 0);

const formatOneDecimal = (value: number, suffix = '') =>
  `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(Number(value || 0) || 0)}${suffix}`;

function formatRelativeTime(value?: string | null) {
  if (!value) {
    return 'Agora';
  }
  const diffMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return 'Agora';
  }
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) {
    return 'Agora';
  }
  if (minutes < 60) {
    return `há ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `há ${hours} h`;
  }
  const days = Math.floor(hours / 24);
  return `há ${days} d`;
}

function Surface({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: KLOEL_THEME.bgCard,
        border: `1px solid ${KLOEL_THEME.borderPrimary}`,
        borderRadius: 6,
        padding: 18,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

const HOME_HEADER_ACTION_BUTTON_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 'clamp(32px, 2.2vw, 36px)',
  padding: '0 clamp(10px, 1vw, 14px)',
  borderRadius: 6,
  border: `1px solid ${KLOEL_THEME.borderPrimary}`,
  background: 'transparent',
  color: KLOEL_THEME.textSecondary,
  fontFamily: "'Sora', sans-serif",
  fontSize: 'clamp(11px, 0.72vw, 12px)',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap' as const,
  lineHeight: 1,
  flexShrink: 0,
  minWidth: 'fit-content',
};

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{ padding: '18px 16px', borderRadius: 6, border: `1px dashed ${KLOEL_THEME.borderPrimary}`, color: KLOEL_THEME.textSecondary, fontSize: 12, textAlign: 'center' }}>
      {label}
    </div>
  );
}

function StatusChip({ status }: { status: DashboardHomeConversation['status'] }) {
  if (status === 'done') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, color: KLOEL_THEME.success }}>
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: KLOEL_THEME.success }} />
        {kloelT(`Convertida`)}
      </span>
    );
  }
  if (status === 'waiting') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, color: KLOEL_THEME.warning }}>
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: KLOEL_THEME.warning }} />
        {kloelT(`Aguardando`)}
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, color: KLOEL_THEME.accent }}>
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: KLOEL_THEME.accent }} />
      CIA
    </span>
  );
}

function RingMeter({ percent, color, size = 48 }: { percent: number; color: string; size?: number }) {
  const stroke = 3;
  const radius = size / 2 - (stroke / 2 + 1);
  const circumference = 2 * Math.PI * radius;
  const normalized = Math.max(0, Math.min(100, Number(percent || 0)));
  const dashoffset = circumference - (normalized / 100) * circumference;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block', overflow: 'visible' }} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={KLOEL_THEME.borderPrimary} strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={circumference} strokeDashoffset={dashoffset} strokeLinecap="round" />
    </svg>
  );
}

function RevenueBars({
  labels,
  values,
  comparison,
  compact,
}: {
  labels: string[];
  values: number[];
  comparison: number[];
  compact: boolean;
}) {
  const maxValue = Math.max(1, ...values, ...comparison);
  const chartHeight = compact ? 164 : 196;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${labels.length}, minmax(${compact ? 18 : 28}px, 1fr))`, alignItems: 'end', gap: compact ? 8 : 10, height: chartHeight }}>
      {labels.map((label, index) => {
        const current = values[index] || 0;
        const previous = comparison[index] || 0;
        const currentHeight = Math.max(6, Math.round((current / maxValue) * (chartHeight - 34)));
        const previousHeight = Math.max(4, Math.round((previous / maxValue) * (chartHeight - 34)));
        return (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 6, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: chartHeight - 28, width: '100%', justifyContent: 'center' }}>
              <div style={{ width: compact ? 6 : 8, height: previousHeight, borderRadius: '3px 3px 0 0', background: KLOEL_THEME.accentMedium }} />
              <div style={{ width: compact ? 8 : 10, height: currentHeight, borderRadius: '3px 3px 0 0', background: KLOEL_THEME.accent }} />
            </div>
            <span style={{ fontSize: 10, color: KLOEL_THEME.textTertiary, whiteSpace: 'nowrap', fontFamily: FONT_MONO }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function OperationalHealthGuide({ checkpoints, onClose }: { checkpoints: DashboardHomeCheckpoint[]; onClose: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Como alcançar 100% da saúde operacional" style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <button type="button" aria-label="Fechar explicação da saúde operacional" onClick={onClose} style={{ position: 'absolute', inset: 0, border: 'none', background: KLOEL_THEME.bgOverlay, cursor: 'pointer' }} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 520, background: KLOEL_THEME.bgCard, border: `1px solid ${KLOEL_THEME.borderPrimary}`, borderRadius: 6, boxShadow: KLOEL_THEME.shadowXl, padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: KLOEL_THEME.textTertiary, marginBottom: 8 }}>{kloelT(`Saúde operacional`)}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: KLOEL_THEME.textPrimary, marginBottom: 6 }}>{kloelT(`Como alcançar 100%`)}</div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: KLOEL_THEME.textSecondary }}>{kloelT(`O score sobe conforme estes checkpoints reais do workspace ficam ativos no período.`)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" style={{ width: 34, height: 34, borderRadius: 6, border: `1px solid ${KLOEL_THEME.borderPrimary}`, background: KLOEL_THEME.bgSecondary, color: KLOEL_THEME.textSecondary, fontSize: 18, lineHeight: 1, cursor: 'pointer', flexShrink: 0 }}>×</button>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          {checkpoints.map((checkpoint) => (
            <div key={checkpoint.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 6, border: `1px solid ${checkpoint.active ? KLOEL_THEME.accentLight : KLOEL_THEME.borderPrimary}`, background: checkpoint.active ? `color-mix(in srgb, ${KLOEL_THEME.accent} 6%, ${KLOEL_THEME.bgCard})` : KLOEL_THEME.bgSecondary }}>
              <div aria-hidden style={{ width: 18, height: 18, borderRadius: '50%', marginTop: 2, background: checkpoint.active ? KLOEL_THEME.accent : KLOEL_THEME.bgTertiary, boxShadow: checkpoint.active ? `0 0 0 3px color-mix(in srgb, ${KLOEL_THEME.accent} 16%, transparent)` : 'none' }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: checkpoint.active ? KLOEL_THEME.textPrimary : KLOEL_THEME.textSecondary, marginBottom: 4 }}>{checkpoint.label}</div>
                <div style={{ fontSize: 12, lineHeight: 1.65, color: KLOEL_THEME.textSecondary }}>{checkpoint.description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function HomeRecentActivity({
  home,
  isLoading,
  compact,
  activeRangeLabel,
}: {
  home: DashboardHomeResponse | undefined;
  isLoading: boolean;
  compact: boolean;
  activeRangeLabel: string;
}) {
  const router = useRouter();
  const [healthGuideOpen, setHealthGuideOpen] = useState(false);
  const healthCheckpoints = home?.health.checkpoints || [];

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: compact ? '1fr' : 'minmax(0, 1.3fr) minmax(300px, 0.9fr)',
          gap: 12,
        }}
      >
        <Surface style={{ padding: 18 } as React.CSSProperties}>
          <div style={{ display: 'flex', alignItems: compact ? 'flex-start' : 'center', justifyContent: 'space-between', flexDirection: compact ? 'column' : 'row', gap: 12, marginBottom: 18 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: KLOEL_THEME.textTertiary, marginBottom: 6 }}>{kloelT(`Receita no período`)}</div>
              <div style={{ fontSize: 13, color: KLOEL_THEME.textSecondary }}>{kloelT(`A barra laranja mostra o período ativo. O apoio mostra a janela anterior.`)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 4, borderRadius: 999, background: KLOEL_THEME.accent }} />
                <span style={{ fontSize: 10, color: KLOEL_THEME.textTertiary }}>{kloelT(`Atual`)}</span>
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 4, borderRadius: 999, background: KLOEL_THEME.accentMedium }} />
                <span style={{ fontSize: 10, color: KLOEL_THEME.textTertiary }}>{kloelT(`Anterior`)}</span>
              </div>
            </div>
          </div>
          <RevenueBars labels={home?.series.labels || []} values={home?.series.revenueInCents || []} comparison={home?.series.previousRevenueInCents || []} compact={compact} />
        </Surface>

        <Surface style={{ padding: 18 } as React.CSSProperties}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: KLOEL_THEME.textTertiary, marginBottom: 6 }}>{kloelT(`Kloel no período`)}</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{home?.range.label || 'Período ativo'}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: KLOEL_THEME.success }}>{kloelT(`Ativo`)}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Conversas', value: formatInteger(home?.metrics.totalConversations || 0), tone: KLOEL_THEME.accent },
                { label: 'Pedidos aprovados', value: formatInteger(home?.metrics.convertedOrders || 0), tone: KLOEL_THEME.success },
                { label: 'Em atendimento', value: formatInteger(home?.metrics.waitingForHuman || 0), tone: KLOEL_THEME.warning },
                { label: 'Tempo de resposta', value: home?.metrics.averageResponseTimeSeconds && home.metrics.averageResponseTimeSeconds > 0 ? `${formatInteger(home.metrics.averageResponseTimeSeconds)}s` : '—', tone: KLOEL_THEME.textPrimary },
              ].map((item) => (
                <div key={item.label} style={{ borderRadius: 6, border: `1px solid ${KLOEL_THEME.borderPrimary}`, background: KLOEL_THEME.bgSecondary, padding: 12 }}>
                  <div style={{ fontSize: 10, color: KLOEL_THEME.textTertiary, marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: item.tone }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </Surface>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
        <Surface style={{ padding: 18 } as React.CSSProperties}>
          <div style={{ display: 'flex', alignItems: compact ? 'flex-start' : 'center', justifyContent: 'space-between', flexDirection: compact ? 'column' : 'row', gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: KLOEL_THEME.textTertiary, marginBottom: 6 }}>{kloelT(`Produtos`)}</div>
              <div style={{ fontSize: 13, color: KLOEL_THEME.textSecondary }}>{kloelT(`Produtos que mais converteram em`)} {activeRangeLabel.toLowerCase()}.</div>
            </div>
            <button type="button" onClick={() => router.push('/products')} style={HOME_HEADER_ACTION_BUTTON_STYLE}>{kloelT(`Ver todos`)}</button>
          </div>
          {home?.products?.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {home.products.map((product) => {
                const statusLabel = product.status === 'ACTIVE' ? 'Ativo' : product.status === 'DRAFT' ? 'Rascunho' : product.status;
                return (
                  <button key={product.id} type="button" onClick={() => router.push(`/products/${product.id}`)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%', padding: '12px 14px', borderRadius: 6, border: `1px solid ${product.isTop ? KLOEL_THEME.accentMedium : KLOEL_THEME.borderPrimary}`, background: KLOEL_THEME.bgSecondary, textAlign: 'left', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 6, background: KLOEL_THEME.bgElevated, border: `1px solid ${KLOEL_THEME.borderPrimary}`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', color: KLOEL_THEME.accent, fontWeight: 700, flexShrink: 0 }}>
                        {product.imageUrl ? <NextImage src={product.imageUrl} alt={product.name} unoptimized width={40} height={40} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : product.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: KLOEL_THEME.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</span>
                          {product.isTop ? <span style={{ height: 20, display: 'inline-flex', alignItems: 'center', padding: '0 8px', borderRadius: 999, background: KLOEL_THEME.accentLight, color: KLOEL_THEME.accent, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>TOP</span> : null}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 11, color: KLOEL_THEME.textSecondary }}>{`${product.category || 'Produto'} · ${statusLabel}`} · {formatInteger(product.totalSales)} venda{product.totalSales === 1 ? '' : 's'}</div>
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: KLOEL_THEME.textPrimary }}>{formatCurrency(product.totalRevenueInCents)}</div>
                      <div style={{ fontSize: 10, color: KLOEL_THEME.textTertiary, marginTop: 4 }}>{kloelT(`receita aprovada`)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyState label={kloelT(`Nenhum produto com receita no período selecionado.`)} />
          )}
        </Surface>

        <Surface style={{ padding: 18 } as React.CSSProperties}>
          <div style={{ display: 'flex', alignItems: compact ? 'flex-start' : 'center', justifyContent: 'space-between', flexDirection: compact ? 'column' : 'row', gap: 12, marginBottom: 16 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: KLOEL_THEME.textTertiary, marginBottom: 6 }}>{kloelT(`Conversas recentes`)}</div>
              <div style={{ fontSize: 13, color: KLOEL_THEME.textSecondary }}>{kloelT(`Fila mais recente do inbox com leitura rápida de status.`)}</div>
            </div>
            <button type="button" onClick={() => router.push('/inbox')} style={HOME_HEADER_ACTION_BUTTON_STYLE}>{kloelT(`Abrir inbox`)}</button>
          </div>
          {home?.recentConversations?.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {home.recentConversations.map((conversation) => (
                <button key={conversation.id} type="button" onClick={() => router.push(`/inbox?conversationId=${encodeURIComponent(conversation.id)}`)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%', padding: '12px 14px', borderRadius: 6, border: `1px solid ${KLOEL_THEME.borderPrimary}`, background: KLOEL_THEME.bgSecondary, textAlign: 'left', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: KLOEL_THEME.bgElevated, border: `1px solid ${KLOEL_THEME.borderPrimary}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: KLOEL_THEME.accent, fontWeight: 700, flexShrink: 0, overflow: 'hidden' }}>
                      {conversation.avatarUrl ? <NextImage src={conversation.avatarUrl} alt={conversation.contactName} unoptimized width={144} height={144} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : conversation.contactName.split(' ').slice(0, 2).map((chunk) => chunk[0]).join('').toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: KLOEL_THEME.textPrimary, marginBottom: 4 }}>{conversation.contactName}</div>
                      <div style={{ fontSize: 11, color: KLOEL_THEME.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: compact ? '42vw' : '100%' }}>{conversation.preview || 'Sem prévia de mensagem'}</div>
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: KLOEL_THEME.textTertiary, marginBottom: 6 }}>{formatRelativeTime(conversation.lastMessageAt)}</div>
                    <StatusChip status={conversation.status} />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState label={kloelT(`Nenhuma conversa recente para exibir.`)} />
          )}
        </Surface>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
        <Surface style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 16 } as React.CSSProperties}>
          <RingMeter percent={home?.health.operationalScorePct || 0} color={KLOEL_THEME.success} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: KLOEL_THEME.textTertiary }}>{kloelT(`Saúde operacional`)}</div>
              <button type="button" onClick={() => setHealthGuideOpen(true)} style={{ height: 28, padding: '0 10px', borderRadius: 999, border: `1px solid ${KLOEL_THEME.borderPrimary}`, background: KLOEL_THEME.bgSecondary, color: KLOEL_THEME.accent, fontSize: 11, fontWeight: 700, fontFamily: "'Sora', sans-serif", cursor: 'pointer', whiteSpace: 'nowrap' }}>{kloelT(`Como chegar a 100%`)}</button>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{formatOneDecimal(home?.health.operationalScorePct || 0, '%')}</div>
            <div style={{ fontSize: 11, color: KLOEL_THEME.textSecondary, marginTop: 4 }}>{formatInteger(home?.health.activeCheckpoints || 0)} de {formatInteger(home?.health.totalCheckpoints || 0)} {kloelT(`checkpoints ativos`)}</div>
          </div>
        </Surface>

        <Surface style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 16 } as React.CSSProperties}>
          <RingMeter percent={home?.health.checkoutCompletionRatePct || 0} color={KLOEL_THEME.accent} />
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: KLOEL_THEME.textTertiary, marginBottom: 6 }}>{kloelT(`Funil do checkout`)}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{formatOneDecimal(home?.health.checkoutCompletionRatePct || 0, '%')}</div>
            <div style={{ fontSize: 11, color: KLOEL_THEME.textSecondary, marginTop: 4 }}>{kloelT(`conversão entre pedidos gerados e pagos`)}</div>
          </div>
        </Surface>

        <Surface style={{ padding: 18 } as React.CSSProperties}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: KLOEL_THEME.textTertiary, marginBottom: 12 }}>{kloelT(`Ações rápidas`)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button type="button" onClick={() => router.push('/products/new')} style={{ height: 42, borderRadius: 6, border: 'none', background: KLOEL_THEME.accent, color: KLOEL_THEME.textOnAccent, fontFamily: "'Sora', sans-serif", fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{kloelT(`Novo produto`)}</button>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button type="button" onClick={() => router.push('/products')} style={{ height: 40, borderRadius: 6, border: `1px solid ${KLOEL_THEME.borderPrimary}`, background: 'transparent', color: KLOEL_THEME.textSecondary, fontFamily: "'Sora', sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{kloelT(`Meus produtos`)}</button>
              <button type="button" onClick={() => router.push('/produtos/afiliar-se')} style={{ height: 40, borderRadius: 6, border: `1px solid ${KLOEL_THEME.borderPrimary}`, background: 'transparent', color: KLOEL_THEME.textSecondary, fontFamily: "'Sora', sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{kloelT(`Afiliar-se`)}</button>
            </div>
          </div>
        </Surface>
      </div>

      {healthGuideOpen ? (
        <OperationalHealthGuide checkpoints={healthCheckpoints} onClose={() => setHealthGuideOpen(false)} />
      ) : null}
    </>
  );
}
