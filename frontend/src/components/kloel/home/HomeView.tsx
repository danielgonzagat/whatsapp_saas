'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import { useDashboardHome } from '@/hooks/useDashboardHome';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import type {
  DashboardHomeCheckpoint,
  DashboardHomeConversation,
  DashboardHomePeriod,
} from '@/lib/api/home';

const FONT_SANS = "'Sora', sans-serif";
const FONT_MONO = "'JetBrains Mono', monospace";

const PERIOD_OPTIONS: Array<{ key: DashboardHomePeriod; label: string }> = [
  { key: 'today', label: 'Hoje' },
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: '90d', label: '90 dias' },
  { key: 'custom', label: 'Personalizado' },
];

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
  fontFamily: FONT_SANS,
  fontSize: 'clamp(11px, 0.72vw, 12px)',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap' as const,
  lineHeight: 1,
  flexShrink: 0,
  minWidth: 'fit-content',
};

function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  if (hour >= 18) return 'Boa noite';
  return 'Boa madrugada';
}

function formatRelativeTime(value?: string | null) {
  if (!value) return 'Agora';

  const diffMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'Agora';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Agora';
  if (minutes < 60) return `há ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;

  const days = Math.floor(hours / 24);
  return `há ${days} d`;
}

function Sparkline({
  data,
  color,
  width = 84,
  height = 30,
}: {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  const points = useMemo(() => {
    if (!data.length) return '';
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    return data
      .map((value, index) => {
        const x = data.length === 1 ? width / 2 : (index / (data.length - 1)) * width;
        const y = height - ((value - min) / range) * (height - 6) - 3;
        return `${x},${y}`;
      })
      .join(' ');
  }, [data, height, width]);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RingMeter({
  percent,
  color,
  size = 48,
}: {
  percent: number;
  color: string;
  size?: number;
}) {
  const stroke = 3;
  const radius = size / 2 - (stroke / 2 + 1);
  const circumference = 2 * Math.PI * radius;
  const normalized = Math.max(0, Math.min(100, Number(percent || 0)));
  const dashoffset = circumference - (normalized / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      style={{ transform: 'rotate(-90deg)', display: 'block', overflow: 'visible' }}
      aria-hidden
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={KLOEL_THEME.borderPrimary}
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={dashoffset}
        strokeLinecap="round"
      />
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
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${labels.length}, minmax(${compact ? 18 : 28}px, 1fr))`,
        alignItems: 'end',
        gap: compact ? 8 : 10,
        height: chartHeight,
      }}
    >
      {labels.map((label, index) => {
        const current = values[index] || 0;
        const previous = comparison[index] || 0;
        const currentHeight = Math.max(6, Math.round((current / maxValue) * (chartHeight - 34)));
        const previousHeight = Math.max(4, Math.round((previous / maxValue) * (chartHeight - 34)));

        return (
          <div
            key={`${label}-${index}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 6,
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 4,
                height: chartHeight - 28,
                width: '100%',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: compact ? 6 : 8,
                  height: previousHeight,
                  borderRadius: '3px 3px 0 0',
                  background: KLOEL_THEME.accentMedium,
                }}
              />
              <div
                style={{
                  width: compact ? 8 : 10,
                  height: currentHeight,
                  borderRadius: '3px 3px 0 0',
                  background: KLOEL_THEME.accent,
                  boxShadow: `0 0 0 1px color-mix(in srgb, ${KLOEL_THEME.accent} 18%, transparent)`,
                }}
              />
            </div>
            <span
              style={{
                fontSize: 10,
                color: KLOEL_THEME.textTertiary,
                whiteSpace: 'nowrap',
                fontFamily: FONT_MONO,
              }}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Surface({
  children,
  padded = true,
  style,
}: {
  children: React.ReactNode;
  padded?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: KLOEL_THEME.bgCard,
        border: `1px solid ${KLOEL_THEME.borderPrimary}`,
        borderRadius: 6,
        padding: padded ? 20 : 0,
        boxShadow: KLOEL_THEME.shadowSm,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function PeriodTabs({
  period,
  onSelect,
}: {
  period: DashboardHomePeriod;
  onSelect: (next: DashboardHomePeriod) => void;
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: 4,
        background: KLOEL_THEME.bgSecondary,
        border: `1px solid ${KLOEL_THEME.borderSubtle}`,
        borderRadius: 6,
        flexWrap: 'wrap',
      }}
    >
      {PERIOD_OPTIONS.map((item) => {
        const active = period === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item.key)}
            style={{
              height: 34,
              padding: '0 14px',
              borderRadius: 4,
              border: active ? `1px solid ${KLOEL_THEME.accent}` : '1px solid transparent',
              background: active ? KLOEL_THEME.bgCard : 'transparent',
              color: active ? KLOEL_THEME.accent : KLOEL_THEME.textSecondary,
              fontSize: 12,
              fontWeight: active ? 700 : 500,
              fontFamily: FONT_SANS,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function StatusChip({ status }: { status: DashboardHomeConversation['status'] }) {
  if (status === 'done') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 10,
          fontWeight: 700,
          color: KLOEL_THEME.success,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: KLOEL_THEME.success,
          }}
        />
        Convertida
      </span>
    );
  }

  if (status === 'waiting') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 10,
          fontWeight: 700,
          color: KLOEL_THEME.warning,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: KLOEL_THEME.warning,
          }}
        />
        Aguardando
      </span>
    );
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 10,
        fontWeight: 700,
        color: KLOEL_THEME.accent,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: KLOEL_THEME.accent,
        }}
      />
      CIA
    </span>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: '18px 16px',
        borderRadius: 6,
        border: `1px dashed ${KLOEL_THEME.borderPrimary}`,
        color: KLOEL_THEME.textSecondary,
        fontSize: 12,
        textAlign: 'center',
      }}
    >
      {label}
    </div>
  );
}

function OperationalHealthGuide({
  checkpoints,
  onClose,
}: {
  checkpoints: DashboardHomeCheckpoint[];
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Como alcançar 100% da saúde operacional"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <button
        type="button"
        aria-label="Fechar explicação da saúde operacional"
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          border: 'none',
          background: KLOEL_THEME.bgOverlay,
          cursor: 'pointer',
        }}
      />
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 520,
          background: KLOEL_THEME.bgCard,
          border: `1px solid ${KLOEL_THEME.borderPrimary}`,
          borderRadius: 6,
          boxShadow: KLOEL_THEME.shadowXl,
          padding: 22,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 18,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                color: KLOEL_THEME.textTertiary,
                marginBottom: 8,
              }}
            >
              Saúde operacional
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: KLOEL_THEME.textPrimary,
                marginBottom: 6,
              }}
            >
              Como alcançar 100%
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                lineHeight: 1.7,
                color: KLOEL_THEME.textSecondary,
              }}
            >
              O score sobe conforme estes checkpoints reais do workspace ficam ativos no período.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            style={{
              width: 34,
              height: 34,
              borderRadius: 6,
              border: `1px solid ${KLOEL_THEME.borderPrimary}`,
              background: KLOEL_THEME.bgSecondary,
              color: KLOEL_THEME.textSecondary,
              fontSize: 18,
              lineHeight: 1,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          {checkpoints.map((checkpoint) => (
            <div
              key={checkpoint.id}
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                gap: 12,
                alignItems: 'flex-start',
                padding: '12px 14px',
                borderRadius: 6,
                border: `1px solid ${checkpoint.active ? KLOEL_THEME.accentLight : KLOEL_THEME.borderPrimary}`,
                background: checkpoint.active
                  ? `color-mix(in srgb, ${KLOEL_THEME.accent} 6%, ${KLOEL_THEME.bgCard})`
                  : KLOEL_THEME.bgSecondary,
              }}
            >
              <div
                aria-hidden
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  marginTop: 2,
                  background: checkpoint.active ? KLOEL_THEME.accent : KLOEL_THEME.bgTertiary,
                  boxShadow: checkpoint.active
                    ? `0 0 0 3px color-mix(in srgb, ${KLOEL_THEME.accent} 16%, transparent)`
                    : 'none',
                }}
              />
              <div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: checkpoint.active ? KLOEL_THEME.textPrimary : KLOEL_THEME.textSecondary,
                    marginBottom: 4,
                  }}
                >
                  {checkpoint.label}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    lineHeight: 1.65,
                    color: KLOEL_THEME.textSecondary,
                  }}
                >
                  {checkpoint.description}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function HomeView() {
  const router = useRouter();
  const { userName } = useAuth();
  const { isMobile, isTablet } = useResponsiveViewport();
  const [period, setPeriod] = useState<DashboardHomePeriod>('7d');
  const [rangePopoverOpen, setRangePopoverOpen] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [healthGuideOpen, setHealthGuideOpen] = useState(false);

  const query =
    period === 'custom'
      ? { period, startDate: customStartDate, endDate: customEndDate }
      : { period };
  const { home, isLoading } = useDashboardHome(query);

  const firstName =
    String(userName || 'Daniel')
      .trim()
      .split(/\s+/)[0] || 'Daniel';
  const greeting = getGreeting();
  const compact = isMobile || isTablet;
  const healthCheckpoints = home?.health.checkpoints || [];

  const revenueSeries = home?.series.revenueInCents || [];
  const orderSeries = home?.series.paidOrders || [];
  const conversionSeries = home?.series.conversionRatePct || [];
  const averageTicketSeries = home?.series.averageTicketInCents || [];

  const activeRangeLabel =
    period === 'custom' && customStartDate && customEndDate
      ? `${customStartDate.split('-').reverse().join('/')} até ${customEndDate
          .split('-')
          .reverse()
          .join('/')}`
      : home?.range.label || 'Últimos 7 dias';

  return (
    <div
      style={{
        minHeight: '100%',
        background: KLOEL_THEME.bgPrimary,
        color: KLOEL_THEME.textPrimary,
      }}
    >
      <div
        style={{
          maxWidth: 1240,
          margin: '0 auto',
          padding: isMobile ? '24px 16px 36px' : '32px 24px 40px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <Surface
          style={{
            padding: isMobile ? 18 : 24,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: -80,
              right: -72,
              width: 220,
              height: 220,
              borderRadius: '50%',
              background: `color-mix(in srgb, ${KLOEL_THEME.accent} 10%, transparent)`,
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'relative',
              display: 'flex',
              flexDirection: compact ? 'column' : 'row',
              alignItems: compact ? 'stretch' : 'flex-start',
              justifyContent: 'space-between',
              gap: 20,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: '.14em',
                  textTransform: 'uppercase',
                  color: KLOEL_THEME.textTertiary,
                  fontFamily: FONT_MONO,
                  marginBottom: 10,
                }}
              >
                {new Date().toLocaleDateString('pt-BR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </div>
              <h1
                style={{
                  fontSize: compact ? 30 : 38,
                  lineHeight: 1.02,
                  letterSpacing: '-0.04em',
                  fontWeight: 700,
                  margin: 0,
                }}
              >
                {greeting}, <span style={{ color: KLOEL_THEME.accent }}>{firstName}</span>.
              </h1>
              <p
                style={{
                  margin: '8px 0 0',
                  color: KLOEL_THEME.textSecondary,
                  fontSize: 14,
                }}
              >
                Operação, receita e conversas em um único plano de controle.
              </p>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                alignItems: compact ? 'stretch' : 'flex-end',
              }}
            >
              <PeriodTabs
                period={period}
                onSelect={(next) => {
                  if (next === 'custom') {
                    setRangePopoverOpen((current) => !current);
                    setPeriod('custom');
                    return;
                  }
                  setRangePopoverOpen(false);
                  setPeriod(next);
                }}
              />
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 20,
                  color: KLOEL_THEME.textSecondary,
                  fontSize: 12,
                }}
              >
                <span>Período ativo:</span>
                <span style={{ color: KLOEL_THEME.textPrimary, fontWeight: 600 }}>
                  {activeRangeLabel}
                </span>
              </div>
            </div>
          </div>

          {rangePopoverOpen && (
            <div
              style={{
                position: compact ? 'static' : 'absolute',
                top: compact ? undefined : 86,
                right: compact ? undefined : 24,
                marginTop: compact ? 18 : 0,
                width: compact ? '100%' : 320,
                borderRadius: 6,
                border: `1px solid ${KLOEL_THEME.borderPrimary}`,
                background: KLOEL_THEME.bgCard,
                boxShadow: KLOEL_THEME.shadowLg,
                padding: 16,
                zIndex: 2,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
                Período personalizado
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: compact ? '1fr' : '1fr 1fr',
                  gap: 10,
                }}
              >
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 11, color: KLOEL_THEME.textTertiary }}>De</span>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(event) => setCustomStartDate(event.target.value)}
                    style={{
                      height: 40,
                      borderRadius: 6,
                      border: `1px solid ${KLOEL_THEME.borderInput}`,
                      background: KLOEL_THEME.bgInput,
                      color: KLOEL_THEME.textPrimary,
                      padding: '0 12px',
                      fontFamily: FONT_SANS,
                    }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 11, color: KLOEL_THEME.textTertiary }}>Até</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(event) => setCustomEndDate(event.target.value)}
                    style={{
                      height: 40,
                      borderRadius: 6,
                      border: `1px solid ${KLOEL_THEME.borderInput}`,
                      background: KLOEL_THEME.bgInput,
                      color: KLOEL_THEME.textPrimary,
                      padding: '0 12px',
                      fontFamily: FONT_SANS,
                    }}
                  />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button
                  type="button"
                  onClick={() => setRangePopoverOpen(false)}
                  style={{
                    flex: 1,
                    height: 38,
                    borderRadius: 6,
                    border: `1px solid ${KLOEL_THEME.borderPrimary}`,
                    background: 'transparent',
                    color: KLOEL_THEME.textSecondary,
                    fontFamily: FONT_SANS,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (customStartDate && customEndDate) {
                      setPeriod('custom');
                      setRangePopoverOpen(false);
                    }
                  }}
                  style={{
                    flex: 1,
                    height: 38,
                    borderRadius: 6,
                    border: 'none',
                    background: KLOEL_THEME.accent,
                    color: KLOEL_THEME.textOnAccent,
                    fontFamily: FONT_SANS,
                    fontWeight: 700,
                    cursor: 'pointer',
                    opacity: customStartDate && customEndDate ? 1 : 0.5,
                  }}
                >
                  Aplicar
                </button>
              </div>
            </div>
          )}
        </Surface>

        <Surface
          style={{
            padding: isMobile ? 18 : 26,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {healthGuideOpen ? (
            <OperationalHealthGuide
              checkpoints={healthCheckpoints}
              onClose={() => setHealthGuideOpen(false)}
            />
          ) : null}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: compact ? '1fr' : 'minmax(0, 1.2fr) minmax(360px, 0.9fr)',
              gap: 18,
              alignItems: 'stretch',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                  color: KLOEL_THEME.textTertiary,
                  fontFamily: FONT_MONO,
                  marginBottom: 10,
                }}
              >
                Receita total dos seus produtos
              </div>
              <div
                style={{
                  fontSize: compact ? 36 : 52,
                  fontWeight: 700,
                  lineHeight: 0.98,
                  letterSpacing: '-0.05em',
                  color: KLOEL_THEME.accent,
                }}
              >
                {isLoading ? '...' : formatCurrency(home?.hero.totalRevenueInCents || 0)}
              </div>
              <div
                style={{
                  marginTop: 10,
                  color: KLOEL_THEME.textSecondary,
                  fontSize: 13,
                }}
              >
                Receita aprovada em{' '}
                <span style={{ color: KLOEL_THEME.textPrimary }}>{activeRangeLabel}</span>.
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: compact ? '1fr 1fr' : 'repeat(2, minmax(0, 1fr))',
                gap: 10,
              }}
            >
              {[
                {
                  label: 'Total deste mês',
                  value: formatCurrency(home?.hero.monthRevenueInCents || 0),
                  meta: `Mês anterior · ${formatCurrency(home?.hero.previousMonthRevenueInCents || 0)}`,
                  tone: KLOEL_THEME.accent,
                },
                {
                  label: 'Vendas de hoje',
                  value: formatCurrency(home?.hero.todayRevenueInCents || 0),
                  meta: `Ontem · ${formatCurrency(home?.hero.yesterdayRevenueInCents || 0)}`,
                  tone: KLOEL_THEME.accent,
                },
                {
                  label: 'Saldo disponível',
                  value: formatCurrency(home?.hero.availableBalanceInCents || 0),
                  meta: 'Disponível para saque',
                  tone: KLOEL_THEME.success,
                },
                {
                  label: 'A receber',
                  value: formatCurrency(home?.hero.pendingBalanceInCents || 0),
                  meta: 'Receitas em processamento',
                  tone: KLOEL_THEME.warning,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    minHeight: 102,
                    padding: '14px 16px',
                    borderRadius: 6,
                    background: KLOEL_THEME.bgSecondary,
                    border: `1px solid ${KLOEL_THEME.borderPrimary}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '.08em',
                      textTransform: 'uppercase',
                      color: KLOEL_THEME.textTertiary,
                      marginBottom: 8,
                    }}
                  >
                    {item.label}
                  </div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: item.tone,
                      lineHeight: 1.1,
                    }}
                  >
                    {item.value}
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 11,
                      color: KLOEL_THEME.textSecondary,
                    }}
                  >
                    {item.meta}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Surface>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: compact ? '1fr' : 'repeat(4, minmax(0, 1fr))',
            gap: 12,
          }}
        >
          {[
            {
              label: 'Receita',
              value: formatCurrency(home?.hero.totalRevenueInCents || 0),
              tone: KLOEL_THEME.accent,
              delta:
                home?.hero.revenueDeltaPct === null
                  ? 'Sem comparativo anterior'
                  : `${(home?.hero.revenueDeltaPct || 0) >= 0 ? '+' : ''}${formatOneDecimal(home?.hero.revenueDeltaPct || 0, '%')} vs período anterior`,
              series: revenueSeries,
            },
            {
              label: 'Vendas',
              value: formatInteger(home?.metrics.paidOrders || 0),
              tone: KLOEL_THEME.textPrimary,
              delta: `${formatInteger(home?.metrics.totalOrders || 0)} pedidos gerados no período`,
              series: orderSeries,
            },
            {
              label: 'Conversão',
              value: formatOneDecimal(home?.metrics.conversionRatePct || 0, '%'),
              tone: KLOEL_THEME.textPrimary,
              delta: 'Taxa de checkout concluído',
              series: conversionSeries,
            },
            {
              label: 'Ticket médio',
              value: formatCurrency(home?.metrics.averageTicketInCents || 0),
              tone: KLOEL_THEME.textPrimary,
              delta: 'Média por pedido aprovado',
              series: averageTicketSeries,
            },
          ].map((item) => (
            <Surface key={item.label} style={{ padding: 18 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '.12em',
                      textTransform: 'uppercase',
                      color: KLOEL_THEME.textTertiary,
                      marginBottom: 8,
                    }}
                  >
                    {item.label}
                  </div>
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 700,
                      letterSpacing: '-0.04em',
                      lineHeight: 1,
                      color: item.tone,
                    }}
                  >
                    {isLoading ? '...' : item.value}
                  </div>
                </div>
                <Sparkline data={item.series} color={KLOEL_THEME.accent} />
              </div>
              <div style={{ fontSize: 11, color: KLOEL_THEME.textSecondary }}>{item.delta}</div>
            </Surface>
          ))}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: compact ? '1fr' : 'minmax(0, 1.3fr) minmax(300px, 0.9fr)',
            gap: 12,
          }}
        >
          <Surface style={{ padding: 18 }}>
            <div
              style={{
                display: 'flex',
                alignItems: compact ? 'flex-start' : 'center',
                justifyContent: 'space-between',
                flexDirection: compact ? 'column' : 'row',
                gap: 12,
                marginBottom: 18,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                    color: KLOEL_THEME.textTertiary,
                    marginBottom: 6,
                  }}
                >
                  Receita no período
                </div>
                <div style={{ fontSize: 13, color: KLOEL_THEME.textSecondary }}>
                  A barra laranja mostra o período ativo. O apoio mostra a janela anterior.
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      width: 10,
                      height: 4,
                      borderRadius: 999,
                      background: KLOEL_THEME.accent,
                    }}
                  />
                  <span style={{ fontSize: 10, color: KLOEL_THEME.textTertiary }}>Atual</span>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      width: 10,
                      height: 4,
                      borderRadius: 999,
                      background: KLOEL_THEME.accentMedium,
                    }}
                  />
                  <span style={{ fontSize: 10, color: KLOEL_THEME.textTertiary }}>Anterior</span>
                </div>
              </div>
            </div>
            <RevenueBars
              labels={home?.series.labels || []}
              values={home?.series.revenueInCents || []}
              comparison={home?.series.previousRevenueInCents || []}
              compact={compact}
            />
          </Surface>

          <Surface style={{ padding: 18, position: 'relative', overflow: 'hidden' }}>
            <div
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(180deg, transparent 0%, transparent 40%, color-mix(in srgb, var(--app-accent) 7%, transparent) 100%)',
                pointerEvents: 'none',
              }}
            />
            <div style={{ position: 'relative' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  marginBottom: 14,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '.12em',
                      textTransform: 'uppercase',
                      color: KLOEL_THEME.textTertiary,
                      marginBottom: 6,
                    }}
                  >
                    Kloel no período
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    {home?.range.label || 'Período ativo'}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: KLOEL_THEME.success,
                  }}
                >
                  Ativo
                </span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 10,
                }}
              >
                {[
                  {
                    label: 'Conversas',
                    value: formatInteger(home?.metrics.totalConversations || 0),
                    tone: KLOEL_THEME.accent,
                  },
                  {
                    label: 'Pedidos aprovados',
                    value: formatInteger(home?.metrics.convertedOrders || 0),
                    tone: KLOEL_THEME.success,
                  },
                  {
                    label: 'Em atendimento',
                    value: formatInteger(home?.metrics.waitingForHuman || 0),
                    tone: KLOEL_THEME.warning,
                  },
                  {
                    label: 'Tempo de resposta',
                    value:
                      home?.metrics.averageResponseTimeSeconds &&
                      home.metrics.averageResponseTimeSeconds > 0
                        ? `${formatInteger(home.metrics.averageResponseTimeSeconds)}s`
                        : '—',
                    tone: KLOEL_THEME.textPrimary,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      borderRadius: 6,
                      border: `1px solid ${KLOEL_THEME.borderPrimary}`,
                      background: KLOEL_THEME.bgSecondary,
                      padding: 12,
                    }}
                  >
                    <div style={{ fontSize: 10, color: KLOEL_THEME.textTertiary, marginBottom: 4 }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: item.tone }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Surface>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: compact ? '1fr' : 'repeat(2, minmax(0, 1fr))',
            gap: 12,
          }}
        >
          <Surface style={{ padding: 18 }}>
            <div
              style={{
                display: 'flex',
                alignItems: compact ? 'flex-start' : 'center',
                justifyContent: 'space-between',
                flexDirection: compact ? 'column' : 'row',
                gap: 12,
                marginBottom: 16,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                    color: KLOEL_THEME.textTertiary,
                    marginBottom: 6,
                  }}
                >
                  Produtos
                </div>
                <div style={{ fontSize: 13, color: KLOEL_THEME.textSecondary }}>
                  Produtos que mais converteram em {activeRangeLabel.toLowerCase()}.
                </div>
              </div>
              <button
                type="button"
                onClick={() => router.push('/products')}
                style={HOME_HEADER_ACTION_BUTTON_STYLE}
              >
                Ver todos
              </button>
            </div>

            {home?.products?.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {home.products.map((product) => {
                  const statusLabel =
                    product.status === 'ACTIVE'
                      ? 'Ativo'
                      : product.status === 'DRAFT'
                        ? 'Rascunho'
                        : product.status;

                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => router.push(`/products/${product.id}`)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: 6,
                        border: `1px solid ${product.isTop ? KLOEL_THEME.accentMedium : KLOEL_THEME.borderPrimary}`,
                        background: KLOEL_THEME.bgSecondary,
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 6,
                            background: KLOEL_THEME.bgElevated,
                            border: `1px solid ${KLOEL_THEME.borderPrimary}`,
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: KLOEL_THEME.accent,
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            product.name.slice(0, 1).toUpperCase()
                          )}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              minWidth: 0,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 700,
                                color: KLOEL_THEME.textPrimary,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {product.name}
                            </span>
                            {product.isTop ? (
                              <span
                                style={{
                                  height: 20,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  padding: '0 8px',
                                  borderRadius: 999,
                                  background: KLOEL_THEME.accentLight,
                                  color: KLOEL_THEME.accent,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  flexShrink: 0,
                                }}
                              >
                                TOP
                              </span>
                            ) : null}
                          </div>
                          <div
                            style={{
                              marginTop: 4,
                              fontSize: 11,
                              color: KLOEL_THEME.textSecondary,
                            }}
                          >
                            {(product.category || 'Produto') + ' · ' + statusLabel} ·{' '}
                            {formatInteger(product.totalSales)} venda
                            {product.totalSales === 1 ? '' : 's'}
                          </div>
                        </div>
                      </div>
                      <div style={{ flexShrink: 0, textAlign: 'right' }}>
                        <div
                          style={{ fontSize: 14, fontWeight: 700, color: KLOEL_THEME.textPrimary }}
                        >
                          {formatCurrency(product.totalRevenueInCents)}
                        </div>
                        <div
                          style={{ fontSize: 10, color: KLOEL_THEME.textTertiary, marginTop: 4 }}
                        >
                          receita aprovada
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <EmptyState label="Nenhum produto com receita no período selecionado." />
            )}
          </Surface>

          <Surface style={{ padding: 18 }}>
            <div
              style={{
                display: 'flex',
                alignItems: compact ? 'flex-start' : 'center',
                justifyContent: 'space-between',
                flexDirection: compact ? 'column' : 'row',
                gap: 12,
                marginBottom: 16,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                    color: KLOEL_THEME.textTertiary,
                    marginBottom: 6,
                  }}
                >
                  Conversas recentes
                </div>
                <div style={{ fontSize: 13, color: KLOEL_THEME.textSecondary }}>
                  Fila mais recente do inbox com leitura rápida de status.
                </div>
              </div>
              <button
                type="button"
                onClick={() => router.push('/inbox')}
                style={HOME_HEADER_ACTION_BUTTON_STYLE}
              >
                Abrir inbox
              </button>
            </div>

            {home?.recentConversations?.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {home.recentConversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() =>
                      router.push(`/inbox?conversationId=${encodeURIComponent(conversation.id)}`)
                    }
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: 6,
                      border: `1px solid ${KLOEL_THEME.borderPrimary}`,
                      background: KLOEL_THEME.bgSecondary,
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          background: KLOEL_THEME.bgElevated,
                          border: `1px solid ${KLOEL_THEME.borderPrimary}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: KLOEL_THEME.accent,
                          fontWeight: 700,
                          flexShrink: 0,
                          overflow: 'hidden',
                        }}
                      >
                        {conversation.avatarUrl ? (
                          <img
                            src={conversation.avatarUrl}
                            alt={conversation.contactName}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          conversation.contactName
                            .split(' ')
                            .slice(0, 2)
                            .map((chunk) => chunk[0])
                            .join('')
                            .toUpperCase()
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: KLOEL_THEME.textPrimary,
                            marginBottom: 4,
                          }}
                        >
                          {conversation.contactName}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: KLOEL_THEME.textSecondary,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: compact ? '42vw' : '100%',
                          }}
                        >
                          {conversation.preview || 'Sem prévia de mensagem'}
                        </div>
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      <div
                        style={{ fontSize: 10, color: KLOEL_THEME.textTertiary, marginBottom: 6 }}
                      >
                        {formatRelativeTime(conversation.lastMessageAt)}
                      </div>
                      <StatusChip status={conversation.status} />
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState label="Nenhuma conversa recente para exibir." />
            )}
          </Surface>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: compact ? '1fr' : 'repeat(3, minmax(0, 1fr))',
            gap: 12,
          }}
        >
          <Surface style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 16 }}>
            <RingMeter
              percent={home?.health.operationalScorePct || 0}
              color={KLOEL_THEME.success}
            />
            <div style={{ flex: 1 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  marginBottom: 6,
                  flexWrap: 'wrap',
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                    color: KLOEL_THEME.textTertiary,
                  }}
                >
                  Saúde operacional
                </div>
                <button
                  type="button"
                  onClick={() => setHealthGuideOpen(true)}
                  style={{
                    height: 28,
                    padding: '0 10px',
                    borderRadius: 999,
                    border: `1px solid ${KLOEL_THEME.borderPrimary}`,
                    background: KLOEL_THEME.bgSecondary,
                    color: KLOEL_THEME.accent,
                    fontSize: 11,
                    fontWeight: 700,
                    fontFamily: FONT_SANS,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Como chegar a 100%
                </button>
              </div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                {formatOneDecimal(home?.health.operationalScorePct || 0, '%')}
              </div>
              <div style={{ fontSize: 11, color: KLOEL_THEME.textSecondary, marginTop: 4 }}>
                {formatInteger(home?.health.activeCheckpoints || 0)} de{' '}
                {formatInteger(home?.health.totalCheckpoints || 0)} checkpoints ativos
              </div>
            </div>
          </Surface>

          <Surface style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 16 }}>
            <RingMeter
              percent={home?.health.checkoutCompletionRatePct || 0}
              color={KLOEL_THEME.accent}
            />
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                  color: KLOEL_THEME.textTertiary,
                  marginBottom: 6,
                }}
              >
                Funil do checkout
              </div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                {formatOneDecimal(home?.health.checkoutCompletionRatePct || 0, '%')}
              </div>
              <div style={{ fontSize: 11, color: KLOEL_THEME.textSecondary, marginTop: 4 }}>
                conversão entre pedidos gerados e pagos
              </div>
            </div>
          </Surface>

          <Surface style={{ padding: 18 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                color: KLOEL_THEME.textTertiary,
                marginBottom: 12,
              }}
            >
              Ações rápidas
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                onClick={() => router.push('/products/new')}
                style={{
                  height: 42,
                  borderRadius: 6,
                  border: 'none',
                  background: KLOEL_THEME.accent,
                  color: KLOEL_THEME.textOnAccent,
                  fontFamily: FONT_SANS,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Novo produto
              </button>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => router.push('/products')}
                  style={{
                    height: 40,
                    borderRadius: 6,
                    border: `1px solid ${KLOEL_THEME.borderPrimary}`,
                    background: 'transparent',
                    color: KLOEL_THEME.textSecondary,
                    fontFamily: FONT_SANS,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Meus produtos
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/produtos/afiliar-se')}
                  style={{
                    height: 40,
                    borderRadius: 6,
                    border: `1px solid ${KLOEL_THEME.borderPrimary}`,
                    background: 'transparent',
                    color: KLOEL_THEME.textSecondary,
                    fontFamily: FONT_SANS,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Afiliar-se
                </button>
              </div>
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
}

export default HomeView;
