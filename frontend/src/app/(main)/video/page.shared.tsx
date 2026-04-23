import { kloelT } from '@/lib/i18n/t';
import type { CSSProperties } from 'react';

/** Video job shape. */
export interface VideoJob {
  /** Id property. */
  id: string;
  /** Status property. */
  status: string;
  /** Input url property. */
  inputUrl?: string;
  /** Prompt property. */
  prompt?: string;
  /** Output url property. */
  outputUrl?: string;
  /** Created at property. */
  createdAt: string;
}

/** Tab type. */
export type Tab = 'jobs' | 'create' | 'voice' | 'media';

/** Status_colors. */
export const STATUS_COLORS: Record<string, string> = {
  PROCESSING: 'var(--app-info)',
  COMPLETED: 'var(--app-success)',
  FAILED: 'var(--app-error)',
  PENDING: 'var(--app-warning)',
};

/** Input style. */
export const inputStyle: CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--app-border-primary)',
  borderRadius: 6,
  padding: '9px 12px',
  color: 'var(--app-text-primary)',
  fontSize: 13,
  fontFamily: "'Sora', sans-serif",
  outline: 'none',
  boxSizing: 'border-box',
};

/** Btn primary. */
export const btnPrimary: CSSProperties = {
  background: 'var(--app-accent)',
  color: 'var(--app-text-on-accent)',
  border: 'none',
  borderRadius: 6,
  padding: '9px 20px',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "'Sora', sans-serif",
  whiteSpace: 'nowrap',
};

/** Btn secondary. */
export const btnSecondary: CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  color: 'var(--app-text-primary)',
  border: '1px solid var(--app-border-primary)',
  borderRadius: 6,
  padding: '9px 20px',
  cursor: 'pointer',
  fontSize: 13,
  fontFamily: "'Sora', sans-serif",
  whiteSpace: 'nowrap',
};

/** Video job row. */
export function VideoJobRow({
  job,
  onRefresh,
}: {
  job: VideoJob;
  onRefresh: (id: string) => void;
}) {
  const status = job.status?.toUpperCase() || 'PENDING';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '14px 16px',
        borderBottom: '1px solid var(--app-border-primary)',
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: 6,
          background: STATUS_COLORS[status] || 'var(--app-text-secondary)',
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
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {job.prompt || job.inputUrl || 'Video job'}
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--app-text-secondary)',
            marginTop: 2,
            fontFamily: "'Sora', sans-serif",
          }}
        >
          {status.toLowerCase()}
          {job.outputUrl && (
            <>
              {' · '}
              <a
                href={job.outputUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--app-accent)' }}
              >
                {kloelT(`ver output`)}
              </a>
            </>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div
          style={{
            fontSize: 11,
            color: 'var(--app-text-tertiary)',
            fontFamily: "'Sora', sans-serif",
          }}
        >
          {new Date(job.createdAt).toLocaleDateString('pt-BR')}
        </div>
        {(status === 'PROCESSING' || status === 'PENDING') && (
          <button
            type="button"
            onClick={() => onRefresh(job.id)}
            style={{ ...btnSecondary, padding: '4px 10px', fontSize: 11 }}
          >
            {kloelT(`Atualizar`)}
          </button>
        )}
      </div>
    </div>
  );
}
