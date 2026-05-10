'use client';
import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import type { ScrapingJob } from '@/hooks/useScrapers';

const STATUS_COLORS: Record<string, string> = {
  RUNNING: colors.semantic.info,
  COMPLETED: colors.semantic.success,
  FAILED: colors.semantic.error,
  PENDING: colors.semantic.warning,
};

const TYPE_LABELS: Record<string, string> = {
  MAPS: 'Google Maps',
  INSTAGRAM: 'Instagram',
  GROUP: 'Grupo WhatsApp',
};

export function ScraperJobRow({
  job,
  onImport,
  importing,
}: {
  job: ScrapingJob;
  onImport: (id: string) => void;
  importing: boolean;
}) {
  const status = job.status?.toUpperCase() || 'PENDING';
  const canImport = status === 'COMPLETED';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '14px 16px',
        borderBottom: '1px solid var(--border-space)',
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: STATUS_COLORS[status] || colors.text.muted,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--app-text-primary)',
            fontFamily: "'Sora', sans-serif",
          }}
        >
          {job.query}
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--app-text-secondary)',
            marginTop: 2,
            fontFamily: "'Sora', sans-serif",
          }}
        >
          {TYPE_LABELS[job.type] || job.type} {kloelT(`&middot;`)} {status.toLowerCase()}
          {job.resultsCount != null && ` \u00B7 ${job.resultsCount} resultados`}
        </div>
      </div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--app-text-tertiary)',
          fontFamily: "'Sora', sans-serif",
          whiteSpace: 'nowrap',
        }}
      >
        {new Date(job.createdAt).toLocaleDateString('pt-BR')}
      </div>
      {canImport && (
        <button
          type="button"
          onClick={() => onImport(job.id)}
          disabled={importing}
          style={{
            padding: '6px 14px',
            background: importing ? colors.background.elevated : colors.ember.primary,
            border: 'none',
            borderRadius: 6,
            color: importing
              ? colors.text.muted
              : colors.text.silver,
            fontSize: 12,
            fontFamily: "'Sora', sans-serif",
            fontWeight: 600,
            cursor: importing ? 'wait' : 'pointer',
            whiteSpace: 'nowrap',
            transition: 'background 150ms ease',
          }}
        >
          {importing ? 'Importando...' : 'Importar'}
        </button>
      )}
    </div>
  );
}
