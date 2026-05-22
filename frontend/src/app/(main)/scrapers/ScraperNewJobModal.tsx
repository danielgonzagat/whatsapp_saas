'use client';
import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { createScraperJob } from '@/hooks/useScrapers';
import { useId, useState } from 'react';

interface NewJobForm {
  type: 'MAPS' | 'INSTAGRAM' | 'GROUP';
  query: string;
  location: string;
}

export function ScraperNewJobModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
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
      const loc = form.location.trim() || undefined;
      await createScraperJob({
        type: form.type,
        query: form.query.trim(),
        ...(loc !== undefined ? { location: loc } : {}),
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
            fontFamily: "'Sora', sans-serif",
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
            fontFamily: "'Sora', sans-serif",
            fontSize: 13,
            color: 'var(--app-text-secondary)',
            margin: '0 0 24px',
          }}
        >
          {kloelT(`Configure a coleta de leads automatica.`)}
        </p>

        <label
          style={{
            fontFamily: "'Sora', sans-serif",
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
            fontFamily: "'Sora', sans-serif",
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
            fontFamily: "'Sora', sans-serif",
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
            fontFamily: "'Sora', sans-serif",
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
                fontFamily: "'Sora', sans-serif",
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
                fontFamily: "'Sora', sans-serif",
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
              color: colors.semantic.error,
              fontFamily: "'Sora', sans-serif",
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
              fontFamily: "'Sora', sans-serif",
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
              color: colors.text.silver,
              fontFamily: "'Sora', sans-serif",
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
