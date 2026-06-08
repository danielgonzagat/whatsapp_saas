'use client';
import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { Card } from '@/components/kloel/Card';
import { STATUS_COLORS } from './page.shared';
function isValidHttpMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}


export function MediaProcessingTab({
  mediaUrl,
  mediaPrompt,
  mediaType,
  processingMedia,
  mediaJobId,
  mediaStatus,
  mediaError,
  onMediaUrlChange,
  onMediaPromptChange,
  onMediaTypeChange,
  onProcess,
  onCheck,
}: {
  mediaUrl: string;
  mediaPrompt: string;
  mediaType: string;
  processingMedia: boolean;
  mediaJobId: string | null;
  mediaStatus: string | null;
  mediaError: string | null;
  onMediaUrlChange: (v: string) => void;
  onMediaPromptChange: (v: string) => void;
  onMediaTypeChange: (v: string) => void;
  onProcess: () => void;
  onCheck: () => void;
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

  const trimmedMediaUrl = mediaUrl.trim();
  const mediaUrlInvalid = Boolean(trimmedMediaUrl) && !isValidHttpMediaUrl(trimmedMediaUrl);
  const canProcessMedia = Boolean(trimmedMediaUrl) && !mediaUrlInvalid;

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
            {kloelT(`Fluxo de media`)}
          </p>
          <select
            id="media-processing-type"
            name="media-processing-type"
            aria-label={kloelT('Tipo de processamento de midia')}
            value={mediaType}
            onChange={(e) => onMediaTypeChange(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value="video">{kloelT(`Video a partir de imagem`)}</option>
          </select>
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
            {kloelT(`URL da imagem`)}
          </p>
          <input
            id="media-processing-url"
            name="media-processing-url"
            aria-label="URL da imagem de entrada"
            type="url"
            value={mediaUrl}
            onChange={(e) => onMediaUrlChange(e.target.value)}
            placeholder="https://..."
            aria-invalid={mediaUrlInvalid ? 'true' : undefined}
            style={{
              ...inputStyle,
              borderColor: mediaUrlInvalid ? 'rgba(239,68,68,0.45)' : 'var(--app-border-primary)',
            }}
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
            {kloelT(`Prompt opcional`)}
          </p>
          <textarea
            id="media-processing-prompt"
            name="media-processing-prompt"
            aria-label={kloelT('Prompt para processar midia')}
            value={mediaPrompt}
            onChange={(e) => onMediaPromptChange(e.target.value)}
            placeholder={kloelT(`Descreva o processamento desejado...`)}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>
        {mediaUrlInvalid && (
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
            {kloelT(`Informe uma URL http(s) valida antes de gerar video.`)}
          </div>
        )}
        {mediaError && (
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
            {mediaError}
          </div>
        )}
        {mediaJobId && (
          <div
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div
                style={{
                  color: 'var(--app-text-primary)',
                  fontSize: 12,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                {kloelT(`Job:`)} {mediaJobId}
              </div>
              <div
                style={{
                  color: STATUS_COLORS[mediaStatus?.toUpperCase() || 'PENDING'] || colors.text.muted,
                  fontSize: 12,
                  marginTop: 2,
                }}
              >
                {mediaStatus || 'PENDING'}
              </div>
            </div>
            <button
              type="button"
              onClick={onCheck}
              style={{
                background: 'rgba(255,255,255,0.04)',
                color: 'var(--app-text-primary)',
                border: '1px solid var(--app-border-primary)',
                borderRadius: 6,
                padding: '4px 10px',
                cursor: 'pointer',
                fontSize: 11,
                fontFamily: "'Sora', sans-serif",
                whiteSpace: 'nowrap',
              }}
            >
              {kloelT(`Verificar status`)}
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={onProcess}
          disabled={processingMedia || !canProcessMedia}
          style={{
            background: 'var(--app-accent)',
            color: 'var(--app-text-on-accent)',
            border: 'none',
            borderRadius: 6,
            padding: '9px 20px',
            cursor: processingMedia || !canProcessMedia ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "'Sora', sans-serif",
            whiteSpace: 'nowrap',
            opacity: processingMedia || !canProcessMedia ? 0.5 : 1,
          }}
        >
          {processingMedia ? 'Processando...' : 'Gerar Video'}
        </button>
      </div>
    </Card>
  );
}
