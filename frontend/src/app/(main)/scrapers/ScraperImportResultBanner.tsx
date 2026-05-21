'use client';
import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { useRouter } from 'next/navigation';

export function ScraperImportResultBanner({
  importResult,
}: {
  importResult: { jobId: string; imported: number } | null;
}) {
  const router = useRouter();

  if (!importResult) {
    return null;
  }

  return (
    <div
      style={{
        marginBottom: 16,
        padding: '12px 16px',
        background: 'rgba(16,185,129,0.08)',
        border: '1px solid rgba(16,185,129,0.3)',
        borderRadius: 6,
        color: colors.semantic.success,
        fontFamily: "'Sora', sans-serif",
        fontSize: 13,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <span>
          {importResult.imported} {kloelT(`leads importados com sucesso.`)}
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            onClick={() => router.push('/leads?source=scrapers')}
            style={{
              padding: '6px 12px',
              background: 'rgba(16,185,129,0.12)',
              border: '1px solid rgba(16,185,129,0.24)',
              borderRadius: 6,
              color: colors.semantic.success,
              fontFamily: "'Sora', sans-serif",
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {kloelT(`Ver leads`)}
          </button>
          <button
            type="button"
            onClick={() => router.push('/followups?source=scrapers')}
            style={{
              padding: '6px 12px',
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              color: 'var(--app-text-primary)',
              fontFamily: "'Sora', sans-serif",
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {kloelT(`Abrir follow-ups`)}
          </button>
          <button
            type="button"
            onClick={() => router.push('/flow?source=scrapers&purpose=acquisition&tab=editor')}
            style={{
              padding: '6px 12px',
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              color: 'var(--app-text-primary)',
              fontFamily: "'Sora', sans-serif",
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {kloelT(`Automatizar no Flow`)}
          </button>
        </div>
      </div>
    </div>
  );
}
