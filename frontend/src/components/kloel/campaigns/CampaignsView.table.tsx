'use client';

import { kloelT } from '@/lib/i18n/t';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import type { Campaign } from '@/lib/api/campaigns';

const SORA = "'Sora', sans-serif";
const MONO = "'JetBrains Mono', monospace";
const BG_CARD = KLOEL_THEME.bgCard;
const BG_ELEVATED = KLOEL_THEME.bgSecondary;
const BORDER = KLOEL_THEME.borderPrimary;
const TEXT_PRIMARY = KLOEL_THEME.textPrimary;
const TEXT_SECONDARY = KLOEL_THEME.textSecondary;
const TEXT_TERTIARY = KLOEL_THEME.textTertiary;
const ACCENT = KLOEL_THEME.accent;
const GREEN = KLOEL_THEME.success;
const BLUE = KLOEL_THEME.info;

function statusBadgeColor(status: string | undefined): string {
  const s = (status || 'DRAFT').toUpperCase();
  if (s === 'RUNNING') return BLUE;
  if (s === 'COMPLETED') return GREEN;
  if (s === 'SCHEDULED') return ACCENT;
  if (s === 'PAUSED') return TEXT_TERTIARY;
  return TEXT_TERTIARY;
}

interface CampaignsTableProps {
  campaigns: Campaign[];
  busyId: string | null;
  onLaunch: (id: string, smartTime?: boolean) => void;
  onPause: (id: string) => void;
}

export function CampaignsTable({ campaigns, busyId, onLaunch, onPause }: CampaignsTableProps) {
  return (
    <div
      style={{
        background: BG_CARD,
        borderRadius: 6,
        border: `1px solid ${BORDER}`,
        overflow: 'hidden',
      }}
    >
      {/* Table header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 2fr 1fr 1fr 1.5fr',
          padding: '10px 16px',
          borderBottom: `1px solid ${BORDER}`,
          background: BG_ELEVATED,
        }}
      >
        {['Status', 'Nome', 'Envios', 'Falhas', 'Ações'].map((h) => (
          <span
            key={h}
            style={{
              fontFamily: MONO,
              fontSize: 9,
              fontWeight: 600,
              color: TEXT_TERTIARY,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
            }}
          >
            {h}
          </span>
        ))}
      </div>
      {/* Rows */}
      {campaigns.map((c, i) => {
        const stats = (c.stats || {}) as Record<string, number>;
        const sent = stats.sent || 0;
        const failed = stats.failed || 0;
        const delivered = stats.delivered || 0;
        const status = (c.status || 'DRAFT').toUpperCase();
        const isRunning = status === 'RUNNING' || status === 'SCHEDULED';
        return (
          <div
            key={c.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 2fr 1fr 1fr 1.5fr',
              padding: '10px 16px',
              borderBottom: i < campaigns.length - 1 ? `1px solid ${BORDER}` : 'none',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontFamily: MONO,
                fontSize: 10,
                fontWeight: 600,
                color: statusBadgeColor(c.status),
              }}
            >
              {status}
            </span>
            <div>
              <span
                style={{
                  fontFamily: SORA,
                  fontSize: 13,
                  color: TEXT_PRIMARY,
                  display: 'block',
                }}
              >
                {c.name}
              </span>
              {c.messageTemplate && (
                <span
                  style={{
                    fontFamily: SORA,
                    fontSize: 10,
                    color: TEXT_TERTIARY,
                    display: 'block',
                    marginTop: 2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 300,
                  }}
                >
                  {c.messageTemplate}
                </span>
              )}
            </div>
            <span style={{ fontFamily: MONO, fontSize: 11, color: TEXT_PRIMARY }}>
              {c.status === 'COMPLETED' || c.status === 'RUNNING' ? sent : '--'}
            </span>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 11,
                color: c.status === 'COMPLETED' && failed > 0 ? ACCENT : TEXT_SECONDARY,
              }}
            >
              {c.status === 'COMPLETED' || c.status === 'RUNNING'
                ? `${failed}${delivered > 0 ? ` (${Math.round((failed / (sent || 1)) * 100)}%)` : ''}`
                : '--'}
            </span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {isRunning ? (
                <button
                  type="button"
                  onClick={() => onPause(c.id)}
                  disabled={!!busyId}
                  style={{
                    background: 'transparent',
                    color: TEXT_SECONDARY,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 6,
                    padding: '4px 10px',
                    fontSize: 11,
                    fontFamily: SORA,
                    cursor: busyId ? 'wait' : 'pointer',
                  }}
                >
                  {busyId === `pause-${c.id}` ? '...' : kloelT('Pausar')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onLaunch(c.id)}
                  disabled={!!busyId}
                  style={{
                    background: ACCENT,
                    color: '#0A0A0C',
                    border: 'none',
                    borderRadius: 6,
                    padding: '4px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily: SORA,
                    cursor: busyId ? 'wait' : 'pointer',
                  }}
                >
                  {busyId === `launch-${c.id}` ? '...' : kloelT('Lançar')}
                </button>
              )}
              {!isRunning && status !== 'COMPLETED' && status !== 'PAUSED' && (
                <button
                  type="button"
                  onClick={() => onLaunch(c.id, true)}
                  disabled={!!busyId}
                  style={{
                    background: 'transparent',
                    color: BLUE,
                    border: `1px solid ${BLUE}`,
                    borderRadius: 6,
                    padding: '4px 10px',
                    fontSize: 11,
                    fontFamily: SORA,
                    cursor: busyId ? 'wait' : 'pointer',
                  }}
                >
                  {kloelT('Smart')}
                </button>
              )}
              {c.scheduledAt && (
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 9,
                    color: TEXT_TERTIARY,
                    alignSelf: 'center',
                  }}
                  title={new Date(c.scheduledAt).toLocaleString()}
                >
                  {new Date(c.scheduledAt).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
