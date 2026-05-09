'use client';

import { kloelT } from '@/lib/i18n/t';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import { useDashboardHome } from '@/hooks/useDashboardHome';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import type { DashboardHomePeriod } from '@/lib/api/home';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { useMemo, useState } from 'react';
import HomeKpiTiles from './HomeKpiTiles';
import HomeRecentActivity from './HomeRecentActivity';

const S_RE = /\s+/;

const FONT_SANS = "'Sora', sans-serif";
const FONT_MONO = "'JetBrains Mono', monospace";

const PERIOD_OPTIONS: Array<{ key: DashboardHomePeriod; label: string }> = [
  { key: 'today', label: 'Hoje' },
  { key: '30d', label: '30 dias' },
  { key: 'custom', label: 'Personalizado' },
];

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

function Surface({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: KLOEL_THEME.bgCard,
        border: `1px solid ${KLOEL_THEME.borderPrimary}`,
        borderRadius: 6,
        padding: 20,
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

export function HomeView() {
  const { userName } = useAuth();
  const { isMobile, isTablet } = useResponsiveViewport();
  const [period, setPeriod] = useState<DashboardHomePeriod>('30d');
  const [rangePopoverOpen, setRangePopoverOpen] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

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
          compact={compact}
          activeRangeLabel={activeRangeLabel}
        />
      </div>
    </div>
  );
}

export default HomeView;
