'use client';

import { kloelT } from '@/lib/i18n/t';
import { neuroCrmApi } from '@/lib/api/crm';
import { useCallback, useState } from 'react';
import { Brain, Zap } from 'lucide-react';

interface NeuroResult {
  action?: string;
  reason?: string;
  suggestedMessage?: string;
}

interface ContactNeuroSectionProps {
  contactId: string;
  onMutate: () => void;
}

const C = {
  bg: 'var(--bg-void, #0A0A0C)',
  elevated: 'var(--bg-elevated, #19191C)',
  border: 'var(--border-space, #222226)',
  accent: '#E85D30',
  text: 'var(--text-silver, #E0DDD8)',
  muted: 'var(--text-muted, #6E6E73)',
  sora: "var(--font-sora), 'Sora', sans-serif",
} as const;

export function ContactNeuroSection({ contactId, onMutate }: ContactNeuroSectionProps) {
  const [neuroLoading, setNeuroLoading] = useState(false);
  const [neuroResult, setNeuroResult] = useState<NeuroResult | null>(null);
  const [neuroError, setNeuroError] = useState<string | null>(null);

  const handleAnalyze = useCallback(async () => {
    if (!contactId) {
      return;
    }
    setNeuroLoading(true);
    setNeuroError(null);
    setNeuroResult(null);
    try {
      const nbaRes = await neuroCrmApi.nextBestAction(contactId);
      const nba = nbaRes.data as NeuroResult | undefined;
      setNeuroResult(nba ?? null);
      onMutate();
    } catch (err) {
      setNeuroError(err instanceof Error ? err.message : 'Falha na análise');
    } finally {
      setNeuroLoading(false);
    }
  }, [contactId, onMutate]);

  return (
    <>
      <button
        type="button"
        onClick={handleAnalyze}
        disabled={neuroLoading || !contactId}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: C.accent,
          border: 'none',
          borderRadius: 6,
          padding: '7px 14px',
          fontSize: 12,
          fontWeight: 600,
          cursor: neuroLoading || !contactId ? 'not-allowed' : 'pointer',
          color: '#fff',
          opacity: neuroLoading || !contactId ? 0.6 : 1,
          fontFamily: C.sora,
          marginBottom: 10,
        }}
      >
        <Brain size={13} aria-hidden="true" />
        {neuroLoading ? 'Analisando...' : 'Analisar com IA'}
      </button>
      {neuroError && (
        <p style={{ fontSize: 12, color: '#FF453A', margin: '0 0 8px' }}>{neuroError}</p>
      )}
      {neuroResult && (
        <div
          style={{
            background: C.elevated,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: '10px 12px',
          }}
        >
          {neuroResult.action && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Zap size={12} style={{ color: C.accent, flexShrink: 0 }} aria-hidden="true" />
              <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
                {neuroResult.action}
              </span>
            </div>
          )}
          {neuroResult.reason && (
            <p style={{ fontSize: 11, color: C.muted, margin: '0 0 6px', lineHeight: 1.5 }}>
              {neuroResult.reason}
            </p>
          )}
          {neuroResult.suggestedMessage && (
            <div
              style={{
                background: C.bg,
                borderRadius: 4,
                padding: '6px 8px',
                fontSize: 11,
                color: C.text,
                lineHeight: 1.5,
              }}
            >
              {neuroResult.suggestedMessage}
            </div>
          )}
        </div>
      )}
      {!neuroResult && !neuroError && !neuroLoading && (
        <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>
          {kloelT(
            'Clique em "Analisar" para obter a proxima melhor acao para este contato.',
          )}
        </p>
      )}
    </>
  );
}
