'use client';
import { kloelT } from '@/lib/i18n/t';

import type { ScrapingJob } from '@/hooks/useScrapers';
import { useRouter } from 'next/navigation';

export function ScraperFilterBar({
  typeFilter,
  statusFilter,
  onTypeFilterChange,
  onStatusFilterChange,
}: {
  typeFilter: 'ALL' | ScrapingJob['type'];
  statusFilter: 'ALL' | string;
  onTypeFilterChange: (v: 'ALL' | ScrapingJob['type']) => void;
  onStatusFilterChange: (v: 'ALL' | string) => void;
}) {
  const router = useRouter();
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) auto auto auto auto',
        gap: 12,
        marginBottom: 16,
      }}
    >
      <div />
      <select
        value={typeFilter}
        onChange={(e) => onTypeFilterChange(e.target.value as 'ALL' | ScrapingJob['type'])}
        style={{
          padding: '10px 14px',
          background: 'var(--app-bg-card)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          color: 'var(--app-text-primary)',
          fontFamily: "'Sora', sans-serif",
          fontSize: 12,
          outline: 'none',
        }}
      >
        <option value="ALL">{kloelT(`Todos os tipos`)}</option>
        <option value="MAPS">{kloelT(`Google Maps`)}</option>
        <option value="INSTAGRAM">{kloelT(`Instagram`)}</option>
        <option value="GROUP">{kloelT(`Grupo WhatsApp`)}</option>
      </select>
      <select
        value={statusFilter}
        onChange={(e) => onStatusFilterChange(e.target.value)}
        style={{
          padding: '10px 14px',
          background: 'var(--app-bg-card)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          color: 'var(--app-text-primary)',
          fontFamily: "'Sora', sans-serif",
          fontSize: 12,
          outline: 'none',
        }}
      >
        <option value="ALL">{kloelT(`Todos os status`)}</option>
        <option value="PENDING">{kloelT(`Pendentes`)}</option>
        <option value="RUNNING">{kloelT(`Executando`)}</option>
        <option value="COMPLETED">{kloelT(`Concluídos`)}</option>
        <option value="FAILED">{kloelT(`Falhos`)}</option>
      </select>
      <button
        type="button"
        onClick={() => router.push('/leads')}
        style={{
          padding: '10px 14px',
          background: 'var(--app-bg-card)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          color: 'var(--app-text-secondary)',
          fontFamily: "'Sora', sans-serif",
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {kloelT(`Abrir Leads`)}
      </button>
      <button
        type="button"
        onClick={() => router.push('/flow')}
        style={{
          padding: '10px 14px',
          background: 'var(--app-bg-card)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          color: 'var(--app-text-secondary)',
          fontFamily: "'Sora', sans-serif",
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {kloelT(`Abrir Flow`)}
      </button>
    </div>
  );
}
