'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
/** Dynamic. */
export const dynamic = 'force-dynamic';

import { Card } from '@/components/kloel/Card';
import { ContextualEmptyState } from '@/components/kloel/EmptyStates';
import { SectionPage } from '@/components/kloel/SectionPage';
import {
  type ScrapingJob,
  createScraperJob,
  importScraperResults,
  useScrapers,
} from '@/hooks/useScrapers';
import { useRouter } from 'next/navigation';
import { useId, useMemo, useState } from 'react';

const STATUS_COLORS: Record<string, string> = {
  RUNNING:
    '#3B82F6' /* PULSE_VISUAL_OK: info blue, non-Monitor status indicator */ /* PULSE_VISUAL_OK: info blue, non-Monitor status indicator */,
  COMPLETED:
    '#10B981' /* PULSE_VISUAL_OK: success emerald, non-Monitor status indicator */ /* PULSE_VISUAL_OK: success emerald, non-Monitor status indicator */,
  FAILED:
    '#EF4444' /* PULSE_VISUAL_OK: error/danger red, non-Monitor status indicator */ /* PULSE_VISUAL_OK: error/danger red, non-Monitor status indicator */,
  PENDING:
    '#F59E0B' /* PULSE_VISUAL_OK: warning amber, non-Monitor status indicator */ /* PULSE_VISUAL_OK: warning amber, non-Monitor status indicator */,
};

const TYPE_LABELS: Record<string, string> = {
  MAPS: 'Google Maps',
  INSTAGRAM: 'Instagram',
  GROUP: 'Grupo WhatsApp',
};

const SORA = "'Sora', sans-serif";

function JobRow({
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
        borderBottom: '1px solid colors.border.space',
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
            fontFamily: SORA,
          }}
        >
          {job.query}
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--app-text-secondary)',
            marginTop: 2,
            fontFamily: SORA,
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
          fontFamily: SORA,
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
              : '#fff' /* PULSE_VISUAL_OK: universal white shorthand */ /* PULSE_VISUAL_OK: universal white shorthand */,
            fontSize: 12,
            fontFamily: SORA,
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

interface NewJobForm {
  type: 'MAPS' | 'INSTAGRAM' | 'GROUP';
  query: string;
  location: string;
}

function NewJobModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const fid = useId();
  const [form, setForm] = useState<NewJobForm>({ type: 'MAPS', query: '', location: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!form.query.trim()) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await createScraperJob({
        type: form.type,
        query: form.query.trim(),
        location: form.location.trim() || undefined,
      });
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar job');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar modal"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
        }}
      />
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 440,
          background: 'var(--app-bg-card)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          padding: 28,
        }}
      >
        <h2
          style={{
            fontFamily: SORA,
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--app-text-primary)',
            margin: '0 0 4px',
          }}
        >
          {kloelT(`Novo Job de Scraping`)}
        </h2>
        <p
          style={{
            fontFamily: SORA,
            fontSize: 13,
            color: 'var(--app-text-secondary)',
            margin: '0 0 24px',
          }}
        >
          {kloelT(`Configure a coleta de leads automatica.`)}
        </p>

        <label
          style={{
            fontFamily: SORA,
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--app-text-secondary)',
            display: 'block',
            marginBottom: 6,
          }}
          htmlFor={`${fid}-scraping-type`}
        >
          {kloelT(`Tipo de scraping`)}
        </label>
        <select
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value as NewJobForm['type'] })}
          style={{
            width: '100%',
            padding: '10px 14px',
            background: 'var(--app-bg-primary)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            color: 'var(--app-text-primary)',
            fontFamily: SORA,
            fontSize: 13,
            outline: 'none',
            marginBottom: 16,
            boxSizing: 'border-box',
          }}
          id={`${fid}-scraping-type`}
        >
          <option value="MAPS">{kloelT(`Google Maps`)}</option>
          <option value="INSTAGRAM">{kloelT(`Instagram`)}</option>
          <option value="GROUP">{kloelT(`Grupo WhatsApp`)}</option>
        </select>

        <label
          style={{
            fontFamily: SORA,
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--app-text-secondary)',
            display: 'block',
            marginBottom: 6,
          }}
          htmlFor={`${fid}-query`}
        >
          {kloelT(`Busca / query *`)}
        </label>
        <input
          type="text"
          value={form.query}
          onChange={(e) => setForm({ ...form, query: e.target.value })}
          placeholder={
            form.type === 'MAPS'
              ? 'Ex: academias de ginastica'
              : form.type === 'INSTAGRAM'
                ? 'Ex: @fitnessbr'
                : 'Ex: link do grupo'
          }
          style={{
            width: '100%',
            padding: '10px 14px',
            background: 'var(--app-bg-primary)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            color: 'var(--app-text-primary)',
            fontFamily: SORA,
            fontSize: 13,
            outline: 'none',
            marginBottom: 16,
            boxSizing: 'border-box',
          }}
          id={`${fid}-query`}
        />

        {form.type === 'MAPS' && (
          <>
            <label
              style={{
                fontFamily: SORA,
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--app-text-secondary)',
                display: 'block',
                marginBottom: 6,
              }}
              htmlFor={`${fid}-location`}
            >
              {kloelT(`Localidade (opcional)`)}
            </label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder={kloelT(`Ex: Sao Paulo, SP`)}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'var(--app-bg-primary)',
                border: '1px solid var(--app-border-primary)',
                borderRadius: 6,
                color: 'var(--app-text-primary)',
                fontFamily: SORA,
                fontSize: 13,
                outline: 'none',
                marginBottom: 16,
                boxSizing: 'border-box',
              }}
              id={`${fid}-location`}
            />
          </>
        )}

        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: '10px 14px',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 6,
              color:
                '#EF4444' /* PULSE_VISUAL_OK: error/danger red, non-Monitor status indicator */ /* PULSE_VISUAL_OK: error/danger red, non-Monitor status indicator */,
              fontFamily: SORA,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '9px 18px',
              background: 'none',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              color: 'var(--app-text-secondary)',
              fontFamily: SORA,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {kloelT(`Cancelar`)}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !form.query.trim()}
            style={{
              padding: '9px 22px',
              background: colors.ember.primary,
              border: 'none',
              borderRadius: 6,
              color:
                '#fff' /* PULSE_VISUAL_OK: universal white shorthand */ /* PULSE_VISUAL_OK: universal white shorthand */,
              fontFamily: SORA,
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
              opacity: !form.query.trim() ? 0.5 : 1,
            }}
          >
            {loading ? 'Criando...' : 'Criar Job'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Scrapers page. */
import { ScrapersPage } from "./ScrapersPage";
