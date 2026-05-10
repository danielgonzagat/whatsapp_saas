'use client';
import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { Card } from '@/components/kloel/Card';

export function VideoCreateTab({
  createUrl,
  createPrompt,
  creating,
  createError,
  createSuccess,
  onUrlChange,
  onPromptChange,
  onCreate,
}: {
  createUrl: string;
  createPrompt: string;
  creating: boolean;
  createError: string | null;
  createSuccess: string | null;
  onUrlChange: (v: string) => void;
  onPromptChange: (v: string) => void;
  onCreate: () => void;
}) {
  const inputStyle: React.CSSProperties = {
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

  return (
    <Card>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <p
            style={{
              color: 'var(--app-text-secondary)',
              fontSize: 11,
              fontFamily: "'Sora', sans-serif",
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            {kloelT(`URL do video de entrada (opcional)`)}
          </p>
          <input
            aria-label="URL do video de entrada"
            type="url"
            value={createUrl}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="https://..."
            style={inputStyle}
          />
        </div>
        <div>
          <p
            style={{
              color: 'var(--app-text-secondary)',
              fontSize: 11,
              fontFamily: "'Sora', sans-serif",
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            {kloelT(`Prompt / instrucao para a IA`)}
          </p>
          <textarea
            value={createPrompt}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder={kloelT(`Descreva o video que deseja gerar...`)}
            rows={4}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>
        {createError && (
          <div
            style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 6,
              padding: '10px 14px',
              color: colors.semantic.error,
              fontSize: 13,
            }}
          >
            {createError}
          </div>
        )}
        {createSuccess && (
          <div
            style={{
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.2)',
              borderRadius: 6,
              padding: '10px 14px',
              color: colors.semantic.success,
              fontSize: 13,
            }}
          >
            {createSuccess}
          </div>
        )}
        <button
          type="button"
          onClick={onCreate}
          disabled={creating || (!createUrl.trim() && !createPrompt.trim())}
          style={{
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
            opacity: creating || (!createUrl.trim() && !createPrompt.trim()) ? 0.5 : 1,
          }}
        >
          {creating ? 'Criando...' : 'Criar Job de Video'}
        </button>
      </div>
    </Card>
  );
}
