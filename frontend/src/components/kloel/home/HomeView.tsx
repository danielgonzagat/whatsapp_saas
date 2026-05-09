'use client';

import { kloelT } from '@/lib/i18n/t';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import { useDashboardHome } from '@/hooks/useDashboardHome';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import type {
  DashboardHomePeriod,
} from '@/lib/api/home';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import HomeKpiTiles from './HomeKpiTiles';
import HomeRecentActivity from './HomeRecentActivity';

const S_RE = /\s+/;


const PERIOD_OPTIONS: Array<{ key: DashboardHomePeriod; label: string }> = [
  { key: 'today', label: 'Hoje' },
  { key: '30d', label: '30 dias' },
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

function getGreeting(referenceDate?: Date | null) {
  if (!referenceDate) {
    return 'Olá';
  }

  const hour = referenceDate.getHours();
  if (hour >= 5 && hour < 12) {
    return 'Bom dia';
  }
  if (hour >= 12 && hour < 18) {
    return 'Boa tarde';
  }
  if (hour >= 18) {
    return 'Boa noite';
  }
  return 'Boa madrugada';
}

function parseReferenceDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const HOME_REFERENCE_DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

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
    if (!data.length) {
      return '';
    }
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
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
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
      aria-hidden="true"
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
            key={label}
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

        {kloelT(`Convertida`)}
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

        {kloelT(`Aguardando`)}
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

type HeroTile = {
  label: string;
  value: string;
  meta: string;
  tone: string;
};

function HeroTilesGrid({ tiles, compact }: { tiles: HeroTile[]; compact: boolean }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: compact ? '1fr 1fr' : 'repeat(2, minmax(0, 1fr))',
        gap: 10,
      }}
    >
      {tiles.map((item) => (
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
          <div style={{ marginTop: 6, fontSize: 11, color: KLOEL_THEME.textSecondary }}>
            {item.meta}
          </div>
        </div>
      ))}
    </div>
  );
}

type MetricTile = {
  label: string;
  value: string;
  tone: string;
  delta: string;
  series: number[];
};

function MetricsRow({ items, isLoading }: { items: MetricTile[]; isLoading: boolean }) {
  return (
    <>
      {items.map((item) => (
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
    </>
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
              {kloelT(`Saúde operacional`)}
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: KLOEL_THEME.textPrimary,
                marginBottom: 6,
              }}
            >
              {kloelT(`Como alcançar 100%`)}
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                lineHeight: 1.7,
                color: KLOEL_THEME.textSecondary,
              }}
            >
              {kloelT(
                `O score sobe conforme estes checkpoints reais do workspace ficam ativos no período.`,
              )}
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

/** Home view. */
export function HomeView() {
  const router = useRouter();
  const { userName } = useAuth();
  const { isMobile, isTablet } = useResponsiveViewport();
  const [period, setPeriod] = useState<DashboardHomePeriod>('30d');
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
      .split(S_RE)[0] || 'Daniel';
  const referenceDate = useMemo(
    () => parseReferenceDate(home?.generatedAt || home?.range.endDate || null),
    [home?.generatedAt, home?.range.endDate],
  );
  const greeting = getGreeting(referenceDate);
  const formattedReferenceDate = useMemo(
    () => (referenceDate ? HOME_REFERENCE_DATE_FORMATTER.format(referenceDate) : ''),
    [referenceDate],
  );
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
      data-testid="home-dashboard-root"
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
            overflow: rangePopoverOpen ? 'visible' : 'hidden',
            position: 'relative',
            zIndex: rangePopoverOpen ? 40 : 'auto',
          }}
        >
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
                {formattedReferenceDate || 'Painel operacional'}
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
                {kloelT(`Operação, receita e conversas em um único plano de controle.`)}
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
                <span>{kloelT(`Período ativo:`)}</span>
                <span style={{ color: KLOEL_THEME.textPrimary, fontWeight: 600 }}>
                  {activeRangeLabel}
                </span>
              </div>
            </div>
          </div>

          {rangePopoverOpen && (
            <div
              style={{
                position: compact ? 'relative' : 'absolute',
                top: compact ? undefined : 86,
                right: compact ? undefined : 24,
                marginTop: compact ? 18 : 0,
                width: compact ? '100%' : 360,
                maxWidth: 'min(100%, 360px)',
                borderRadius: 6,
                border: `1px solid ${KLOEL_THEME.borderPrimary}`,
                background: KLOEL_THEME.bgCard,
                boxShadow: KLOEL_THEME.shadowLg,
                padding: 16,
                boxSizing: 'border-box',
                overflow: 'hidden',
                zIndex: 120,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
                {kloelT(`Período personalizado`)}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: compact ? '1fr' : 'repeat(2, minmax(0, 1fr))',
                  gap: 12,
                  alignItems: 'start',
                }}
              >
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: 11, color: KLOEL_THEME.textTertiary }}>
                    {kloelT(`De`)}
                  </span>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(event) => setCustomStartDate(event.target.value)}
                    style={{
                      width: '100%',
                      minWidth: 0,
                      maxWidth: '100%',
                      boxSizing: 'border-box',
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
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: 11, color: KLOEL_THEME.textTertiary }}>
                    {kloelT(`Até`)}
                  </span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(event) => setCustomEndDate(event.target.value)}
                    style={{
                      width: '100%',
                      minWidth: 0,
                      maxWidth: '100%',
                      boxSizing: 'border-box',
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
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 8,
                  marginTop: 14,
                }}
              >
                <button
                  type="button"
                  onClick={() => setRangePopoverOpen(false)}
                  style={{
                    width: '100%',
                    minWidth: 0,
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
                  {kloelT(`Fechar`)}
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
                    width: '100%',
                    minWidth: 0,
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
                  {kloelT(`Aplicar`)}
                </button>
              </div>
            </div>
          )}
        </Surface>

        <HomeKpiTiles
          home={home}
          isLoading={isLoading}
          compact={compact}
          activeRangeLabel={activeRangeLabel}
        />

        <HomeRecentActivity
          home={home}
          isLoading={isLoading}
          compact={compact}
          activeRangeLabel={activeRangeLabel}
        />
      </div>
    </div>
  );
}

export default HomeView;
