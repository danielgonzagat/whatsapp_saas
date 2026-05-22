'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { launchApi } from '@/lib/api/launch';
import { useState, useId } from 'react';

const SORA = "'Sora', sans-serif";
const EMBER = colors.ember.primary;

interface AddGroupModalProps {
  launcherId: string;
  onClose: () => void;
  onAdded: () => void;
}

export function AddGroupModal({ launcherId, onClose, onAdded }: AddGroupModalProps) {
  const fid = useId();
  const [groupLink, setGroupLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!groupLink.trim()) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await launchApi.addGroups(launcherId, { groupLink: groupLink.trim() });
      if (res.error) {
        throw new Error(res.error);
      }
      onAdded();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao adicionar grupo');
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
          {kloelT(`Adicionar Grupo`)}
        </h2>
        <p
          style={{
            fontFamily: SORA,
            fontSize: 13,
            color: 'var(--app-text-secondary)',
            margin: '0 0 24px',
          }}
        >
          {kloelT(`Cole o link de convite do grupo WhatsApp.`)}
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
          htmlFor={`${fid}-link`}
        >
          {kloelT(`Link do grupo *`)}
        </label>
        <input
          type="url"
          value={groupLink}
          onChange={(e) => setGroupLink(e.target.value)}
          placeholder="https://chat.whatsapp.com/..."
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
            boxSizing: 'border-box' as const,
          }}
          id={`${fid}-link`}
        />

        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: '10px 14px',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 6,
              color: colors.semantic.error,
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
            disabled={loading || !groupLink.trim()}
            style={{
              padding: '9px 22px',
              background: EMBER,
              border: 'none',
              borderRadius: 6,
              color: colors.text.silver,
              fontFamily: SORA,
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
              opacity: !groupLink.trim() ? 0.5 : 1,
            }}
          >
            {loading ? 'Adicionando...' : 'Adicionar'}
          </button>
        </div>
      </div>
    </div>
  );
}
